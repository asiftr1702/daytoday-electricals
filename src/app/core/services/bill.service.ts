import { Injectable, inject, signal, computed } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  doc,
  deleteDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable, from, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { Bill, BillItem, BillReturn } from '../models/bill.model';
import { SalesService } from './sales.service';
import { FirebaseAdminService } from './firebase-admin.service';
import { StampService } from './stamp.service';
import { SaleEntry } from '../models/sale.model';

@Injectable({ providedIn: 'root' })
export class BillService {
  private readonly firestore = inject(Firestore);
  private readonly salesService = inject(SalesService);
  private readonly firebaseAdmin = inject(FirebaseAdminService);
  private readonly stampService = inject(StampService);
  private readonly COLLECTION = 'bills';

  // ─── In-memory current bill (cart) ─────────────────────────────────────
  readonly currentItems = signal<BillItem[]>([]);
  readonly customerName = signal('');
  readonly mobileNumber = signal('');
  readonly location = signal('');
  readonly billNote = signal('');
  readonly discount = signal<number>(0);

  readonly itemCount = computed(() =>
    this.currentItems().reduce((sum, i) => sum + i.qty, 0)
  );

  readonly billTotal = computed(() =>
    this.currentItems().reduce((sum, i) => sum + i.sellPrice * i.qty, 0)
  );

  readonly finalAmount = computed(() =>
    Math.max(0, this.billTotal() - this.discount())
  );

  readonly billProfit = computed(() =>
    this.currentItems().reduce((sum, i) => sum + i.profit, 0)
  );

  // ─── Cart operations ────────────────────────────────────────────────────
  private isSameProduct(a: Pick<BillItem, 'productName' | 'brand'>, b: Pick<BillItem, 'productName' | 'brand'>): boolean {
    return a.productName === b.productName && (a.brand ?? '') === (b.brand ?? '');
  }

  addItem(item: Omit<BillItem, 'profit'>): void {
    const existing = this.currentItems().find(i => this.isSameProduct(i, item));
    if (existing) {
      this.currentItems.update(items =>
        items.map(i =>
          this.isSameProduct(i, item)
            ? {
                ...i,
                qty: i.qty + item.qty,
                profit: (i.sellPrice - i.costPrice) * (i.qty + item.qty),
              }
            : i
        )
      );
    } else {
      this.currentItems.update(items => [
        ...items,
        {
          ...item,
          profit: (item.sellPrice - item.costPrice) * item.qty,
        },
      ]);
    }
  }

  updateItem(index: number, changes: Partial<BillItem>): void {
    this.currentItems.update(items =>
      items.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, ...changes };
        updated.profit = (updated.sellPrice - updated.costPrice) * updated.qty;
        return updated;
      })
    );
  }

  removeItem(index: number): void {
    this.currentItems.update(items => items.filter((_, i) => i !== index));
  }

  clearBill(): void {
    this.currentItems.set([]);
    this.customerName.set('');
    this.mobileNumber.set('');
    this.location.set('');
    this.billNote.set('');
    this.discount.set(0);
  }

  // ─── Firestore operations ───────────────────────────────────────────────
  saveBill(date: string): Observable<string> {
    const items = this.currentItems();
    const discountAmount = this.discount();
    const finalAmt = Math.max(0, this.billTotal() - discountAmount);
    const totalCost = items.reduce((s, i) => s + i.costPrice * i.qty, 0);
    const bill: Bill = {
      date,
      billNumber: this.generateBillNumber(date),
      ...(this.customerName() ? { customerName: this.customerName() } : {}),
      ...(this.mobileNumber() ? { mobileNumber: this.mobileNumber() } : {}),
      ...(this.location() ? { location: this.location() } : {}),
      items,
      totalAmount: this.billTotal(),
      discountAmount,
      finalAmount: finalAmt,
      totalCost,
      totalProfit: finalAmt - totalCost,
      ...(this.billNote() ? { note: this.billNote() } : {}),
    };

    // Firestore rejects documents that contain `undefined` values.
    // JSON round-trip strips undefined from the bill and all nested BillItem objects.
    const billData: Record<string, unknown> = JSON.parse(JSON.stringify(bill));

    const col = collection(this.firestore, this.COLLECTION);
    return from(addDoc(col, { ...billData, createdAt: Timestamp.now() })).pipe(
      map(ref => {
        // Also record each item as a SaleEntry for backward-compatible daily totals
        items.forEach(item => {
          const entry: SaleEntry = {
            date,
            productName: item.productName,
            ...(item.category ? { category: item.category } : {}),
            qty: item.qty,
            costPrice: item.costPrice,
            sellPrice: item.sellPrice,
            profit: item.profit,
            note: `Bill #${ref.id.slice(-6)}${bill.customerName ? ' – ' + bill.customerName : ''}`,
          };
          this.salesService.addSale(entry).subscribe();
          // Decrement stock in Firestore for products that have an ID
          if (item.productId) {
            this.firebaseAdmin.decrementStock(item.productId, item.qty, item.category ?? '').subscribe();
          }
        });
        return ref.id;
      })
    );
  }

  getBillsByDate(date: string): Observable<Bill[]> {
    const col = collection(this.firestore, this.COLLECTION);
    const q = query(col, where('date', '==', date));
    return from(getDocs(q)).pipe(
      map(snap =>
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Bill))
          .sort(
            (a, b) =>
              ((a.createdAt as any)?.seconds ?? 0) -
              ((b.createdAt as any)?.seconds ?? 0)
          )
      )
    );
  }

  getBillsByDateRange(from_: string, to: string): Observable<Bill[]> {
    const col = collection(this.firestore, this.COLLECTION);
    const q = query(
      col,
      where('date', '>=', from_),
      where('date', '<=', to)
    );
    return from(getDocs(q)).pipe(
      map(snap =>
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Bill))
          .sort((a, b) => {
            const dc = (a.date ?? '').localeCompare(b.date ?? '');
            if (dc !== 0) return dc;
            return (
              ((a.createdAt as any)?.seconds ?? 0) -
              ((b.createdAt as any)?.seconds ?? 0)
            );
          })
      )
    );
  }

  deleteBill(id: string): Observable<void> {
    return from(deleteDoc(doc(this.firestore, this.COLLECTION, id)));
  }

  // ─── Returns / refunds ──────────────────────────────────────────────────
  /** How many units of an item can still be returned (sold qty − already returned). */
  returnableQty(item: BillItem): number {
    return Math.max(0, item.qty - (item.returnedQty ?? 0));
  }

  /**
   * Effective price ratio = amount actually paid ÷ pre-discount total.
   * Spreads any bill discount evenly across every unit so refunds reflect what
   * the customer really paid per item (e.g. 6×₹50 with ₹30 off → ₹45/unit).
   */
  private refundRatio(bill: Bill): number {
    return bill.totalAmount > 0 ? bill.finalAmount / bill.totalAmount : 1;
  }

  /** Rounded ₹ refund for returning the given line quantities, after discount. */
  computeRefund(bill: Bill, rows: { index: number; qty: number }[]): number {
    const ratio = this.refundRatio(bill);
    const raw = rows.reduce((sum, r) => {
      const item = bill.items[r.index];
      if (!item || r.qty <= 0) return sum;
      return sum + r.qty * item.sellPrice * ratio;
    }, 0);
    return Math.round(raw);
  }

  /**
   * Record a customer return: updates the bill (returnedQty, refund, net profit,
   * return log) and restocks the returned units.
   */
  processReturn(bill: Bill, rows: { index: number; qty: number }[], date: string): Observable<Bill> {
    if (!bill.id) return throwError(() => new Error('Bill has no id'));
    const active = rows.filter(r => r.qty > 0);
    if (!active.length) return throwError(() => new Error('Select at least one item to return'));

    const refundAmount = this.computeRefund(bill, active);
    const ratio = this.refundRatio(bill);

    const items = bill.items.map((item, i) => {
      const r = active.find(a => a.index === i);
      return r ? { ...item, returnedQty: (item.returnedQty ?? 0) + r.qty } : item;
    });

    const refundedAmount = (bill.refundedAmount ?? 0) + refundAmount;
    const netCost = items.reduce((s, it) => s + it.costPrice * (it.qty - (it.returnedQty ?? 0)), 0);
    const totalProfit = (bill.finalAmount - refundedAmount) - netCost;

    const returnRecord: BillReturn = {
      date,
      items: active.map(r => {
        const it = bill.items[r.index];
        return {
          productName: it.productName,
          ...(it.brand ? { brand: it.brand } : {}),
          qty: r.qty,
          sellPrice: it.sellPrice,
          refund: Math.round(r.qty * it.sellPrice * ratio),
        };
      }),
      refundAmount,
    };
    const returns = [...(bill.returns ?? []), returnRecord];

    const updated: Bill = { ...bill, items, refundedAmount, totalProfit, returns };
    const payload: Record<string, unknown> = JSON.parse(
      JSON.stringify({ items, refundedAmount, totalProfit, returns })
    );
    const docRef = doc(this.firestore, this.COLLECTION, bill.id);

    return from(updateDoc(docRef, payload)).pipe(
      map(() => {
        active.forEach(r => {
          const it = bill.items[r.index];
          if (it.productId) {
            this.firebaseAdmin.restockStock(it.productId, r.qty, it.category ?? '').subscribe();
          }
        });
        return updated;
      })
    );
  }

  private generateBillNumber(date: string): string {
    const datePart = date.replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `BILL-${datePart}-${rand}`;
  }

  // ─── Printing ───────────────────────────────────────────────────────────
  /** Net amount the customer kept after refunds. */
  netPaid(bill: Bill): number {
    return (bill.finalAmount ?? bill.totalAmount) - (bill.refundedAmount ?? 0);
  }

  private esc(v: unknown): string {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Build a self-contained printable receipt HTML for a saved bill. */
  buildReceiptHtml(bill: Bill): string {
    const rs = (n: number) => '₹' + (n ?? 0).toLocaleString('en-IN');
    const stamp = this.stampService.stampUrl();

    const label = (it: BillItem) => [
      it.brand ? `<strong>${this.esc(it.brand)}</strong>` : '',
      `<strong>${this.esc(it.productName)}</strong>`,
      it.subcategory ? this.esc(it.subcategory) : '',
      ...(it.billFields ?? []).map(f => `<span style="color:#555">${this.esc(f.value)}</span>`),
    ].filter(Boolean).join(' ');

    const itemRows = bill.items.map(it => `
      <tr>
        <td>${label(it)}</td>
        <td class="c">${it.qty}</td>
        <td class="r">${rs(it.sellPrice)}</td>
        <td class="r">${rs(it.sellPrice * it.qty)}</td>
      </tr>`).join('');

    const returnRows = (bill.returns ?? []).flatMap(ret =>
      ret.items.map(ri => {
        const disc = ri.qty ? (ri.refund ?? 0) / ri.qty : (ri.sellPrice ?? 0);
        const priceCell = disc !== (ri.sellPrice ?? 0)
          ? `<s style="color:#9ca3af">${rs(ri.sellPrice ?? 0)}</s> ${rs(disc)}`
          : rs(ri.sellPrice ?? 0);
        return `
      <tr class="ret">
        <td>↩ ${ri.brand ? `<strong>${this.esc(ri.brand)}</strong> ` : ''}<strong>${this.esc(ri.productName)}</strong> (Return)<br><small>${this.esc(ret.date)}</small></td>
        <td class="c">−${ri.qty}</td>
        <td class="r">${priceCell}</td>
        <td class="r">− ${rs(ri.refund ?? 0)}</td>
      </tr>`;
      })).join('');

    const footRows = [
      bill.discountAmount > 0 ? `<tr><td colspan="3" class="r">Subtotal</td><td class="r">${rs(bill.totalAmount)}</td></tr>` : '',
      bill.discountAmount > 0 ? `<tr><td colspan="3" class="r">Discount</td><td class="r">− ${rs(bill.discountAmount)}</td></tr>` : '',
      `<tr><td colspan="3" class="r"><strong>Amount Paid</strong></td><td class="r"><strong>${rs(bill.finalAmount)}</strong></td></tr>`,
      returnRows,
      bill.refundedAmount ? `<tr><td colspan="3" class="r"><strong>Net Kept</strong></td><td class="r"><strong>${rs(this.netPaid(bill))}</strong></td></tr>` : '',
    ].join('');

    const meta = [
      bill.customerName ? `<div>Customer: <strong>${this.esc(bill.customerName)}</strong></div>` : '',
      bill.mobileNumber ? `<div>Mobile: <strong>${this.esc(bill.mobileNumber)}</strong></div>` : '',
      bill.location ? `<div>Location: <strong>${this.esc(bill.location)}</strong></div>` : '',
      bill.note ? `<div>Note: ${this.esc(bill.note)}</div>` : '',
    ].join('');

    return `<!doctype html><html><head><meta charset="utf-8">
      <title>DayToDay Electricals</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #111; margin: 16px; position: relative; }
        h1 { font-size: 18px; margin: 0; }
        .addr { font-size: 12px; color: #555; }
        .head { display: flex; justify-content: space-between; align-items: flex-start; }
        .meta { font-size: 12px; margin: 6px 0; }
        .billno { font-size: 12px; color: #4338ca; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; table-layout: fixed; }
        col.c-item  { width: 52%; }
        col.c-qty   { width: 10%; }
        col.c-price { width: 19%; }
        col.c-total { width: 19%; }
        th, td { padding: 5px 6px; border-bottom: 1px solid #ddd; text-align: left; overflow-wrap: break-word; word-break: break-word; }
        th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; color: #6b7280; }
        td.c, th.c { text-align: center; } td.r, th.r { text-align: right; }
        tfoot td { font-weight: 700; border-bottom: 1px solid #ddd; }
        tr.ret td { color: #9b1c1c; background: #fef6f6; font-weight: 400; }
        tr.ret small { color: #b45c5c; }
        .wm { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0.08; z-index: -1; }
        .wm img { max-width: 60%; }
        @media print { body { margin: 0; } }
      </style></head><body>
      ${stamp ? `<div class="wm"><img src="${stamp}" alt=""></div>` : ''}
      <div class="head">
        <div>
          <h1>DayToDay Electricals</h1>
          <div class="addr">Your Local Electrical Shop</div>
        </div>
        <div style="text-align:right">
          <div class="billno">${this.esc(bill.billNumber ?? '')}</div>
          <div class="meta">Date: ${this.esc(bill.date)}</div>
        </div>
      </div>
      <div class="meta">${meta}</div>
      <table>
        <colgroup>
          <col class="c-item"><col class="c-qty"><col class="c-price"><col class="c-total">
        </colgroup>
        <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Price</th><th class="r">Total</th></tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot>${footRows}</tfoot>
      </table>
      </body></html>`;
  }

  /** Print a saved bill via a hidden iframe (works inside sandboxed browsers). */
  printBill(bill: Bill): void {
    const html = this.buildReceiptHtml(bill);
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const cleanup = () => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };

    const doc = iframe.contentWindow?.document;
    if (!doc) { cleanup(); return; }
    doc.open();
    doc.write(html);
    doc.close();

    const win = iframe.contentWindow!;
    win.onafterprint = () => setTimeout(cleanup, 100);
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        cleanup();
      }
    }, 300);
  }
}
