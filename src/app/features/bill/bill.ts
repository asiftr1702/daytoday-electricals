import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BillService } from '../../core/services/bill.service';
import { BillItem, Bill } from '../../core/models/bill.model';
import { StampService } from '../../core/services/stamp.service';

@Component({
  selector: 'app-bill',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bill.html',
  styleUrls: ['./bill.css', './bill-print.css'],
})
export class BillComponent implements OnInit {
  readonly billService = inject(BillService);
  private readonly router = inject(Router);
  readonly stampService = inject(StampService);

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

  // ── Swipe-to-remove ──────────────────────────────────────────────────────
  private static readonly SWIPE_LOCK      = 6;
  private static readonly SWIPE_THRESHOLD = 55;

  private bSwipeStartX     = 0;
  private bSwipeStartY     = 0;
  private bSwipePointerId  = -1;
  private bSwipeAxisLocked: 'h' | 'v' | null = null;

  readonly bSwipingIdx   = signal<number | null>(null);
  readonly bSwipeOffset  = signal(0);
  readonly bSwipeOpenIdx = signal<number | null>(null);

  bSwipeDown(event: PointerEvent, idx: number): void {
    if (this.bSwipeOpenIdx() !== null && this.bSwipeOpenIdx() !== idx) {
      this.bCloseSwipe();
    }
    if (this.bSwipeOpenIdx() === idx) return;
    this.bSwipeStartX     = event.clientX;
    this.bSwipeStartY     = event.clientY;
    this.bSwipePointerId  = event.pointerId;
    this.bSwipeAxisLocked = null;
    this.bSwipingIdx.set(idx);
    this.bSwipeOffset.set(0);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  bSwipeMove(event: PointerEvent): void {
    if (event.pointerId !== this.bSwipePointerId) return;
    const dx = event.clientX - this.bSwipeStartX;
    const dy = event.clientY - this.bSwipeStartY;
    if (!this.bSwipeAxisLocked) {
      if (Math.abs(dx) < BillComponent.SWIPE_LOCK && Math.abs(dy) < BillComponent.SWIPE_LOCK) return;
      this.bSwipeAxisLocked = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
    if (this.bSwipeAxisLocked === 'v') { this.bCancelSwipe(); return; }
    event.preventDefault();
    this.bSwipeOffset.set(Math.max(-100, Math.min(0, dx)));
  }

  bSwipeUp(event: PointerEvent, idx: number): void {
    if (event.pointerId !== this.bSwipePointerId) return;
    const offset = this.bSwipeOffset();
    if (offset <= -BillComponent.SWIPE_THRESHOLD) {
      this.bCloseSwipe();
      this.removeItem(idx);
    } else if (offset < -10) {
      this.bSwipeOpenIdx.set(idx);
      this.bSwipeOffset.set(0);
      this.bSwipingIdx.set(null);
    } else {
      this.bCancelSwipe();
    }
    this.bSwipePointerId = -1;
  }

  bCancelSwipe(): void {
    this.bSwipeOffset.set(0);
    this.bSwipingIdx.set(null);
    this.bSwipeAxisLocked = null;
    this.bSwipePointerId  = -1;
  }

  bCloseSwipe(): void {
    this.bSwipeOpenIdx.set(null);
    this.bSwipeOffset.set(0);
    this.bSwipingIdx.set(null);
  }

  bSwipeRowStyle(idx: number): string {
    if (this.bSwipingIdx() === idx) return `transform:translateX(${this.bSwipeOffset()}px)`;
    if (this.bSwipeOpenIdx() === idx) return 'transform:translateX(-72px)';
    return '';
  }

  // Custom item fields
  readonly customName = signal('');
  readonly customQty = signal(1);
  readonly customPrice = signal(0);

  addCustomItem(): void {
    const name = this.customName().trim();
    if (!name) return;
    this.billService.addItem({
      productName: name,
      qty: this.customQty() || 1,
      sellPrice: this.customPrice() || 0,
      costPrice: 0,
      unit: 'pc',
    });
    this.customName.set('');
    this.customQty.set(1);
    this.customPrice.set(0);
  }

  // Toggle profit visibility (hidden by default so customers can't see)
  showProfit = signal(false);

  ngOnInit(): void {
    this.loadPastBills();
    this.stampService.loadStamp();
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

  // ─── Discount helpers (amount / percent / amount-received) ───────────────
  /** Discount expressed as a % of the bill total (derived from the ₹ amount). */
  readonly discountPercentValue = computed(() => {
    const total = this.billService.billTotal();
    return total > 0
      ? Math.round((this.billService.discount() / total) * 10000) / 100
      : 0;
  });

  /** Amount the customer pays = bill total − discount. */
  readonly amountReceivedValue = computed(() =>
    Math.max(0, this.billService.billTotal() - this.billService.discount())
  );

  /** Central setter: clamps the discount between 0 and the bill total. */
  private setDiscount(amount: number): void {
    const total = this.billService.billTotal();
    const disc = Math.max(0, Math.min(total, Math.round((amount || 0) * 100) / 100));
    this.billService.discount.set(disc);
  }

  onDiscountAmount(val: number): void {
    this.setDiscount(val);
  }

  onDiscountPercent(pct: number): void {
    const p = Math.max(0, Math.min(100, pct || 0));
    this.setDiscount((this.billService.billTotal() * p) / 100);
  }

  onAmountReceived(val: number): void {
    this.setDiscount(this.billService.billTotal() - (val || 0));
  }

  onDateChange(val: string): void {
    this.billDate.set(val);
    this.loadPastBills();
  }

  updateQty(index: number, qty: number): void {
    if (qty < 1) return;
    const item = this.items()[index];
    if (item && item.stock != null && qty > item.stock) {
      this.errorMsg.set(`⚠️ Only ${item.stock} in stock for ${item.productName}`);
      setTimeout(() => this.errorMsg.set(''), 2500);
      return;
    }
    this.billService.updateItem(index, { qty });
  }

  updateSellPrice(index: number, sellPrice: number): void {
    if (sellPrice < 0) return;
    this.billService.updateItem(index, { sellPrice });
  }

  removeItem(index: number): void {
    this.billService.removeItem(index);
    if (this.editingIndex() === index) this.editingIndex.set(null);
    this.bCloseSwipe();
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

  /** Print a saved past bill (shared receipt format with the Sales page). */
  printSavedBill(bill: Bill): void {
    this.billService.printBill(bill);
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

  /** Returns just the product name */
  itemLabel(item: BillItem): string {
    return item.productName;
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
