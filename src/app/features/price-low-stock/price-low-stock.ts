import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PriceListService, PriceListEntry } from '../../core/services/price-list.service';
import { CatalogueConfigService } from '../../core/services/catalogue-config.service';

interface DisplayItem extends PriceListEntry {
  categoryName?: string;
}

@Component({
  selector: 'app-price-low-stock',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './price-low-stock.html',
  styleUrls: ['./price-low-stock.css'],
})
export class PriceLowStockComponent implements OnInit {
  private readonly priceList = inject(PriceListService);
  private readonly catalogueConfig = inject(CatalogueConfigService);

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly search = signal('');
  readonly items = signal<DisplayItem[]>([]);

  readonly filteredItems = computed(() => {
    const searchTerm = this.search().toLowerCase();
    const allItems = this.items();
    if (!searchTerm) {
      return allItems.sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0));
    }
    return allItems
      .filter(item => item.name.toLowerCase().includes(searchTerm))
      .sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0));
  });

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      const rawItems = await this.priceList.getManualLowStock();
      const categories = this.catalogueConfig.categories();
      const categoryMap = new Map(categories.map(c => [c.id, c.name]));

      const itemsWithCategory: DisplayItem[] = rawItems.map(item => ({
        ...item,
        categoryName: categoryMap.get(item.category) || item.category,
      }));

      this.items.set(itemsWithCategory);
    } finally {
      this.loading.set(false);
    }
  }

  onSearch(term: string): void {
    this.search.set(term);
  }

  clearSearch(): void {
    this.search.set('');
  }

  async removeFromLowStock(item: DisplayItem): Promise<void> {
    const id = item.id;
    if (!id) return;

    this.busy.set(true);
    try {
      await this.priceList.update(id, { manualLowStock: false });
      this.items.update(items => items.filter(i => i.id !== id));
    } finally {
      this.busy.set(false);
    }
  }
}
