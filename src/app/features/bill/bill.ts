import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BillService } from '../../core/services/bill.service';
import { BillItem, Bill } from '../../core/models/bill.model';

@Component({
  selector: 'app-bill',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bill.html',
  styleUrls: ['./bill.css'],
})
export class BillComponent implements OnInit {
  readonly billService = inject(BillService);
  private readonly router = inject(Router);

  readonly Math = Math;

  today = new Date().toISOString().slice(0, 10);
  billDate = signal<string>(this.today);

  saving = signal(false);
  successMsg = signal('');
  errorMsg = signal('');
  savedBillId = signal<string | null>(null);

  // Past bills for selected date
  pastBills = signal<Bill[]>([]);
  loadingPast = signal(false);
  expandedBillId = signal<string | null>(null);
  deletingBillId = signal<string | null>(null);

  // Edit mode for an item
  editingIndex = signal<number | null>(null);

  // Toggle profit visibility (hidden by default so customers can't see)
  showProfit = signal(false);

  ngOnInit(): void {
    this.loadPastBills();
  }

  get items() {
    return this.billService.currentItems;
  }

  get customerName() {
    return this.billService.customerName;
  }

  get mobileNumber() {
    return this.billService.mobileNumber;
  }

  get location() {
    return this.billService.location;
  }

  get billNote() {
    return this.billService.billNote;
  }

  get itemCount() {
    return this.billService.itemCount;
  }

  get billTotal() {
    return this.billService.billTotal;
  }

  get billProfit() {
    return this.billService.billProfit;
  }

  get discount() {
    return this.billService.discount;
  }

  get finalAmount() {
    return this.billService.finalAmount;
  }

  onDateChange(val: string): void {
    this.billDate.set(val);
    this.loadPastBills();
  }

  updateQty(index: number, qty: number): void {
    if (qty < 1) return;
    this.billService.updateItem(index, { qty });
  }

  updateSellPrice(index: number, sellPrice: number): void {
    if (sellPrice < 0) return;
    this.billService.updateItem(index, { sellPrice });
  }

  removeItem(index: number): void {
    this.billService.removeItem(index);
    if (this.editingIndex() === index) this.editingIndex.set(null);
  }

  clearAll(): void {
    if (!confirm('Clear all items from current bill?')) return;
    this.billService.clearBill();
    this.savedBillId.set(null);
  }

  finalizeBill(): void {
    if (this.items().length === 0) return;
    this.saving.set(true);
    this.errorMsg.set('');
    this.billService.saveBill(this.billDate()).subscribe({
      next: id => {
        this.saving.set(false);
        this.savedBillId.set(id);
        this.successMsg.set('✅ Bill saved successfully!');
        setTimeout(() => this.successMsg.set(''), 3000);
        this.billService.clearBill();
        this.loadPastBills();
      },
      error: err => {
        this.saving.set(false);
        this.errorMsg.set('❌ Failed to save: ' + (err?.message ?? 'Unknown error'));
        setTimeout(() => this.errorMsg.set(''), 4000);
      },
    });
  }

  printBill(): void {
    window.print();
  }

  goToProducts(): void {
    this.router.navigate(['/products']);
  }

  // ─── Past bills ─────────────────────────────────────────────────────────
  private loadPastBills(): void {
    this.loadingPast.set(true);
    this.billService.getBillsByDate(this.billDate()).subscribe({
      next: bills => {
        this.pastBills.set(bills);
        this.loadingPast.set(false);
      },
      error: () => this.loadingPast.set(false),
    });
  }

  toggleExpand(id: string): void {
    this.expandedBillId.update(cur => (cur === id ? null : id));
  }

  deleteBill(id: string): void {
    if (!confirm('Delete this bill record?')) return;
    this.deletingBillId.set(id);
    this.billService.deleteBill(id).subscribe({
      next: () => {
        this.pastBills.update(list => list.filter(b => b.id !== id));
        this.deletingBillId.set(null);
      },
      error: () => this.deletingBillId.set(null),
    });
  }

  billTotalItems(bill: Bill): number {
    return bill.items.reduce((s, i) => s + i.qty, 0);
  }

  formatCurrency(n: number): string {
    return (
      '₹\u202f' +
      n.toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
    );
  }

  trackByIndex(index: number): number {
    return index;
  }

  /** Returns "Rio 48 inch fan" (qty=1) or "Rio 48 inch fans" (qty>1) */
  itemLabel(item: BillItem): string {
    if (!item.category) return item.productName;
    const cat = item.qty === 1
      ? item.category.replace(/s$/i, '')   // strip trailing s for singular
      : item.category;
    return `${item.productName} ${cat}`;
  }

  currentBillTotalCost(): number {
    return this.billService.currentItems().reduce((s, i) => s + i.costPrice * i.qty, 0);
  }

  pastBillsTotal(): number {
    return this.pastBills().reduce((s, b) => s + (b.finalAmount ?? b.totalAmount), 0);
  }

  pastBillsProfit(): number {
    return this.pastBills().reduce((s, b) => s + (b.totalProfit ?? 0), 0);
  }
}
