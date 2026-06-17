import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PriceListService, PriceListEntry } from '../../core/services/price-list.service';
import { FirebaseAdminService } from '../../core/services/firebase-admin.service';
import { CatalogueConfigService } from '../../core/services/catalogue-config.service';
import { BillService } from '../../core/services/bill.service';
import { StampService } from '../../core/services/stamp.service';
import { Bill } from '../../core/models/bill.model';
import { AnyProduct } from '../../core/models/any-product.model';
import { compressImage } from '../../core/utils/image.util';

/** A single line in the quick bill built from the price list. */
interface BillLine {
  /** Price-list entry id (used to decrement stock on save). */
  id?: string;
  name: string;
  /** The current (possibly discounted) price per unit. */
  sellPrice: number;
  /** Original list price — set once on add, never changes. Used to show discount. */
  originalPrice: number;
  costPrice: number | null;
  unit: string;
  category: string;
  qty: number;
  /** Stock available when added (null = not stock-tracked). */
  stock: number | null;
  /** Optional warranty label shown on the bill (e.g. "1 Year"). */
  warranty?: string;
}

/** Selling price the customer pays — discounted price when it is the cheaper one. */
function sellingPrice(p: AnyProduct): number | null {
  const price = p.price;
  const off = p.discountedPrice;
  if (off != null && price != null && off < price) return off;
  return price ?? off ?? null;
}

/** Actual cost price of the product (may be absent). */
function costPriceOf(p: AnyProduct): number | null {
  const c = p.costPrice;
  return typeof c === 'number' && Number.isFinite(c) ? c : null;
}



/**
 * A deliberately simple, large-text price list shown ONE CATEGORY AT A TIME, stored in
 * its own `priceList` Firestore collection (independent of the rich product catalogue).
 * Fans load first; every other category is fetched from the backend only when selected
 * (and cached), so switching stays fast. Shows only product name + selling price.
 */
@Component({
  selector: 'app-price-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './price-list.html',
  styleUrls: ['./price-list.css'],
})
export class PriceListComponent implements OnInit {
  private readonly priceList       = inject(PriceListService);
  private readonly firebaseAdmin   = inject(FirebaseAdminService);
  private readonly catalogueConfig = inject(CatalogueConfigService);
  private readonly billService     = inject(BillService);
  private readonly stampService    = inject(StampService);

  /** Today's date (YYYY-MM-DD) for bills created here. */
  readonly today = new Date().toISOString().slice(0, 10);

  /** Initial config load (page skeleton). */
  readonly loading    = signal(true);
  /** Loading the rows of the currently selected category. */
  readonly loadingCat = signal(true);
  readonly busy       = signal(false);
  readonly search     = signal('');
  readonly activeCat  = signal('');

  /** Per-category cache of fetched rows. A present key means that category is loaded. */
  private readonly cache = signal<Map<string, PriceListEntry[]>>(new Map());

  // ── Inline edit state ──
  readonly editingId  = signal<string | null>(null);
  readonly editName   = signal('');
  readonly editPrice  = signal<string>('');
  readonly editCost   = signal<string>('');
  readonly editStock  = signal<string>('');
  /** Image for the row currently being edited (data URL or null). */
  readonly editImage  = signal<string | null>(null);

  // ── Add-row state ──
  readonly adding      = signal(false);
  readonly newName     = signal('');
  readonly newPrice    = signal<string>('');
  readonly newCost     = signal<string>('');
  readonly newCategory = signal('');
  readonly newUnit     = signal('pcs');
  readonly newStock    = signal<string>('');
  /** Image for the row being added (data URL or null). */
  readonly newImage    = signal<string | null>(null);

  // ── Image lightbox ──
  /** URL of the image shown full-screen (null = closed). */
  readonly lightboxUrl = signal<string | null>(null);

  // ── Swipe-up to reveal cost ──
  /** Id of the row whose cost is currently revealed (null = none). */
  readonly revealedCostId = signal<string | null>(null);
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Swipe-to-edit / swipe-to-delete state ──
  /** Id of the row currently being swiped. */
  readonly swipingId    = signal<string | null>(null);
  /** Current swipe offset in px (negative = left / delete, positive = right / edit). */
  readonly swipeOffset  = signal(0);
  /** Id of the row whose swipe action has been revealed (stays open until dismissed). */
  readonly swipeOpenId  = signal<string | null>(null);
  /** Direction of the currently-open swipe: 'edit' | 'delete' | null. */
  readonly swipeDir     = signal<'edit' | 'delete' | null>(null);

  private swipeStartX = 0;
  private swipeStartY = 0;
  private swipePointerId = -1;
  private swipeItem: PriceListEntry | null = null;
  /** How far (px) the user must drag before we lock in the swipe axis. */
  private static readonly SWIPE_LOCK  = 8;
  /** How far (px) the user must drag to trigger the action on release. */
  private static readonly SWIPE_THRESHOLD = 72;
  private swipeAxisLocked: 'h' | 'v' | null = null;
  // ── Quick bill (cart) state ──
  /** Lines added to the in-progress bill. */
  readonly billItems    = signal<BillLine[]>([]);
  readonly showBill     = signal(false);
  readonly billCustomer = signal('');
  readonly billMobile   = signal('');
  readonly billPaid     = signal<string>('');
  readonly billSaving   = signal(false);
  readonly billMsg      = signal('');

  // ── Saved bills (today) ──
  readonly showSavedBills    = signal(false);
  readonly savedBills        = signal<Bill[]>([]);
  readonly loadingSavedBills = signal(false);
  /** Date (YYYY-MM-DD) whose saved bills are shown. Defaults to today. */
  readonly savedBillsDate    = signal<string>(this.today);
  /** Saved bill opened in the detail modal (null = none). */
  readonly selectedBill      = signal<Bill | null>(null);

  // ── Per-line price editing ──
  readonly editingLineIndex = signal<number | null>(null);
  readonly editLinePrice    = signal<string>('');

  // ── Per-line warranty editing ──
  /** Index of the line whose warranty editor is open (null = none). */
  readonly warrantyEditIdx = signal<number | null>(null);
  /** Quick preset warranty options. */
  readonly warrantyPresets = ['6 Months', '1 Year', '2 Years', '5 Years'];

  // ── Drag-and-drop to low stock ──
  /** The item currently being dragged (null = not dragging). */
  readonly draggedItem = signal<PriceListEntry | null>(null);
  /** Whether the drop zone is active/hovered (true = user is dragging over it). */
  readonly isDropZoneActive = signal(false);

  /** Warranty label — fans use "Stator Warranty", everything else "Warranty". */
  warrantyLabel(line: { category: string }): string {
    return (line.category || '').toLowerCase().includes('fan') ? 'Stator Warranty' : 'Warranty';
  }

  /** Open / toggle the warranty editor for a line. */
  toggleWarrantyEdit(index: number): void {
    this.warrantyEditIdx.set(this.warrantyEditIdx() === index ? null : index);
  }

  /** Set (or clear, when value is empty) the warranty on a line and close the editor. */
  setLineWarranty(index: number, value: string): void {
    const v = value.trim();
    this.billItems.update(lines =>
      lines.map((l, i) => {
        if (i !== index) return l;
        const { warranty, ...rest } = l;
        return v ? { ...rest, warranty: v } : rest;
      }),
    );
    this.warrantyEditIdx.set(null);
  }

  // ── Per-line qty stepper (tap to expand, auto-collapses after 3 s) ──
  readonly qtyExpandIdx = signal<number | null>(null);
  private qtyCollapseTimer: ReturnType<typeof setTimeout> | null = null;

  expandQty(idx: number): void {
    if (this.qtyCollapseTimer) clearTimeout(this.qtyCollapseTimer);
    this.qtyExpandIdx.set(idx);
    this.qtyCollapseTimer = setTimeout(() => this.qtyExpandIdx.set(null), 3000);
  }

  resetQtyTimer(): void {
    if (this.qtyCollapseTimer) clearTimeout(this.qtyCollapseTimer);
    this.qtyCollapseTimer = setTimeout(() => this.qtyExpandIdx.set(null), 3000);
  }

  /** Total number of units across all bill lines. */
  readonly billCount = computed(() =>
    this.billItems().reduce((sum, l) => sum + l.qty, 0),
  );
  /** Grand total of the bill (selling price × qty). */
  readonly billTotal = computed(() =>
    this.billItems().reduce((sum, l) => sum + l.sellPrice * l.qty, 0),
  );

  /** The parsed paid amount entered by the user (NaN when blank). */
  private readonly parsedPaid = computed(() => {
    const v = parseFloat(this.billPaid());
    return isNaN(v) || v < 0 ? NaN : v;
  });

  /**
   * How to treat a shortfall (paid < total):
   *  • 'discount' — the unpaid part is a price reduction (bill is settled).
   *  • 'due'      — the unpaid part is still owed by the customer.
   */
  readonly shortfallMode = signal<'discount' | 'due'>('discount');

  /** Raw shortfall = total − paid (only when customer paid less than total). */
  readonly billShortfallValue = computed(() => {
    const paid = this.parsedPaid();
    const total = this.billTotal();
    return !isNaN(paid) && paid < total ? Math.round(total - paid) : 0;
  });

  /** Discount = shortfall when it is being treated as a discount. */
  readonly billDiscount = computed(() =>
    this.shortfallMode() === 'discount' ? this.billShortfallValue() : 0,
  );

  /** Due = shortfall when it is being treated as an outstanding balance. */
  readonly billDue = computed(() =>
    this.shortfallMode() === 'due' ? this.billShortfallValue() : 0,
  );

  /**
   * How to treat an overpayment (paid > total):
   *  • 'change'  — extra cash is returned to the customer now.
   *  • 'advance' — extra is kept as credit for the customer's future purchases.
   */
  readonly overpayMode = signal<'change' | 'advance'>('change');

  /** Raw overpayment = paid − total (only when customer paid more than total). */
  readonly billOverpayValue = computed(() => {
    const paid = this.parsedPaid();
    const total = this.billTotal();
    return !isNaN(paid) && paid > total ? Math.round(paid - total) : 0;
  });

  /** Change to return to customer (when overpayment is treated as change). */
  readonly billChange = computed(() =>
    this.overpayMode() === 'change' ? this.billOverpayValue() : 0,
  );

  /** Advance/credit kept for future purchases (when overpayment is treated as advance). */
  readonly billAdvance = computed(() =>
    this.overpayMode() === 'advance' ? this.billOverpayValue() : 0,
  );

  /** Category chips/options (id, name, icon, colour) from the catalogue config. */
  readonly categoryOptions = computed(() =>
    this.catalogueConfig.categories().map(c => ({
      id: c.id, name: c.name, icon: c.icon, color: c.color,
    })),
  );

  onSearch(value: string): void { this.search.set(value); }
  clearSearch(): void { this.search.set(''); }



  /**
   * Keep swipe/long-press gestures for touch and pen only.
   * Mouse pointers are reserved for desktop drag-and-drop.
   */
  onRowPointerDown(event: PointerEvent, item: PriceListEntry): void {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    this.swipePointerDown(event, item);
  }

  onRowPointerUp(event: PointerEvent, item: PriceListEntry): void {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    this.swipePointerUp(event, item);
  }

  onRowPointerCancel(event: PointerEvent): void {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    this.closeSwipe();
  }

  onQtyTap(item: PriceListEntry): void {
    this.addToBill(item);
  }

  // ── Swipe gestures ────────────────────────────────────────────────────────
  swipePointerDown(event: PointerEvent, item: PriceListEntry): void {
    if (!item.id || this.editingId() === item.id) return;
    // Close any other open swipe
    if (this.swipeOpenId() && this.swipeOpenId() !== item.id) {
      this.closeSwipe();
    }
    // If this row's swipe is already open, let clicks through to the action buttons
    if (this.swipeOpenId() === item.id) return;

    this.swipeItem        = item;
    this.swipeStartX      = event.clientX;
    this.swipeStartY      = event.clientY;
    this.swipePointerId   = event.pointerId;
    this.swipeAxisLocked  = null;
    this.swipingId.set(item.id);
    this.swipeOffset.set(0);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  swipePointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.swipePointerId) return;
    const dx = event.clientX - this.swipeStartX;
    const dy = event.clientY - this.swipeStartY;

    if (!this.swipeAxisLocked) {
      if (Math.abs(dx) < PriceListComponent.SWIPE_LOCK && Math.abs(dy) < PriceListComponent.SWIPE_LOCK) return;
      this.swipeAxisLocked = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }

    if (this.swipeAxisLocked === 'v') {
      // Vertical swipe detected — allow upward to reveal cost
      return;
    }

    event.preventDefault();
    // Clamp: max 100px either side
    const clamped = Math.max(-100, Math.min(100, dx));
    this.swipeOffset.set(clamped);
  }

  swipePointerUp(event: PointerEvent, item: PriceListEntry): void {
    if (event.pointerId !== this.swipePointerId) return;

    // Check for upward swipe (vertical axis locked, negative dy = upward)
    if (this.swipeAxisLocked === 'v') {
      const dy = event.clientY - this.swipeStartY;
      // Upward swipe (dy < -50px means significant upward motion)
      if (dy < -50) {
        this.revealCost(item);
        this.cancelSwipe();
        return;
      }
      this.cancelSwipe();
      return;
    }

    const offset = this.swipeOffset();

    if (Math.abs(offset) >= PriceListComponent.SWIPE_THRESHOLD) {
      if (offset < 0) {
        // Left swipe → delete
        this.swipeOpenId.set(null);
        this.swipeOffset.set(0);
        this.swipingId.set(null);
        this.swipeItem = null;
        this.remove(item);
      } else {
        // Right swipe → edit
        this.swipeOpenId.set(null);
        this.swipeOffset.set(0);
        this.swipingId.set(null);
        this.swipeItem = null;
        this.startEdit(item);
      }
    } else if (Math.abs(offset) > 10) {
      // Partial swipe — snap to open reveal
      const dir = offset < 0 ? 'delete' : 'edit';
      this.swipeDir.set(dir);
      this.swipeOpenId.set(item.id ?? null);
      this.swipeOffset.set(0);
      this.swipingId.set(null);
    } else {
      this.cancelSwipe();
    }
    this.swipeItem      = null;
    this.swipePointerId = -1;
  }

  private cancelSwipe(): void {
    this.swipeOffset.set(0);
    this.swipingId.set(null);
    this.swipeItem = null;
    this.swipePointerId = -1;
    this.swipeAxisLocked = null;
  }

  closeSwipe(): void {
    this.swipeOpenId.set(null);
    this.swipeDir.set(null);
    this.swipeOffset.set(0);
    this.swipingId.set(null);
  }

  swipeRowStyle(id: string | undefined): string {
    if (!id) return '';
    if (this.swipingId() === id) {
      const o = this.swipeOffset();
      return `transform: translateX(${o}px)`;
    }
    return '';
  }

  /** Reveal cost for an item and auto-hide after 2 seconds. */
  private revealCost(item: PriceListEntry): void {
    if (!item.id) return;
    this.clearHideTimer();
    this.revealedCostId.set(item.id);
    this.hideTimer = setTimeout(() => {
      this.revealedCostId.set(null);
      this.hideTimer = null;
    }, 2000);
  }

  /** Hide the revealed cost immediately. */
  private clearHideTimer(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  // ── Quick bill (cart) ─────────────────────────────────────────────────────
  /** Add a price-list item to the bill (or bump its quantity if already added). */
  addToBill(item: PriceListEntry): void {
    if (item.sellPrice == null) return;
    const sell = item.sellPrice;
    const stock = item.stock ?? null;
    if (this.availableStock(item) <= 0) {
      this.flashStockLimit(0);
      return;
    }
    this.billItems.update(lines => {
      const idx = lines.findIndex(l => l.name === item.name && l.category === item.category);
      if (idx >= 0) {
        const line = lines[idx];
        if (line.stock != null && line.qty >= line.stock) {
          this.flashStockLimit(Math.max(0, line.stock - line.qty));
          return lines;
        }
        const copy = lines.slice();
        copy[idx] = { ...line, qty: line.qty + 1 };
        return copy;
      }

      return [
        ...lines,
        {
          id: item.id,
          name: item.name,
          sellPrice: sell,
          originalPrice: sell,
          costPrice: item.costPrice ?? null,
          unit: item.unit || 'pcs',
          category: item.category,
          qty: 1,
          stock,
        },
      ];
    });
  }

  /** Show a brief "only N in stock" warning on the bill. */
  private flashStockLimit(stock: number): void {
    this.billMsg.set(
      stock <= 0
        ? `⚠️ No more left in inventory`
        : `⚠️ Only ${stock} left in inventory`,
    );
    setTimeout(() => this.billMsg.set(''), 2500);
  }

  /** Quantity of this item already sitting in the cart. */
  private cartQtyFor(item: PriceListEntry): number {
    return this.billItems()
      .filter(l => l.name === item.name && l.category === item.category)
      .reduce((sum, l) => sum + l.qty, 0);
  }

  /** Live stock = row stock minus what's already in the cart (never below 0). */
  availableStock(item: PriceListEntry): number {
    return Math.max(0, (item.stock ?? 0) - this.cartQtyFor(item));
  }

  /** Called when user starts dragging a row. */
  onDragStart(item: PriceListEntry, e: DragEvent): void {
    if (!item.id || item.manualLowStock) {
      e.preventDefault();
      return;
    }
    this.draggedItem.set(item);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.name);
    }
  }

  /** Called when user ends dragging (whether dropped or cancelled). */
  onDragEnd(): void {
    this.draggedItem.set(null);
    this.isDropZoneActive.set(false);
  }

  /** Called when user drags over the drop zone. */
  onDropZoneDragOver(e: DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    this.isDropZoneActive.set(true);
  }

  /** Called when user leaves the drop zone. */
  onDropZoneDragLeave(): void {
    this.isDropZoneActive.set(false);
  }

  /** Called when user drops an item on the drop zone. */
  async onDropZoneDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    this.isDropZoneActive.set(false);

    const item = this.draggedItem();
    if (item && item.id && !item.manualLowStock) {
      await this.moveToLowStock(item);
    }
    this.draggedItem.set(null);
  }

  /** Move item to low stock list. */
  async moveToLowStock(item: PriceListEntry): Promise<void> {
    const id = item.id;
    if (!id || item.manualLowStock) return;

    this.busy.set(true);
    try {
      await this.priceList.update(id, { manualLowStock: true });
      const cat = item.category || 'other';
      const list = (this.cache().get(cat) ?? []).map(e =>
        e.id === id ? { ...e, manualLowStock: true } : e,
      );
      this.setCatEntries(cat, list);
      this.billMsg.set(`Moved to low stock list`);
      setTimeout(() => this.billMsg.set(''), 1800);
    } finally {
      this.busy.set(false);
    }
  }

  incLine(index: number): void {
    this.billItems.update(lines =>
      lines.map((l, i) => {
        if (i !== index) return l;
        if (l.stock != null && l.qty >= l.stock) {
          this.flashStockLimit(Math.max(0, l.stock - l.qty));
          return l;
        }
        return { ...l, qty: l.qty + 1 };
      }),
    );
  }

  decLine(index: number): void {
    this.billItems.update(lines =>
      lines
        .map((l, i) => (i === index ? { ...l, qty: l.qty - 1 } : l))
        .filter(l => l.qty > 0),
    );
  }

  removeLine(index: number): void {
    this.editingLineIndex.set(null);
    this.billItems.update(lines => lines.filter((_, i) => i !== index));
    this.blCloseSwipe();
  }

  // ── Bill-line swipe-to-delete ─────────────────────────────────────────────
  private static readonly BL_SWIPE_LOCK      = 6;
  private static readonly BL_SWIPE_THRESHOLD = 55;

  private blStartX     = 0;
  private blStartY     = 0;
  private blPointerId  = -1;
  private blAxisLocked: 'h' | 'v' | null = null;

  readonly blSwipingIdx   = signal<number | null>(null);
  readonly blSwipeOffset  = signal(0);
  readonly blSwipeOpenIdx = signal<number | null>(null);

  blSwipeDown(event: PointerEvent, idx: number): void {
    if (this.blSwipeOpenIdx() !== null && this.blSwipeOpenIdx() !== idx) {
      this.blCloseSwipe();
    }
    if (this.blSwipeOpenIdx() === idx) return;
    this.blStartX     = event.clientX;
    this.blStartY     = event.clientY;
    this.blPointerId  = event.pointerId;
    this.blAxisLocked = null;
    this.blSwipingIdx.set(idx);
    this.blSwipeOffset.set(0);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  blSwipeMove(event: PointerEvent): void {
    if (event.pointerId !== this.blPointerId) return;
    const dx = event.clientX - this.blStartX;
    const dy = event.clientY - this.blStartY;
    if (!this.blAxisLocked) {
      if (Math.abs(dx) < PriceListComponent.BL_SWIPE_LOCK && Math.abs(dy) < PriceListComponent.BL_SWIPE_LOCK) return;
      this.blAxisLocked = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
    if (this.blAxisLocked === 'v') { this.blCancelSwipe(); return; }
    event.preventDefault();
    this.blSwipeOffset.set(Math.max(-100, Math.min(0, dx)));
  }

  blSwipeUp(event: PointerEvent, idx: number): void {
    if (event.pointerId !== this.blPointerId) return;
    const offset = this.blSwipeOffset();
    if (offset <= -PriceListComponent.BL_SWIPE_THRESHOLD) {
      this.blCloseSwipe();
      this.removeLine(idx);
    } else if (offset < -10) {
      this.blSwipeOpenIdx.set(idx);
      this.blSwipeOffset.set(0);
      this.blSwipingIdx.set(null);
    } else {
      this.blCancelSwipe();
    }
    this.blPointerId = -1;
  }

  blCancelSwipe(): void {
    this.blSwipeOffset.set(0);
    this.blSwipingIdx.set(null);
    this.blAxisLocked = null;
    this.blPointerId  = -1;
  }

  blCloseSwipe(): void {
    this.blSwipeOpenIdx.set(null);
    this.blSwipeOffset.set(0);
    this.blSwipingIdx.set(null);
  }

  blSwipeRowStyle(idx: number): string {
    if (this.blSwipingIdx() === idx) return `transform:translateX(${this.blSwipeOffset()}px)`;
    if (this.blSwipeOpenIdx() === idx) return 'transform:translateX(-72px)';
    return '';
  }

  startEditLinePrice(index: number): void {
    this.editingLineIndex.set(index);
    this.editLinePrice.set(String(this.billItems()[index].sellPrice));
  }

  confirmEditLinePrice(index: number): void {
    const v = parseFloat(this.editLinePrice());
    if (!isNaN(v) && v >= 0) {
      this.billItems.update(lines =>
        lines.map((l, i) => i === index ? { ...l, sellPrice: v } : l),
      );
    }
    this.editingLineIndex.set(null);
    this.editLinePrice.set('');
  }

  cancelEditLinePrice(): void {
    this.editingLineIndex.set(null);
    this.editLinePrice.set('');
  }

  openBill(): void { this.showBill.set(true); }
  closeBill(): void { this.showBill.set(false); }

  clearBillCart(): void {
    this.billItems.set([]);
    this.billCustomer.set('');
    this.billMobile.set('');
    this.billPaid.set('');
    this.shortfallMode.set('discount');
    this.overpayMode.set('change');
    this.editingLineIndex.set(null);
    this.editLinePrice.set('');
  }

  /** Build a Bill object from the current cart (used for print and save). */
  private buildBill(): Bill {
    const lines = this.billItems();
    const total = this.billTotal();
    const totalCost = lines.reduce((s, l) => s + (l.costPrice ?? 0) * l.qty, 0);
    const datePart = this.today.replace(/-/g, '');
    const discount = this.billDiscount();
    const due = this.billDue();
    const advance = this.billAdvance();
    const finalAmt = total - discount;
    return {
      date: this.today,
      billNumber: `BILL-${datePart}-${Math.floor(1000 + Math.random() * 9000)}`,
      ...(this.billCustomer().trim() ? { customerName: this.billCustomer().trim() } : {}),
      ...(this.billMobile().trim() ? { mobileNumber: this.billMobile().trim() } : {}),
      items: lines.map(l => ({
        productName: l.name,
        category: l.category,
        unit: l.unit,
        qty: l.qty,
        costPrice: l.costPrice ?? 0,
        sellPrice: l.sellPrice,
        profit: (l.sellPrice - (l.costPrice ?? 0)) * l.qty,
        // record per-item discount if price was reduced from the list price
        ...(l.sellPrice < l.originalPrice
          ? { originalPrice: l.originalPrice, itemDiscount: Math.round((l.originalPrice - l.sellPrice) * l.qty) }
          : {}),
        ...(l.warranty ? { warranty: l.warranty } : {}),
      })),
      totalAmount: total,
      discountAmount: discount,
      finalAmount: finalAmt,
      totalCost,
      totalProfit: finalAmt - totalCost,
      ...(due > 0
        ? { dueAmount: due, amountPaid: Math.max(0, Math.round(finalAmt - due)) }
        : {}),
      ...(advance > 0
        ? { advanceAmount: advance, amountPaid: Math.round(finalAmt + advance) }
        : {}),
    };
  }

  /** Print the current bill as a receipt (no save needed). */
  printBill(): void {
    if (!this.billItems().length) return;
    this.billService.printBill(this.buildBill());
  }

  /** Whether a mobile number has been entered (enables WhatsApp share). */
  readonly canWhatsApp = computed(() => this.billItems().length > 0);

  /** Lightweight per-line data the receipt renderer needs. */
  private billImageLines(): { name: string; qty: number; sellPrice: number; warranty?: string; category: string }[] {
    return this.billItems().map(l => ({
      name: l.name, qty: l.qty, sellPrice: l.sellPrice,
      ...(l.warranty ? { warranty: l.warranty } : {}),
      category: l.category,
    }));
  }

  /** Draw a receipt image from explicit data (used by both cart + saved bills). */
  private renderBillImage(data: {
    lines: { name: string; qty: number; sellPrice: number; warranty?: string; category: string }[];
    cust: string;
    mob: string;
    disc: number;
    due: number;
    advance: number;
    total: number;
    date: string;
  }): Promise<File> {
    const lines = data.lines;
    const cust  = data.cust;
    const mob   = data.mob;
    const disc  = data.disc;
    const due   = data.due;
    const advance = data.advance;
    const total = data.total;
    const final = total - disc;
    const paid  = due > 0 ? Math.max(0, final - due) : final;
    const date  = data.date;

    const W   = 560;
    const PAD = 22;
    const S   = 2; // retina

    const H_HEAD  = 70;
    const H_CUST  = (cust || mob) ? 34 : 0;
    const H_GAP   = 6;
    const H_CHEAD = 26;
    const H_ITEM  = 26;
    const H_WARR  = 15; // extra height for a line that carries a warranty
    const H_DIV   = 2;
    const H_SUB   = disc > 0 ? 24 : 0;
    const H_DISC  = disc > 0 ? 24 : 0;
    const H_PAID  = due > 0 ? 24 : 0;
    const H_DUE   = due > 0 ? 26 : 0;
    const H_ADV   = advance > 0 ? 26 : 0;
    const H_TOTAL = 36;
    const H_FOOT  = 42;
    const itemsH  = lines.reduce((s, l) => s + H_ITEM + (l.warranty ? H_WARR : 0), 0);
    const H = H_HEAD + H_CUST + H_GAP + H_CHEAD + itemsH
            + H_DIV + H_SUB + H_DISC + H_TOTAL + H_PAID + H_DUE + H_ADV + H_GAP + H_FOOT;

    const canvas = document.createElement('canvas');
    canvas.width  = W * S;
    canvas.height = H * S;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(S, S);

    const drawContent = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      // Header gradient
      const grd = ctx.createLinearGradient(0, 0, W, 0);
      grd.addColorStop(0, '#0c2340');
      grd.addColorStop(1, '#144d30');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H_HEAD);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px Arial';
      ctx.fillText('DayToDay Electricals', PAD, 28);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = '12px Arial';
      ctx.fillText('Date: ' + date, PAD, 48);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '10px Arial';
      ctx.fillText('DayToDay Electricals', W - PAD, 62);
      ctx.textAlign = 'left';

      let y = H_HEAD;

      // Customer strip
      if (H_CUST) {
        ctx.fillStyle = '#f0f3f7';
        ctx.fillRect(0, y, W, H_CUST);
        ctx.fillStyle = '#1a2736';
        ctx.font = '12px Arial';
        const parts: string[] = [];
        if (cust) parts.push(cust);
        if (mob)  parts.push(mob);
        ctx.fillText(parts.join('   |   '), PAD, y + 22);
        y += H_CUST;
      }
      y += H_GAP;

      // Column headers
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, y, W, H_CHEAD);
      ctx.fillStyle = '#e4eaf1';
      ctx.fillRect(0, y + H_CHEAD - 1, W, 1);

      const usableW = W - PAD * 2;
      const qtyW    = 36;
      const priceW  = 80;
      const totW    = 80;
      const nameW   = usableW - qtyW - priceW - totW;
      const xName   = PAD;
      const xQty    = xName + nameW;
      const xPrice  = xQty  + qtyW;
      const xTot    = xPrice + priceW;

      ctx.fillStyle = '#617082';
      ctx.font = 'bold 10px Arial';
      ctx.fillText('ITEM', xName, y + 18);
      ctx.textAlign = 'center';
      ctx.fillText('QTY', xQty + qtyW / 2, y + 18);
      ctx.textAlign = 'right';
      ctx.fillText('PRICE', xPrice + priceW, y + 18);
      ctx.fillText('TOTAL', xTot + totW, y + 18);
      ctx.textAlign = 'left';
      y += H_CHEAD;

      // Item rows
      lines.forEach((line, i) => {
        const rowH = H_ITEM + (line.warranty ? H_WARR : 0);
        if (i % 2 === 1) { ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, y, W, rowH); }
        ctx.font = '13px Arial';
        let name = line.name;
        while (ctx.measureText(name).width > nameW - 6 && name.length > 1) name = name.slice(0, -1);
        if (name.length < line.name.length) name = name.slice(0, -1) + '…';

        ctx.fillStyle = '#1a2736'; ctx.fillText(name, xName, y + 18);
        if (line.warranty) {
          ctx.font = '10px Arial'; ctx.fillStyle = '#047a42';
          ctx.fillText(this.warrantyLabel(line) + ': ' + line.warranty, xName, y + 31);
        }
        ctx.font = '13px Arial';
        ctx.textAlign = 'center'; ctx.fillStyle = '#617082';
        ctx.fillText(String(line.qty), xQty + qtyW / 2, y + 18);
        ctx.textAlign = 'right'; ctx.font = '12px Arial';
        ctx.fillText('₹' + line.sellPrice.toLocaleString('en-IN'), xPrice + priceW, y + 18);
        ctx.fillStyle = '#1a2736'; ctx.font = 'bold 13px Arial';
        ctx.fillText('₹' + (line.sellPrice * line.qty).toLocaleString('en-IN'), xTot + totW, y + 18);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#e4eaf1'; ctx.fillRect(0, y + rowH - 1, W, 1);
        y += rowH;
      });

      // Divider
      ctx.fillStyle = '#1a2736'; ctx.fillRect(PAD, y, W - PAD * 2, H_DIV); y += H_DIV;

      // Subtotal / Discount
      if (disc > 0) {
        ctx.textAlign = 'right'; ctx.fillStyle = '#617082'; ctx.font = '12px Arial';
        ctx.fillText('Subtotal', W - PAD - totW - 6, y + H_SUB - 6);
        ctx.fillText('₹' + total.toLocaleString('en-IN'), W - PAD, y + H_SUB - 6);
        y += H_SUB;
        ctx.fillStyle = '#b45309';
        ctx.fillText('Discount', W - PAD - totW - 6, y + H_DISC - 6);
        ctx.fillText('-₹' + disc.toLocaleString('en-IN'), W - PAD, y + H_DISC - 6);
        ctx.textAlign = 'left'; y += H_DISC;
      }

      // Total row
      ctx.fillStyle = '#e6f7ee'; ctx.fillRect(0, y, W, H_TOTAL);
      ctx.fillStyle = '#047a42'; ctx.font = 'bold 15px Arial';
      ctx.fillText(disc > 0 ? 'Amount Paid' : 'Total', PAD, y + 24);
      ctx.textAlign = 'right'; ctx.font = 'bold 18px Arial';
      ctx.fillText('₹' + final.toLocaleString('en-IN'), W - PAD, y + 24);
      ctx.textAlign = 'left'; y += H_TOTAL;

      // Paid + Due rows (partial payment)
      if (due > 0) {
        ctx.textAlign = 'right'; ctx.fillStyle = '#617082'; ctx.font = '12px Arial';
        ctx.fillText('Paid', W - PAD - totW - 6, y + H_PAID - 8);
        ctx.fillText('₹' + paid.toLocaleString('en-IN'), W - PAD, y + H_PAID - 8);
        ctx.textAlign = 'left'; y += H_PAID;

        ctx.fillStyle = '#fdeced'; ctx.fillRect(0, y, W, H_DUE);
        ctx.fillStyle = '#c0392b'; ctx.font = 'bold 14px Arial';
        ctx.fillText('Balance Due', PAD, y + 18);
        ctx.textAlign = 'right'; ctx.font = 'bold 15px Arial';
        ctx.fillText('₹' + due.toLocaleString('en-IN'), W - PAD, y + 18);
        ctx.textAlign = 'left'; y += H_DUE;
      }

      // Advance / credit row (overpayment kept for future)
      if (advance > 0) {
        ctx.fillStyle = '#eef4ff'; ctx.fillRect(0, y, W, H_ADV);
        ctx.fillStyle = '#1d5fbf'; ctx.font = 'bold 14px Arial';
        ctx.fillText('Advance Balance', PAD, y + 18);
        ctx.textAlign = 'right'; ctx.font = 'bold 15px Arial';
        ctx.fillText('₹' + advance.toLocaleString('en-IN'), W - PAD, y + 18);
        ctx.textAlign = 'left'; y += H_ADV;
      }
      y += H_GAP;

      // Footer
      ctx.fillStyle = '#617082'; ctx.font = '12px Arial'; ctx.textAlign = 'center';
      ctx.fillText('Thank you for shopping with us!', W / 2, y + 18);
      ctx.fillStyle = '#a0adb9'; ctx.font = '10px Arial';
      ctx.fillText('DayToDay Electricals', W / 2, y + 32);
      ctx.textAlign = 'left';
    };

    const stampUrl = this.stampService.stampUrl();

    if (stampUrl) {
      return new Promise<File>(resolve => {
        const img = new Image();
        img.onload = () => {
          drawContent();
          // Draw stamp centred over the body area (below header) as watermark
          const bodyTop = H_HEAD + H_CUST + H_GAP;
          const bodyH   = H - bodyTop - H_FOOT;
          const count = lines.length;
          const stampSize = count <= 2 ? 200 : count <= 4 ? 300 : 400;
          const scale   = Math.min(stampSize / img.width, stampSize / img.height);
          const sw = img.width * scale;
          const sh = img.height * scale;
          const sx = (W - sw) / 2;
          const sy = bodyTop + (bodyH - sh) / 2;
          ctx.save();
          ctx.globalAlpha = 0.30;
          ctx.drawImage(img, sx, sy, sw, sh);
          ctx.restore();
          canvas.toBlob(blob => resolve(new File([blob!], 'bill.png', { type: 'image/png' })), 'image/png');
        };
        img.onerror = () => {
          // Stamp failed to load — render without it
          drawContent();
          canvas.toBlob(blob => resolve(new File([blob!], 'bill.png', { type: 'image/png' })), 'image/png');
        };
        img.src = stampUrl;
      });
    }

    drawContent();
    return new Promise<File>(resolve =>
      canvas.toBlob(blob => resolve(new File([blob!], 'bill.png', { type: 'image/png' })), 'image/png'),
    );
  }

  /**
   * Share the bill as a PNG image via the native share sheet.
   * Falls back to a wa.me text link if Web Share API is unavailable.
   */
  async shareOnWhatsApp(): Promise<void> {
    if (!this.billItems().length) return;
    await this.shareBillData({
      lines: this.billImageLines(),
      cust: this.billCustomer().trim(),
      mob: this.billMobile().trim(),
      disc: this.billDiscount(),
      due: this.billDue(),
      advance: this.billAdvance(),
      total: this.billTotal(),
      date: this.today,
    });
  }

  /** Share an explicit bill (cart or saved) as an image, with a wa.me text fallback. */
  private async shareBillData(data: {
    lines: { name: string; qty: number; sellPrice: number; warranty?: string; category: string }[];
    cust: string;
    mob: string;
    disc: number;
    due: number;
    advance: number;
    total: number;
    date: string;
  }): Promise<void> {
    try {
      const file = await this.renderBillImage(data);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Bill — DayToDay Electricals' });
        return;
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
    }

    // Fallback: wa.me text link (needs mobile number)
    const mobile = data.mob.replace(/\D/g, '');
    if (mobile.length >= 10) {
      const { lines, disc, due, advance, total, cust } = data;
      const final = total - disc;
      const paid  = due > 0 ? Math.max(0, final - due) : final;
      let msg = '🧾 *Bill from DayToDay Electricals*\n';
      if (cust) msg += `Customer: ${cust}\n`;
      msg += `Date: ${data.date}\n\n`;
      lines.forEach(l => {
        msg += `• ${l.name}  ×${l.qty}  = ₹${(l.sellPrice * l.qty).toLocaleString('en-IN')}\n`;
        if (l.warranty) msg += `   🛡 ${this.warrantyLabel(l)}: ${l.warranty}\n`;
      });
      msg += `\n*Total: ₹${final.toLocaleString('en-IN')}*\n`;
      if (due > 0) {
        msg += `Paid: ₹${paid.toLocaleString('en-IN')}\n`;
        msg += `*Balance Due: ₹${due.toLocaleString('en-IN')}*\n`;
      }
      if (advance > 0) {
        msg += `*Advance Balance: ₹${advance.toLocaleString('en-IN')}*\n`;
      }
      msg += `\nThank you! 🙏`;
      window.open(`https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      this.billMsg.set('Open in Chrome on Android to share as image, or enter a mobile number.');
      setTimeout(() => this.billMsg.set(''), 4000);
    }
  }

  /** Save the current bill to Firestore (records it in bill history). */
  saveBill(): void {
    const lines = this.billItems();
    if (!lines.length || this.billSaving()) return;
    this.billSaving.set(true);
    this.billMsg.set('');
    this.billService.clearBill();
    lines.forEach(l =>
      this.billService.addItem({
        productName: l.name,
        category: l.category,
        unit: l.unit,
        qty: l.qty,
        costPrice: l.costPrice ?? 0,
        sellPrice: l.sellPrice,  // actual (discounted) price
      }),
    );
    this.billService.customerName.set(this.billCustomer().trim());
    this.billService.mobileNumber.set(this.billMobile().trim());
    this.billService.discount.set(this.billDiscount());
    this.billService.saveBill(this.today).subscribe({
      next: () => {
        this.billSaving.set(false);
        this.billMsg.set('✅ Bill saved');
        this.decrementStockForLines(lines);
        this.clearBillCart();
        this.billService.clearBill();
        this.showBill.set(false);
        setTimeout(() => this.billMsg.set(''), 3000);
      },
      error: err => {
        this.billSaving.set(false);
        this.billMsg.set('❌ ' + (err?.message ?? 'Failed to save'));
        setTimeout(() => this.billMsg.set(''), 4000);
      },
    });
  }

  // ── Saved bills ─────────────────────────────────────────────────────────
  /** Open the saved-bills sheet and load bills for the selected date (today by default). */
  openSavedBills(): void {
    this.showSavedBills.set(true);
    this.loadSavedBills();
  }

  /** Change the date and reload the saved bills for it. */
  onSavedBillsDateChange(date: string): void {
    if (!date) return;
    this.savedBillsDate.set(date);
    this.loadSavedBills();
  }

  /** Fetch the bills for the currently selected date. */
  private loadSavedBills(): void {
    this.loadingSavedBills.set(true);
    this.billService.getBillsByDate(this.savedBillsDate()).subscribe({
      next: bills => {
        this.savedBills.set(bills.slice().reverse()); // newest first
        this.loadingSavedBills.set(false);
      },
      error: () => {
        this.savedBills.set([]);
        this.loadingSavedBills.set(false);
      },
    });
  }

  closeSavedBills(): void { this.showSavedBills.set(false); }

  /** Open a saved bill in the detail modal. */
  openBillDetail(bill: Bill): void { this.selectedBill.set(bill); }

  /** Close the bill detail modal. */
  closeBillDetail(): void { this.selectedBill.set(null); }

  /** Share a saved bill as an image (same as the cart Share button). */
  shareSavedBill(bill: Bill): void {
    this.shareBillData({
      lines: bill.items.map(it => ({
        name: it.productName,
        qty: it.qty,
        sellPrice: it.sellPrice,
        ...(it.warranty ? { warranty: it.warranty } : {}),
        category: it.category ?? '',
      })),
      cust: bill.customerName?.trim() ?? '',
      mob: bill.mobileNumber?.trim() ?? '',
      disc: bill.discountAmount ?? 0,
      due: bill.dueAmount ?? 0,
      advance: bill.advanceAmount ?? 0,
      total: bill.totalAmount ?? 0,
      date: bill.date,
    });
  }

  /** Net amount kept for a saved bill (after any refunds). */
  netPaid(bill: Bill): number { return this.billService.netPaid(bill); }

  /** After a bill is saved, reduce the price-list stock for each sold line. */
  private decrementStockForLines(lines: BillLine[]): void {
    for (const l of lines) {
      if (!l.id || l.stock == null) continue;
      const next = Math.max(0, l.stock - l.qty);
      const cat = l.category || 'other';
      // Optimistic cache update so the on-screen count drops immediately.
      this.setCatEntries(cat, (this.cache().get(cat) ?? []).map(e =>
        e.id === l.id ? { ...e, stock: next } : e,
      ));
      this.priceList.update(l.id, { stock: next }).catch(() => {
        // Rollback the cache if the persist fails.
        this.setCatEntries(cat, (this.cache().get(cat) ?? []).map(e =>
          e.id === l.id ? { ...e, stock: l.stock } : e,
        ));
      });
    }
  }

  /** Switch to a category, fetching it from the backend the first time. */
  setCategory(id: string): void {
    if (this.activeCat() === id) return;
    this.activeCat.set(id);
    // Close and fully reset the add form when switching categories
    this.adding.set(false);
    this.editingId.set(null);
    this.newName.set('');
    this.newPrice.set('');
    this.newCost.set('');
    this.newUnit.set('pcs');
    this.newStock.set('');
    this.newImage.set(null);
    this.newCategory.set(id);
    this.loadCategory(id);
  }

  /** Display info (name/icon/colour) for the active category. */
  readonly activeMeta = computed(() => {
    const id = this.activeCat();
    const c = this.catalogueConfig.categories().find(x => x.id === id);
    return {
      id,
      name: c?.name ?? 'Other',
      icon: c?.icon ?? '📦',
      color: c?.color ?? '#ECEFF1',
    };
  });

  /** Rows of the active category after applying the search filter. */
  readonly activeItems = computed<PriceListEntry[]>(() => {
    const id = this.activeCat();
    const term = this.search().trim().toLowerCase();
    const list = this.cache().get(id) ?? [];
    return list
      .filter(i => !term || i.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Total rows in the active category (ignoring search). */
  readonly activeCount = computed(() => (this.cache().get(this.activeCat()) ?? []).length);

  ngOnInit(): void {
    this.catalogueConfig.loadConfig().then(() => {
      this.loading.set(false);
      const cats = this.catalogueConfig.categories();
      const first = cats.find(c => c.id === 'fans')?.id ?? cats[0]?.id ?? 'fans';
      this.activeCat.set(first);
      this.newCategory.set(first);
      this.loadCategory(first);
    });
    this.stampService.loadStamp();
  }

  /** Fetch a category's rows once and cache them. */
  private async loadCategory(catId: string): Promise<void> {
    if (this.cache().has(catId)) { this.loadingCat.set(false); return; }
    this.loadingCat.set(true);
    try {
      const list = await this.priceList.getByCategory(catId);
      this.cache.update(m => new Map(m).set(catId, list));
    } finally {
      this.loadingCat.set(false);
    }
  }

  /** Replace the cached rows for one category. */
  private setCatEntries(cat: string, list: PriceListEntry[]): void {
    this.cache.update(m => new Map(m).set(cat, list));
  }

  // ── Edit ────────────────────────────────────────────────────────────────
  startEdit(entry: PriceListEntry): void {
    this.adding.set(false);
    this.clearHideTimer();
    this.revealedCostId.set(null);
    this.editingId.set(entry.id ?? null);
    this.editName.set(entry.name);
    this.editPrice.set(entry.sellPrice != null ? String(entry.sellPrice) : '');
    this.editCost.set(entry.costPrice != null ? String(entry.costPrice) : '');
    this.editStock.set(entry.stock != null ? String(entry.stock) : '');
    this.editImage.set(entry.imageUrl ?? null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editImage.set(null);
  }

  async saveEdit(entry: PriceListEntry): Promise<void> {
    const id = entry.id;
    if (!id) return;
    const name = this.editName().trim();
    if (!name) return;
    const price    = this.parsePrice(this.editPrice());
    const cost     = this.parsePrice(this.editCost());
    const stock    = this.parseStock(this.editStock());
    const imageUrl = this.editImage() ?? null;

    this.busy.set(true);
    try {
      await this.priceList.update(id, { name, sellPrice: price, costPrice: cost, stock, imageUrl });
      const cat = entry.category || 'other';
      const list = (this.cache().get(cat) ?? []).map(e =>
        e.id === id ? { ...e, name, sellPrice: price, costPrice: cost, stock, imageUrl } : e,
      );
      this.setCatEntries(cat, list);
      this.editingId.set(null);
      this.editImage.set(null);
    } finally {
      this.busy.set(false);
    }
  }

  /** Handle image file selected in the add/edit form. */
  async onImagePicked(event: Event, mode: 'add' | 'edit'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const url = await compressImage(file, { maxDimension: 480, quality: 0.78 });
      if (mode === 'add') this.newImage.set(url);
      else this.editImage.set(url);
    } catch { /* ignore bad files */ }
    input.value = '';
  }

  /** Remove the image from the add/edit form. */
  clearImage(mode: 'add' | 'edit'): void {
    if (mode === 'add') this.newImage.set(null);
    else this.editImage.set(null);
  }

  /** Open the image lightbox. */
  openLightbox(url: string): void {
    this.lightboxUrl.set(url);
  }

  /** Close the image lightbox. */
  closeLightbox(): void {
    this.lightboxUrl.set(null);
  }

  // ── Add ─────────────────────────────────────────────────────────────────
  startAdd(): void {
    this.editingId.set(null);
    this.adding.set(true);
    this.newName.set('');
    this.newPrice.set('');
    this.newCost.set('');
    this.newUnit.set('pcs');
    this.newStock.set('');
    this.newImage.set(null);
    // Auto-select the active category when adding a new item
    this.newCategory.set(this.activeCat() || this.categoryOptions()[0]?.id || 'other');
  }

  cancelAdd(): void {
    this.adding.set(false);
    // Clear all form fields when closing
    this.newName.set('');
    this.newPrice.set('');
    this.newCost.set('');
    this.newUnit.set('pcs');
    this.newStock.set('');
    this.newCategory.set('');
    this.newImage.set(null);
  }

  async saveAdd(): Promise<void> {
    const name = this.newName().trim();
    if (!name) return;
    const entry: Omit<PriceListEntry, 'id'> = {
      name,
      sellPrice: this.parsePrice(this.newPrice()),
      costPrice: this.parsePrice(this.newCost()),
      category: this.newCategory() || 'other',
      unit: this.newUnit().trim() || 'pcs',
      stock: this.parseStock(this.newStock()),
      imageUrl: this.newImage() ?? null,
    };

    this.busy.set(true);
    try {
      const id = await this.priceList.add(entry);
      // Only update the cache if that category is already loaded; otherwise it will be
      // fetched fresh (including this row) the next time it is opened.
      if (this.cache().has(entry.category)) {
        this.setCatEntries(entry.category, [...this.cache().get(entry.category)!, { id, ...entry }]);
      }
      this.newName.set('');
      this.newPrice.set('');
      this.newCost.set('');
      this.newStock.set('');
      this.newImage.set(null);
    } finally {
      this.busy.set(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────
  async remove(entry: PriceListEntry): Promise<void> {
    const id = entry.id;
    if (!id) return;
    if (!confirm(`Remove "${entry.name}" from the price list?`)) return;

    this.busy.set(true);
    try {
      await this.priceList.remove(id);
      const cat = entry.category || 'other';
      if (this.cache().has(cat)) {
        this.setCatEntries(cat, this.cache().get(cat)!.filter(e => e.id !== id));
      }
    } finally {
      this.busy.set(false);
    }
  }

  // ── One-time import from the product catalogue ───────────────────────────
  async importFromProducts(): Promise<void> {
    if (this.activeCount() > 0 &&
        !confirm('This will add all catalogue products to the price list. Continue?')) {
      return;
    }
    const cats = this.catalogueConfig.categories();
    const ids = cats.map(c => c.id);
    if (!ids.length) return;

    this.busy.set(true);
    this.loadingCat.set(true);
    this.firebaseAdmin.getAllProducts(ids).subscribe({
      next: async products => {
        const rows: Omit<PriceListEntry, 'id'>[] = (products as AnyProduct[]).map(p => ({
          name: p.name,
          sellPrice: sellingPrice(p),
          costPrice: costPriceOf(p),
          category: (p['category'] as string) || 'other',
          unit: p.unit || 'pcs',
          stock: typeof p.stockQty === 'number' ? p.stockQty : null,
        }));
        try {
          await this.priceList.importMany(rows);
          // Drop the cache so every category re-fetches fresh, then reload the active one.
          this.cache.set(new Map());
          await this.loadCategory(this.activeCat());
        } finally {
          this.busy.set(false);
        }
      },
      error: () => { this.busy.set(false); this.loadingCat.set(false); },
    });
  }

  /** Adjust the stock count for a row by delta (±1) and immediately save to Firestore. */
  async adjustStock(item: PriceListEntry, delta: number): Promise<void> {
    if (!item.id) return;
    const current = item.stock ?? 0;
    const next = Math.max(0, current + delta);
    // Nothing to do if already at 0 and decrementing (and stock was already set)
    if (next === current && item.stock != null) return;
    const cat = item.category || 'other';
    // Optimistic cache update
    this.setCatEntries(cat, (this.cache().get(cat) ?? []).map(e =>
      e.id === item.id ? { ...e, stock: next } : e,
    ));
    try {
      await this.priceList.update(item.id, { stock: next });
    } catch {
      // Rollback
      this.setCatEntries(cat, (this.cache().get(cat) ?? []).map(e =>
        e.id === item.id ? { ...e, stock: item.stock ?? null } : e,
      ));
    }
  }

  private parsePrice(value: string): number | null {
    const n = parseFloat(String(value).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  private parseStock(value: string): number | null {
    const n = parseInt(String(value).replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }
}
