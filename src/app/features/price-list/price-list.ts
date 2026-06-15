import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PriceListService, PriceListEntry } from '../../core/services/price-list.service';
import { FirebaseAdminService } from '../../core/services/firebase-admin.service';
import { CatalogueConfigService } from '../../core/services/catalogue-config.service';
import { AnyProduct } from '../../core/models/any-product.model';

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
  readonly editingId = signal<string | null>(null);
  readonly editName  = signal('');
  readonly editPrice = signal<string>('');
  readonly editCost  = signal<string>('');

  // ── Add-row state ──
  readonly adding      = signal(false);
  readonly newName     = signal('');
  readonly newPrice    = signal<string>('');
  readonly newCost     = signal<string>('');
  readonly newCategory = signal('');
  readonly newUnit     = signal('pcs');

  // ── Long-press "reveal cost" state ──
  /** Id of the row whose hidden cost is currently revealed (null = none). */
  readonly revealedCostId = signal<string | null>(null);
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

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
      // Auto-hide the cost again after a short window.
      this.clearHideTimer();
      this.hideTimer = setTimeout(() => this.hideCost(), REVEAL_MS);
    }, LONG_PRESS_MS);
  }

  /** Cancel a hold that ended before the threshold (a normal tap). */
  pressEnd(): void {
    this.clearPressTimer();
  }

  /** Hide the revealed cost (tap elsewhere / release after reveal). */
  hideCost(): void {
    this.clearPressTimer();
    this.clearHideTimer();
    this.revealedCostId.set(null);
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
    const cost = this.parsePrice(this.editCost());

    this.busy.set(true);
    try {
      await this.priceList.update(id, { name, sellPrice: price, costPrice: cost });
      const cat = entry.category || 'other';
      const list = (this.cache().get(cat) ?? []).map(e =>
        e.id === id ? { ...e, name, sellPrice: price, costPrice: cost } : e,
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

  private parsePrice(value: string): number | null {
    const n = parseFloat(String(value).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
}
