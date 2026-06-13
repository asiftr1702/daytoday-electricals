import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../core/services/sales.service';
import { BillService } from '../../core/services/bill.service';
import { FirebaseAdminService } from '../../core/services/firebase-admin.service';
import { SaleEntry } from '../../core/models/sale.model';
import { Bill, BillItem } from '../../core/models/bill.model';
import { Product } from '../../core/models/product.model';
import { CatalogueConfigService } from '../../core/services/catalogue-config.service';
import { StampService } from '../../core/services/stamp.service';

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './sales.html',
  styleUrls: ['./sales.css'],
})
export class SalesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly salesService = inject(SalesService);
  private readonly billService = inject(BillService);
  private readonly firebaseAdmin = inject(FirebaseAdminService);
  private readonly catalogueConfig = inject(CatalogueConfigService);
  private readonly stampService = inject(StampService);

  saleForm!: FormGroup;

  today = new Date().toISOString().slice(0, 10);
  selectedDate = signal<string>(this.today);

  // Period: 'daily' shows a single date, 'monthly' aggregates a whole month.
  period = signal<'daily' | 'monthly'>('daily');
  selectedMonth = signal<string>(this.today.slice(0, 7)); // YYYY-MM

  /** Human label for the current period (used in section headings). */
  periodLabel = computed(() =>
    this.period() === 'monthly'
      ? new Date(this.selectedMonth() + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
      : this.selectedDate(),
  );

  entries = signal<SaleEntry[]>([]);
  loading = signal(false);
  saving = signal(false);
  deletingId = signal<string | null>(null);
  successMsg = signal('');
  errorMsg = signal('');

  allProducts = signal<Product[]>([]);

  // Bills for the selected date
  bills = signal<Bill[]>([]);
  loadingBills = signal(false);
  expandedBillId = signal<string | null>(null);
  deletingBillId = signal<string | null>(null);

  // Active tab: 'bills' | 'entries'
  activeTab = signal<'bills' | 'entries'>('bills');

  // Daily totals (from SaleEntry — backward compat)
  totalSell = computed(() => this.entries().reduce((s, e) => s + e.sellPrice * e.qty, 0));
  totalCost = computed(() => this.entries().reduce((s, e) => s + e.costPrice * e.qty, 0));
  totalProfit = computed(() => this.entries().reduce((s, e) => s + e.profit, 0));

  // Bill totals (net of any refunds)
  billsTotalSell = computed(() => this.bills().reduce((s, b) => s + (b.finalAmount ?? b.totalAmount) - (b.refundedAmount ?? 0), 0));
  billsTotalProfit = computed(() => this.bills().reduce((s, b) => s + (b.totalProfit ?? 0), 0));

  ngOnInit(): void {
    this.initForm();
    this.catalogueConfig.loadConfig().then(() => this.loadProducts());
    this.loadEntries();
    this.loadBills();
    this.stampService.loadStamp();
  }

  private initForm(): void {
    this.saleForm = this.fb.group({
      productName: ['', Validators.required],
      category: [''],
      qty: [1, [Validators.required, Validators.min(1)]],
      costPrice: [0, [Validators.required, Validators.min(0)]],
      sellPrice: [0, [Validators.required, Validators.min(0)]],
      note: [''],
    });
  }

  private loadProducts(): void {
    this.firebaseAdmin.getAllProducts(this.catalogueConfig.categories().map(c => c.id)).subscribe({
      next: prods => this.allProducts.set(prods.sort((a, b) => a.name.localeCompare(b.name))),
      error: () => {},
    });
  }

  onProductSelect(event: Event): void {
    const name = (event.target as HTMLSelectElement).value;
    const prod = this.allProducts().find(p => p.name === name);
    if (prod) {
      this.saleForm.patchValue({
        productName: prod.name,
        category: (prod as any)['category'] ?? '',
        costPrice: prod.costPrice ?? 0,
        sellPrice: prod.price ?? 0,
      });
    }
  }

  onDateChange(event: Event): void {
    this.selectedDate.set((event.target as HTMLInputElement).value);
    this.loadEntries();
    this.loadBills();
  }

  onMonthChange(event: Event): void {
    this.selectedMonth.set((event.target as HTMLInputElement).value);
    this.loadEntries();
    this.loadBills();
  }

  setPeriod(period: 'daily' | 'monthly'): void {
    if (this.period() === period) return;
    this.period.set(period);
    this.loadEntries();
    this.loadBills();
  }

  /** First/last day (YYYY-MM-DD) of the selected month for range queries. */
  private monthRange(): { from: string; to: string } {
    const month = this.selectedMonth();
    return { from: `${month}-01`, to: `${month}-31` };
  }

  private loadBills(): void {
    this.loadingBills.set(true);
    const onOk = (bills: Bill[]) => { this.bills.set(bills); this.loadingBills.set(false); };
    const onErr = () => this.loadingBills.set(false);
    if (this.period() === 'monthly') {
      const { from, to } = this.monthRange();
      this.billService.getBillsByDateRange(from, to).subscribe({ next: onOk, error: onErr });
    } else {
      this.billService.getBillsByDate(this.selectedDate()).subscribe({ next: onOk, error: onErr });
    }
  }

  toggleBillExpand(id: string): void {
    this.expandedBillId.update(cur => (cur === id ? null : id));
  }

  deleteBill(id: string): void {
    if (!confirm('Delete this bill? (The individual sale entries will remain)')) return;
    this.deletingBillId.set(id);
    this.billService.deleteBill(id).subscribe({
      next: () => {
        this.bills.update(list => list.filter(b => b.id !== id));
        this.deletingBillId.set(null);
      },
      error: () => this.deletingBillId.set(null),
    });
  }

  billTotalItems(bill: Bill): number {
    return bill.items.reduce((s, i) => s + i.qty, 0);
  }

  // ─── Returns ──────────────────────────────────────────────────────────
  returningBillId = signal<string | null>(null);
  returnQtys = signal<Record<number, number>>({});
  returnProcessing = signal(false);
  returnError = signal('');

  /** Hide profit by default — this page may be shown to customers. */
  showProfit = signal(false);
  toggleProfit(): void {
    this.showProfit.update(v => !v);
  }

  startReturn(bill: Bill): void {
    this.expandedBillId.set(bill.id!);
    this.returningBillId.set(bill.id!);
    this.returnQtys.set({});
    this.returnError.set('');
  }

  cancelReturn(): void {
    this.returningBillId.set(null);
    this.returnQtys.set({});
    this.returnError.set('');
  }

  /** Units of an item still eligible for return. */
  returnableQty(item: BillItem): number {
    return this.billService.returnableQty(item);
  }

  /** True when the bill still has at least one returnable unit. */
  canReturn(bill: Bill): boolean {
    return bill.items.some(i => this.billService.returnableQty(i) > 0);
  }

  returnQty(index: number): number {
    return this.returnQtys()[index] ?? 0;
  }

  setReturnQty(index: number, value: number, max: number): void {
    const qty = Math.max(0, Math.min(max, Math.floor(value || 0)));
    this.returnQtys.update(m => ({ ...m, [index]: qty }));
  }

  private returnRows(): { index: number; qty: number }[] {
    return Object.entries(this.returnQtys())
      .map(([index, qty]) => ({ index: +index, qty }))
      .filter(r => r.qty > 0);
  }

  /** Live rounded refund preview for the bill currently being returned. */
  refundPreview(bill: Bill): number {
    return this.billService.computeRefund(bill, this.returnRows());
  }

  hasReturnSelection(): boolean {
    return this.returnRows().length > 0;
  }

  processReturn(bill: Bill): void {
    const rows = this.returnRows();
    if (!rows.length) { this.returnError.set('Select at least one item to return.'); return; }
    this.returnProcessing.set(true);
    this.returnError.set('');
    this.billService.processReturn(bill, rows, this.today).subscribe({
      next: updated => {
        this.bills.update(list => list.map(b => (b.id === updated.id ? updated : b)));
        this.returnProcessing.set(false);
        this.cancelReturn();
        this.successMsg.set('✅ Return processed & items restocked!');
        setTimeout(() => this.successMsg.set(''), 3000);
      },
      error: err => {
        this.returnProcessing.set(false);
        this.returnError.set('❌ ' + (err?.message ?? 'Failed to process return'));
      },
    });
  }

  /** Net amount the customer kept after refunds. */
  billNetPaid(bill: Bill): number {
    return (bill.finalAmount ?? bill.totalAmount) - (bill.refundedAmount ?? 0);
  }

  /** Print a saved bill (shared receipt format with the Bill page). */
  printBill(bill: Bill): void {
    this.billService.printBill(bill);
  }

  private loadEntries(): void {
    this.loading.set(true);
    const onOk = (list: SaleEntry[]) => { this.entries.set(list); this.loading.set(false); };
    const onErr = () => this.loading.set(false);
    if (this.period() === 'monthly') {
      const { from, to } = this.monthRange();
      this.salesService.getSalesByDateRange(from, to).subscribe({ next: onOk, error: onErr });
    } else {
      this.salesService.getSalesByDate(this.selectedDate()).subscribe({ next: onOk, error: onErr });
    }
  }

  onSubmit(): void {
    if (this.saleForm.invalid) return;
    const v = this.saleForm.value;
    const entry: SaleEntry = {
      date: this.selectedDate(),
      productName: v.productName,
      category: v.category,
      qty: v.qty,
      costPrice: v.costPrice,
      sellPrice: v.sellPrice,
      profit: (v.sellPrice - v.costPrice) * v.qty,
      note: v.note || '',
    };
    this.saving.set(true);
    this.salesService.addSale(entry).subscribe({
      next: () => {
        this.saving.set(false);
        this.saleForm.reset({ qty: 1, costPrice: 0, sellPrice: 0 });
        this.successMsg.set('✅ Sale recorded!');
        setTimeout(() => this.successMsg.set(''), 2500);
        this.loadEntries();
      },
      error: err => {
        this.saving.set(false);
        this.errorMsg.set('❌ Failed: ' + (err?.message ?? 'Unknown error'));
        setTimeout(() => this.errorMsg.set(''), 3000);
      },
    });
  }

  deleteEntry(id: string): void {
    this.deletingId.set(id);
    this.salesService.deleteSale(id).subscribe({
      next: () => {
        this.entries.update(list => list.filter(e => e.id !== id));
        this.deletingId.set(null);
      },
      error: () => this.deletingId.set(null),
    });
  }

  formatCurrency(n: number): string {
    return '₹\u202f' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  itemLabel(item: { productName: string; category?: string; qty: number }): string {
    return item.productName;
  }
}
