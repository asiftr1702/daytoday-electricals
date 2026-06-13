import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FirebaseAdminService } from '../../core/services/firebase-admin.service';
import { CatalogueConfigService, DynamicCategory } from '../../core/services/catalogue-config.service';
import { AnyProduct } from '../../core/models/any-product.model';
import { AdminNavComponent } from '../../shared/admin-nav/admin-nav';

interface LowStockItem extends AnyProduct {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
}

/**
 * A product is "low stock" when it is out of stock (qty 0), or a min threshold is
 * set and the on-hand qty has reached/dropped to it.
 */
function isLowStock(p: AnyProduct): boolean {
  const qty = p.stockQty ?? 0;
  if (qty <= 0) return true;
  const min = p.minStockQty;
  if (min == null || min <= 0) return false;
  return qty <= min;
}

@Component({
  selector: 'app-low-stock',
  standalone: true,
  imports: [RouterLink, AdminNavComponent],
  templateUrl: './low-stock.html',
  styleUrls: ['./low-stock.css'],
})
export class LowStockComponent implements OnInit {
  private readonly firebaseAdmin   = inject(FirebaseAdminService);
  private readonly catalogueConfig = inject(CatalogueConfigService);

  readonly loading = signal(true);
  readonly items   = signal<LowStockItem[]>([]);
  readonly busyId  = signal<string | null>(null);
  readonly showDiscontinued = signal(false);

  toggleDiscontinued(): void {
    this.showDiscontinued.update(v => !v);
  }

  /** Active low-stock items (still restocked): out-of-stock first, then by qty. */
  readonly sortedItems = computed(() =>
    this.items()
      .filter(i => !i.discontinued)
      .sort((a, b) => (a.stockQty ?? 0) - (b.stockQty ?? 0)),
  );
  /** Items the user marked as no longer restocked. */
  readonly discontinuedItems = computed(() =>
    this.items()
      .filter(i => i.discontinued)
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly outOfStockCount = computed(() =>
    this.sortedItems().filter(i => (i.stockQty ?? 0) <= 0).length,
  );

  ngOnInit(): void {
    this.catalogueConfig.loadConfig().then(() => this.loadLowStock());
  }

  private loadLowStock(): void {
    const cats = this.catalogueConfig.categories();
    const ids = cats.map(c => c.id);
    if (!ids.length) { this.loading.set(false); return; }

    const meta = new Map<string, DynamicCategory>(cats.map(c => [c.id, c]));
    this.loading.set(true);
    this.firebaseAdmin.getAllProducts(ids).subscribe({
      next: products => {
        const low: LowStockItem[] = [];
        for (const p of products as AnyProduct[]) {
          if (!isLowStock(p)) continue;
          const catId = (p['category'] as string) ?? '';
          const cat = meta.get(catId);
          low.push({
            ...p,
            categoryId:   catId,
            categoryName: cat?.name ?? catId,
            categoryIcon: cat?.icon ?? '📦',
          });
        }
        this.items.set(low);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  isOutOfStock(item: LowStockItem): boolean {
    return (item.stockQty ?? 0) <= 0;
  }

  /** Mark an item as no longer restocked (moves it to the Discontinued section). */
  dismiss(item: LowStockItem): void {
    this.setDiscontinued(item, true);
  }

  /** Bring a discontinued item back into the active refill list. */
  restore(item: LowStockItem): void {
    this.setDiscontinued(item, false);
  }

  private setDiscontinued(item: LowStockItem, value: boolean): void {
    if (!item.id || !item.categoryId) return;
    this.busyId.set(item.id);
    this.firebaseAdmin.setDiscontinued(item.id, item.categoryId, value).subscribe({
      next: () => {
        this.items.update(list =>
          list.map(i => (i.id === item.id ? { ...i, discontinued: value } : i)),
        );
        this.busyId.set(null);
      },
      error: () => this.busyId.set(null),
    });
  }
}
