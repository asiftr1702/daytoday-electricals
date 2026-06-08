import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SalesService } from '../../core/services/sales.service';
import { FirebaseAdminService } from '../../core/services/firebase-admin.service';
import { SaleEntry } from '../../core/models/sale.model';
import { Product } from '../../core/models/product.model';

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './sales.html',
  styleUrls: ['./sales.css'],
})
export class SalesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly salesService = inject(SalesService);
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

  // Daily totals
  totalSell = computed(() => this.entries().reduce((s, e) => s + e.sellPrice * e.qty, 0));
  totalCost = computed(() => this.entries().reduce((s, e) => s + e.costPrice * e.qty, 0));
  totalProfit = computed(() => this.entries().reduce((s, e) => s + e.profit, 0));

  ngOnInit(): void {
    this.initForm();
    this.loadProducts();
    this.loadEntries();
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
    this.firebaseAdmin.getAllProducts().subscribe({
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
}
