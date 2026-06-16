import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PriceListService, PriceListEntry } from '../../core/services/price-list.service';
import { FirebaseAdminService } from '../../core/services/firebase-admin.service';
import { CatalogueConfigService } from '../../core/services/catalogue-config.service';
import { BillService } from '../../core/services/bill.service';
import { Bill } from '../../core/models/bill.model';
import { AnyProduct } from '../../core/models/any-product.model';

/** A single line in the quick bill built from the price list. */
interface BillLine {
  name: string;
  /** The current (possibly discounted) price per unit. */
  sellPrice: number;
  /** Original list price — set once on add, never changes. Used to show discount. */
  originalPrice: number;
  costPrice: number | null;
  unit: string;
  category: string;
  qty: number;
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

/** How long (ms) the card must be held to reveal the hidden cost. */
const LONG_PRESS_MS = 500;
/** How long (ms) the revealed cost stays visible before auto-hiding. */
const REVEAL_MS = 2000;

/**
 * A deliberately simple, large-text price list shown ONE CATEGORY AT A TIME, stored in
 * its own `priceList` Firestore collection (independent of the rich product catalogue).
 * Fans load first; every other category is fetched from the backend only when selected
 * (and cached), so switching stays fast. Shows only product name + selling price.
 */
@Component({
  selector: 'app-price-list',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './price-list.html',
  styleUrls: ['./price-list.css'],
})
export class PriceListComponent implements OnInit {
  private readonly priceList       = inject(PriceListService);
  private readonly firebaseAdmin   = inject(FirebaseAdminService);
  private readonly catalogueConfig = inject(CatalogueConfigService);
  private readonly billService     = inject(BillService);

  /** Today's date (YYYY-MM-DD) for bills created here. */
  private readonly today = new Date().toISOString().slice(0, 10);

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

  // ── Add-row state ──
  readonly adding      = signal(false);
  readonly newName     = signal('');
  readonly newPrice    = signal<string>('');
  readonly newCost     = signal<string>('');
  readonly newCategory = signal('');
  readonly newUnit     = signal('pcs');
  readonly newStock    = signal<string>('');

  // ── Long-press "reveal cost" state ──
  /** Id of the row whose hidden cost is currently revealed (null = none). */
  readonly revealedCostId = signal<string | null>(null);
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
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

  // ── Per-line price editing ──
  readonly editingLineIndex = signal<number | null>(null);
  readonly editLinePrice    = signal<string>('');

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

  /** Discount = total − paid (only when customer paid less than total). */
  readonly billDiscount = computed(() => {
    const paid = this.parsedPaid();
    const total = this.billTotal();
    return !isNaN(paid) && paid < total ? Math.round(total - paid) : 0;
  });

  /** Change to return to customer (when they overpay). */
  readonly billChange = computed(() => {
    const paid = this.parsedPaid();
    const total = this.billTotal();
    return !isNaN(paid) && paid > total ? Math.round(paid - total) : 0;
  });

  /** Category chips/options (id, name, icon, colour) from the catalogue config. */
  readonly categoryOptions = computed(() =>
    this.catalogueConfig.categories().map(c => ({
      id: c.id, name: c.name, icon: c.icon, color: c.color,
    })),
  );

  onSearch(value: string): void { this.search.set(value); }
  clearSearch(): void { this.search.set(''); }

  // ── Long-press to reveal cost ─────────────────────────────────────────────
  /** Begin the hold timer; reveals the cost once held long enough. */
  pressStart(item: PriceListEntry): void {
    if (!item.id || this.editingId() === item.id) return;
    this.clearPressTimer();
    const id = item.id;
    this.pressTimer = setTimeout(() => {
      this.revealedCostId.set(id);
      this.pressTimer = null;
      this.clearHideTimer();
      this.hideTimer = setTimeout(() => this.hideCost(), REVEAL_MS);
    }, LONG_PRESS_MS);
  }

  /** Cancel a hold that ended before the threshold (a normal tap). */
  pressEnd(): void {
    this.clearPressTimer();
  }

  /** Hide the revealed cost. */
  hideCost(): void {
    this.clearPressTimer();
    this.clearHideTimer();
    this.revealedCostId.set(null);
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
      this.cancelSwipe();
      return;
    }

    event.preventDefault();
    this.clearPressTimer(); // cancel long-press if swiping
    // Clamp: max 100px either side
    const clamped = Math.max(-100, Math.min(100, dx));
    this.swipeOffset.set(clamped);
  }

  swipePointerUp(event: PointerEvent, item: PriceListEntry): void {
    if (event.pointerId !== this.swipePointerId) return;
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

  private clearPressTimer(): void {
    if (this.pressTimer) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }

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
    this.billItems.update(lines => {
      const idx = lines.findIndex(l => l.name === item.name && l.category === item.category);
      if (idx >= 0) {
        const copy = lines.slice();
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }

      return [
        ...lines,
        {
          name: item.name,
          sellPrice: sell,
          originalPrice: sell,
          costPrice: item.costPrice ?? null,
          unit: item.unit || 'pcs',
          category: item.category,
          qty: 1,
        },
      ];
    });
  }

  incLine(index: number): void {
    this.billItems.update(lines =>
      lines.map((l, i) => (i === index ? { ...l, qty: l.qty + 1 } : l)),
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
      })),
      totalAmount: total,
      discountAmount: discount,
      finalAmount: finalAmt,
      totalCost,
      totalProfit: finalAmt - totalCost,
    };
  }

  /** Print the current bill as a receipt (no save needed). */
  printBill(): void {
    if (!this.billItems().length) return;
    this.billService.printBill(this.buildBill());
  }

  /** Whether a mobile number has been entered (enables WhatsApp share). */
  readonly canWhatsApp = computed(() => this.billMobile().trim().length >= 10);

  /** Share the bill as a WhatsApp message to the entered mobile number. */
  shareOnWhatsApp(): void {
    const mobile = this.billMobile().trim().replace(/\D/g, '');
    if (!mobile) return;
    const lines = this.billItems();
    const customer = this.billCustomer().trim();
    const discount = this.billDiscount();
    const total    = this.billTotal();
    const final    = total - discount;

    let msg = '🧾 *Bill from DayToDay Electricals*\n';
    if (customer) msg += `Customer: ${customer}\n`;
    msg += `Date: ${this.today}\n\n`;

    lines.forEach(l => {
      msg += `• ${l.name}  ×${l.qty}  @₹${l.sellPrice.toLocaleString('en-IN')}  = ₹${(l.sellPrice * l.qty).toLocaleString('en-IN')}\n`;
    });

    msg += `\n*Total: ₹${total.toLocaleString('en-IN')}*`;
    if (discount > 0) {
      msg += `\nDiscount: −₹${discount.toLocaleString('en-IN')}`;
      msg += `\n*Amount Payable: ₹${final.toLocaleString('en-IN')}*`;
    }
    msg += '\n\nThank you for shopping with us! 🙏';

    const url = `https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
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

  /** Switch to a category, fetching it from the backend the first time. */
  setCategory(id: string): void {
    if (this.activeCat() === id) return;
    this.activeCat.set(id);
    this.adding.set(false);
    this.editingId.set(null);
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
    this.revealedCostId.set(null);
    this.editingId.set(entry.id ?? null);
    this.editName.set(entry.name);
    this.editPrice.set(entry.sellPrice != null ? String(entry.sellPrice) : '');
    this.editCost.set(entry.costPrice != null ? String(entry.costPrice) : '');
    this.editStock.set(entry.stock != null ? String(entry.stock) : '');
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  async saveEdit(entry: PriceListEntry): Promise<void> {
    const id = entry.id;
    if (!id) return;
    const name = this.editName().trim();
    if (!name) return;
    const price = this.parsePrice(this.editPrice());
    const cost  = this.parsePrice(this.editCost());
    const stock = this.parseStock(this.editStock());

    this.busy.set(true);
    try {
      await this.priceList.update(id, { name, sellPrice: price, costPrice: cost, stock });
      const cat = entry.category || 'other';
      const list = (this.cache().get(cat) ?? []).map(e =>
        e.id === id ? { ...e, name, sellPrice: price, costPrice: cost, stock } : e,
      );
      this.setCatEntries(cat, list);
      this.editingId.set(null);
    } finally {
      this.busy.set(false);
    }
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
    if (!this.newCategory()) {
      this.newCategory.set(this.activeCat() || this.categoryOptions()[0]?.id || 'other');
    }
  }

  cancelAdd(): void {
    this.adding.set(false);
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
