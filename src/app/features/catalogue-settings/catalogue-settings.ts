import { Component, inject, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CatalogueConfigService, DynamicCategory } from '../../core/services/catalogue-config.service';

@Component({
  selector: 'app-catalogue-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [],
  templateUrl: './catalogue-settings.html',
  styleUrl: './catalogue-settings.css',
})
export class CatalogueSettingsComponent implements OnInit {
  readonly config = inject(CatalogueConfigService);

  readonly section = signal<'categories' | 'units' | 'warranty'>('categories');
  readonly saving = signal(false);
  readonly saveSuccess = signal(false);
  readonly saveError = signal('');

  // Category form
  readonly showCatForm = signal(false);
  readonly editingCatId = signal<string | null>(null);
  readonly catFormName = signal('');
  readonly catFormDesc = signal('');
  readonly catFormIcon = signal('📦');
  readonly catFormColor = signal('#E3F2FD');
  readonly catFormSheetName = signal('');

  // Subcategory + brand panel (shared expand)
  readonly expandedCatId = signal<string | null>(null);
  readonly expandedTab = signal<'subs' | 'brands'>('subs');
  readonly newSubcatValue = signal('');
  readonly newBrandValue = signal('');

  // Units
  readonly newUnit = signal('');

  // Warranty
  readonly newWarrantyLabel = signal('');
  readonly newWarrantyValue = signal('');

  ngOnInit(): void {
    this.config.loadConfig();
  }

  private async persist(): Promise<void> {
    this.saving.set(true);
    this.saveError.set('');
    try {
      await this.config.save();
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(false), 2500);
    } catch {
      this.saveError.set('Failed to save. Please try again.');
    }
    this.saving.set(false);
  }

  // ── Categories ──────────────────────────────────────────────────────────

  startAddCategory(): void {
    this.editingCatId.set(null);
    this.catFormName.set('');
    this.catFormDesc.set('');
    this.catFormIcon.set('📦');
    this.catFormColor.set('#E3F2FD');
    this.catFormSheetName.set('');
    this.showCatForm.set(true);
    this.expandedCatId.set(null);
  }

  startEditCategory(cat: DynamicCategory): void {
    this.editingCatId.set(cat.id);
    this.catFormName.set(cat.name);
    this.catFormDesc.set(cat.description);
    this.catFormIcon.set(cat.icon);
    this.catFormColor.set(cat.color);
    this.catFormSheetName.set(cat.sheetName);
    this.showCatForm.set(true);
    this.expandedCatId.set(null);
  }

  cancelCatForm(): void {
    this.showCatForm.set(false);
    this.editingCatId.set(null);
  }

  async saveCatForm(): Promise<void> {
    const name = this.catFormName().trim();
    if (!name) return;
    const editId = this.editingCatId();
    if (editId) {
      this.config.categories.update(cats =>
        cats.map(c => c.id === editId ? {
          ...c,
          name,
          description: this.catFormDesc().trim(),
          icon: this.catFormIcon().trim() || '📦',
          color: this.catFormColor(),
          sheetName: this.catFormSheetName().trim() || name.replace(/\s+/g, ''),
        } : c)
      );
    } else {
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      this.config.categories.update(cats => [...cats, {
        id,
        name,
        description: this.catFormDesc().trim(),
        icon: this.catFormIcon().trim() || '📦',
        color: this.catFormColor(),
        sheetName: this.catFormSheetName().trim() || name.replace(/\s+/g, ''),
        subcategories: [],
        brands: [],
      }]);
    }
    this.showCatForm.set(false);
    this.editingCatId.set(null);
    await this.persist();
  }

  async deleteCategory(id: string): Promise<void> {
    this.config.categories.update(cats => cats.filter(c => c.id !== id));
    if (this.expandedCatId() === id) this.expandedCatId.set(null);
    await this.persist();
  }

  toggleSubs(catId: string): void {
    if (this.expandedCatId() === catId) {
      this.expandedCatId.set(null);
    } else {
      this.expandedCatId.set(catId);
      this.expandedTab.set('subs');
    }
    this.newSubcatValue.set('');
    this.newBrandValue.set('');
  }

  async addSubcategory(catId: string): Promise<void> {
    const value = this.newSubcatValue().trim();
    if (!value) return;
    this.config.categories.update(cats =>
      cats.map(c => c.id === catId ? { ...c, subcategories: [...c.subcategories, value] } : c)
    );
    this.newSubcatValue.set('');
    await this.persist();
  }

  async removeSubcategory(catId: string, index: number): Promise<void> {
    this.config.categories.update(cats =>
      cats.map(c => c.id === catId ? { ...c, subcategories: c.subcategories.filter((_, i) => i !== index) } : c)
    );
    await this.persist();
  }

  async addBrand(catId: string): Promise<void> {
    const value = this.newBrandValue().trim();
    if (!value) return;
    this.config.categories.update(cats =>
      cats.map(c => c.id === catId
        ? { ...c, brands: c.brands.includes(value) ? c.brands : [...c.brands, value] }
        : c)
    );
    this.newBrandValue.set('');
    await this.persist();
  }

  async removeBrand(catId: string, index: number): Promise<void> {
    this.config.categories.update(cats =>
      cats.map(c => c.id === catId ? { ...c, brands: c.brands.filter((_, i) => i !== index) } : c)
    );
    await this.persist();
  }

  // ── Units ────────────────────────────────────────────────────────────────

  async addUnit(): Promise<void> {
    const value = this.newUnit().trim();
    if (!value || this.config.units().includes(value)) return;
    this.config.units.update(u => [...u, value]);
    this.newUnit.set('');
    await this.persist();
  }

  async removeUnit(index: number): Promise<void> {
    this.config.units.update(u => u.filter((_, i) => i !== index));
    await this.persist();
  }

  // ── Warranty ─────────────────────────────────────────────────────────────

  async addWarrantyOption(): Promise<void> {
    const label = this.newWarrantyLabel().trim();
    const value = this.newWarrantyValue().trim();
    if (!label || !value) return;
    this.config.warrantyOptions.update(w => [...w, { label, value }]);
    this.newWarrantyLabel.set('');
    this.newWarrantyValue.set('');
    await this.persist();
  }

  async removeWarrantyOption(index: number): Promise<void> {
    this.config.warrantyOptions.update(w => w.filter((_, i) => i !== index));
    await this.persist();
  }
}
