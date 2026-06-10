import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../core/services/sales.service';
import { BillService } from '../../core/services/bill.service';
import { FirebaseAdminService } from '../../core/services/firebase-admin.service';
import { SaleEntry } from '../../core/models/sale.model';
import { Bill } from '../../core/models/bill.model';
import { Product } from '../../core/models/product.model';
import { CATEGORIES } from '../../core/config/categories.config';

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

  saleForm!: FormGroup;

  today = new Date().toISOString().slice(0, 10);
  selectedDate = signal<string>(this.today);

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

  // Bill totals
  billsTotalSell = computed(() => this.bills().reduce((s, b) => s + (b.finalAmount ?? b.totalAmount), 0));
  billsTotalProfit = computed(() => this.bills().reduce((s, b) => s + (b.totalProfit ?? 0), 0));

  ngOnInit(): void {
    this.initForm();
    this.loadProducts();
    this.loadEntries();
    this.loadBills();
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
    this.firebaseAdmin.getAllProducts(CATEGORIES.map(c => c.id)).subscribe({
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

  private loadBills(): void {
    this.loadingBills.set(true);
    this.billService.getBillsByDate(this.selectedDate()).subscribe({
      next: bills => { this.bills.set(bills); this.loadingBills.set(false); },
      error: () => this.loadingBills.set(false),
    });
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

  private loadEntries(): void {
    this.loading.set(true);
    this.salesService.getSalesByDate(this.selectedDate()).subscribe({
      next: list => { this.entries.set(list); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
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
    if (!item.category) return item.productName;
    const cat = item.qty === 1
      ? item.category.replace(/s$/i, '')
      : item.category;
    return `${item.productName} ${cat}`;
  }
}
