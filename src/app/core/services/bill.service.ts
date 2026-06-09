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
} from '@angular/fire/firestore';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Bill, BillItem } from '../models/bill.model';
import { SalesService } from './sales.service';
import { FirebaseAdminService } from './firebase-admin.service';
import { SaleEntry } from '../models/sale.model';

@Injectable({ providedIn: 'root' })
export class BillService {
  private readonly firestore = inject(Firestore);
  private readonly salesService = inject(SalesService);
  private readonly firebaseAdmin = inject(FirebaseAdminService);
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
  addItem(item: Omit<BillItem, 'profit'>): void {
    const existing = this.currentItems().find(
      i => i.productName === item.productName
    );
    if (existing) {
      this.currentItems.update(items =>
        items.map(i =>
          i.productName === item.productName
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
            this.firebaseAdmin.decrementStock(item.productId, item.qty).subscribe();
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

  private generateBillNumber(date: string): string {
    const datePart = date.replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `BILL-${datePart}-${rand}`;
  }
}
