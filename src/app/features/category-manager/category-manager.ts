import { Component, computed, inject, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PriceListService, PriceListCategory } from '../../core/services/price-list.service';

@Component({
  selector: 'app-category-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterLink],
  templateUrl: './category-manager.html',
  styleUrl: './category-manager.css',
})
export class CategoryManagerComponent implements OnInit {
  private readonly priceList = inject(PriceListService);

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly categories = signal<PriceListCategory[]>([]);
  readonly expandedId = signal<string | null>(null);

  // Add category form
  readonly showAddCategory = signal(false);
  readonly newCategoryName = signal('');

  // Edit category form
  readonly editingCategoryId = signal<string | null>(null);
  readonly editCategoryName = signal('');

  // Add subcategory (per category)
  readonly addingSubFor = signal<string | null>(null);
  readonly newSubcategoryName = signal('');

  // Edit subcategory
  readonly editingSub = signal<{ categoryId: string; oldName: string } | null>(null);
  readonly editSubName = signal('');

  readonly sortedCategories = computed(() =>
    [...this.categories()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  ngOnInit(): void {
    this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const [cats, items] = await Promise.all([
        this.priceList.getCategories(),
        this.priceList.getAll(),
      ]);

      // Merge categories/subcategories that exist on items but have no category doc
      const byId = new Map<string, PriceListCategory>();
      for (const c of cats) {
        byId.set(c.id, { id: c.id, name: c.name, subcategories: [...c.subcategories] });
      }

      for (const item of items) {
        const id = (item.category ?? '').trim().toLowerCase();
        if (!id) continue;
        if (!byId.has(id)) {
          byId.set(id, { id, name: this.prettyName(id), subcategories: [] });
        }
        const sub = (item.subcategory ?? '').trim();
        if (sub) {
          const cat = byId.get(id)!;
          if (!cat.subcategories.includes(sub)) {
            cat.subcategories.push(sub);
          }
        }
      }

      this.categories.set(Array.from(byId.values()));
    } finally {
      this.loading.set(false);
    }
  }

  private prettyName(id: string): string {
    return id
      .split('-')
      .filter(Boolean)
      .map(p => p[0]?.toUpperCase() + p.slice(1))
      .join(' ') || id;
  }

  toggleExpand(id: string): void {
    this.expandedId.update(cur => (cur === id ? null : id));
  }

  // ── Add category ──
  openAddCategory(): void {
    this.showAddCategory.set(true);
    this.newCategoryName.set('');
  }

  closeAddCategory(): void {
    this.showAddCategory.set(false);
    this.newCategoryName.set('');
  }

  async saveAddCategory(): Promise<void> {
    const name = this.newCategoryName().trim();
    if (!name) return;
    this.busy.set(true);
    try {
      await this.priceList.createCategory(name, []);
      await this.reload();
      this.closeAddCategory();
    } finally {
      this.busy.set(false);
    }
  }

  // ── Edit category name ──
  openEditCategory(cat: PriceListCategory): void {
    this.editingCategoryId.set(cat.id);
    this.editCategoryName.set(cat.name);
  }

  closeEditCategory(): void {
    this.editingCategoryId.set(null);
    this.editCategoryName.set('');
  }

  async saveEditCategory(): Promise<void> {
    const id = this.editingCategoryId();
    const name = this.editCategoryName().trim();
    if (!id || !name) return;
    this.busy.set(true);
    try {
      await this.priceList.renameCategory(id, name);
      await this.reload();
      this.closeEditCategory();
    } finally {
      this.busy.set(false);
    }
  }

  // ── Delete category ──
  async deleteCategory(cat: PriceListCategory): Promise<void> {
    const ok = confirm(`Delete category "${cat.name}"? This removes the category and its subcategories. Items are not deleted.`);
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.priceList.deleteCategory(cat.id);
      await this.reload();
    } finally {
      this.busy.set(false);
    }
  }

  // ── Add subcategory ──
  openAddSubcategory(categoryId: string): void {
    this.addingSubFor.set(categoryId);
    this.newSubcategoryName.set('');
    this.expandedId.set(categoryId);
  }

  closeAddSubcategory(): void {
    this.addingSubFor.set(null);
    this.newSubcategoryName.set('');
  }

  async saveAddSubcategory(): Promise<void> {
    const categoryId = this.addingSubFor();
    const raw = this.newSubcategoryName();
    if (!categoryId || !raw.trim()) return;
    const subs = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (!subs.length) return;
    this.busy.set(true);
    try {
      for (const sub of subs) {
        await this.priceList.addSubcategory(categoryId, sub);
      }
      await this.reload();
      this.closeAddSubcategory();
    } finally {
      this.busy.set(false);
    }
  }

  // ── Edit subcategory ──
  openEditSubcategory(categoryId: string, oldName: string): void {
    this.editingSub.set({ categoryId, oldName });
    this.editSubName.set(oldName);
  }

  closeEditSubcategory(): void {
    this.editingSub.set(null);
    this.editSubName.set('');
  }

  async saveEditSubcategory(): Promise<void> {
    const target = this.editingSub();
    const newName = this.editSubName().trim();
    if (!target || !newName || newName === target.oldName) {
      this.closeEditSubcategory();
      return;
    }
    this.busy.set(true);
    try {
      await this.priceList.updateSubcategory(target.categoryId, target.oldName, newName);
      await this.reload();
      this.closeEditSubcategory();
    } finally {
      this.busy.set(false);
    }
  }

  // ── Delete subcategory ──
  async deleteSubcategory(categoryId: string, sub: string): Promise<void> {
    const ok = confirm(`Delete subcategory "${sub}"? Items are not deleted.`);
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.priceList.deleteSubcategory(categoryId, sub);
      await this.reload();
    } finally {
      this.busy.set(false);
    }
  }
}
