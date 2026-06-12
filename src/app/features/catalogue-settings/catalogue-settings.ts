import { Component, inject, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CatalogueConfigService, DynamicCategory } from '../../core/services/catalogue-config.service';
import {
  PricingMode,
  ProductField,
  ProductFieldType,
  colorNameToHex,
  defaultFieldConfig,
} from '../../core/config/product-fields.config';

@Component({
  selector: 'app-catalogue-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [],
  templateUrl: './catalogue-settings.html',
  styleUrl: './catalogue-settings.css',
})
export class CatalogueSettingsComponent implements OnInit {
  readonly config  = inject(CatalogueConfigService);
  private readonly router = inject(Router);

  readonly section     = signal<'categories' | 'units' | 'warranty'>('categories');
  readonly saving      = signal(false);
  readonly saveSuccess = signal(false);
  readonly saveError   = signal('');

  // Category form
  readonly showCatForm    = signal(false);
  readonly editingCatId   = signal<string | null>(null);
  readonly catFormName    = signal('');
  readonly catFormDesc    = signal('');
  readonly catFormIcon    = signal('📦');
  readonly catFormColor   = signal('#E3F2FD');
  readonly catFormSheetName = signal('');

  // Subcategory + brand panel
  readonly expandedCatId  = signal<string | null>(null);
  readonly expandedTab    = signal<'subs' | 'brands' | 'fields'>('subs');
  readonly newSubcatValue = signal('');
  readonly newBrandValue  = signal('');

  // Field editor
  readonly newFieldKey     = signal('');
  readonly newFieldLabel   = signal('');
  readonly newFieldType    = signal<ProductFieldType>('text');
  readonly newFieldGroup   = signal<'specs' | 'pricing' | 'stock' | 'admin'>('specs');
  readonly newFieldOptions = signal('');
  readonly newFieldSubcats = signal<string[]>([]);
  readonly newFieldPrefix  = signal('');
  readonly newFieldSuffix  = signal('');
  readonly newFieldFormula = signal('');
  readonly newFieldDecimals = signal(2);
  readonly newFieldIncludeInBill = signal(false);
  /** Key of the field currently being edited (null = adding a new field). */
  readonly editingFieldKey = signal<string | null>(null);
  readonly fieldTypeOptions: ProductFieldType[] = ['text', 'number', 'textarea', 'select', 'pills', 'color-pills', 'computed'];
  readonly fieldSectionOptions: { value: 'specs' | 'pricing' | 'stock' | 'admin'; label: string }[] = [
    { value: 'specs',   label: 'Basic info' },
    { value: 'pricing', label: 'Pricing' },
    { value: 'stock',   label: 'Stock' },
    { value: 'admin',   label: 'Additional info' },
  ];
  readonly pricingModeOptions: PricingMode[] = ['standard', 'unit-rope', 'length'];

  // Units
  readonly newUnit = signal('');

  // Warranty
  readonly newWarrantyLabel = signal('');
  readonly newWarrantyValue = signal('');

  ngOnInit(): void {
    this.config.loadConfig();
  }

  goBack(): void { this.router.navigate(['/admin']); }

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

  // ── Field editor ───────────────────────────────────────────────────────

  /** Returns the field list for a category, ensuring a fieldConfig exists. */
  fieldsOf(cat: DynamicCategory): ProductField[] {
    return cat.fieldConfig?.fields ?? [];
  }

  pricingModeOf(cat: DynamicCategory): PricingMode {
    return cat.fieldConfig?.pricingMode ?? 'standard';
  }

  /** Human-readable summary of a field's options for the editor list. */
  optionsText(field: ProductField): string {
    if (field.type === 'color-pills' && field.colorOptions) {
      return field.colorOptions.map(o => o.label).join(', ');
    }
    if (field.type === 'select' && field.options) {
      return field.options.join(', ');
    }
    if (field.type === 'pills') {
      if (field.options) return field.options.join(', ');
      if (field.optionsBySubcategory) {
        const all = new Set<string>();
        Object.values(field.optionsBySubcategory).forEach(arr => arr.forEach(v => all.add(v)));
        return [...all].join(', ');
      }
    }
    if ((field.type === 'text' || field.type === 'number') && (field.prefix || field.suffix)) {
      const sample = field.placeholder || 'value';
      return `${field.prefix ?? ''}${sample}${field.suffix ?? ''}`.trim();
    }
    if (field.type === 'computed') {
      return `= ${field.formula ?? ''}`;
    }
    return '';
  }

  private mutateFieldConfig(catId: string, mutate: (fields: ProductField[]) => ProductField[], modeFn?: (m: PricingMode) => PricingMode): void {
    this.config.categories.update(cats =>
      cats.map(c => {
        if (c.id !== catId) return c;
        const base = c.fieldConfig ?? defaultFieldConfig(c.id);
        return {
          ...c,
          fieldConfig: {
            ...base,
            pricingMode: modeFn ? modeFn(base.pricingMode) : base.pricingMode,
            fields: mutate(base.fields),
          },
        };
      })
    );
  }

  async changePricingMode(catId: string, mode: PricingMode): Promise<void> {
    this.mutateFieldConfig(catId, f => f, () => mode);
    await this.persist();
  }

  async addField(catId: string): Promise<void> {
    const key = this.newFieldKey().trim();
    const label = this.newFieldLabel().trim();
    if (!key || !label) return;
    const type = this.newFieldType();
    const group = this.newFieldGroup();
    const rawOptions = this.newFieldOptions().split(',').map(o => o.trim()).filter(Boolean);
    const subcats = this.newFieldSubcats().filter(Boolean);

    const field: ProductField = { key, label, type, group };
    if (type === 'pills') {
      field.options = rawOptions;
    } else if (type === 'select') {
      field.options = rawOptions;
    } else if (type === 'color-pills') {
      field.colorOptions = rawOptions.map(o => ({ label: o, hex: colorNameToHex(o) }));
    }
    // Computed field formula
    if (type === 'computed') {
      const formula = this.newFieldFormula().trim();
      if (!formula) return;
      field.formula = formula;
      field.decimals = Number(this.newFieldDecimals()) || 0;
    }
    // Prefix / suffix (text, number & computed fields)
    if (type === 'text' || type === 'number' || type === 'computed') {
      const prefix = this.newFieldPrefix().trim();
      const suffix = this.newFieldSuffix().trim();
      if (prefix) field.prefix = prefix;
      if (suffix) field.suffix = suffix;
    }
    // No subcategory selected → applies to all subcategories
    if (subcats.length) field.showForSubcategories = subcats;
    // Show this field's value on the printed/recorded bill
    if (this.newFieldIncludeInBill()) field.includeInBill = true;

    const editingKey = this.editingFieldKey();
    if (editingKey) {
      // Update in place, preserving position
      this.mutateFieldConfig(catId, fields =>
        fields.map(f => (f.key === editingKey ? field : f))
      );
    } else {
      this.mutateFieldConfig(catId, fields =>
        fields.some(f => f.key === key) ? fields : [...fields, field]
      );
    }
    this.resetFieldForm();
    await this.persist();
  }

  /** Load an existing field into the editor for in-place editing. */
  editField(field: ProductField): void {
    this.editingFieldKey.set(field.key);
    this.newFieldKey.set(field.key);
    this.newFieldLabel.set(field.label);
    this.newFieldType.set(field.type);
    this.newFieldGroup.set(field.group ?? 'specs');
    this.newFieldOptions.set(
      field.type === 'color-pills'
        ? (field.colorOptions ?? []).map(o => o.label).join(', ')
        : (field.options ?? []).join(', ')
    );
    this.newFieldSubcats.set(field.showForSubcategories ?? []);
    this.newFieldPrefix.set(field.prefix ?? '');
    this.newFieldSuffix.set(field.suffix ?? '');
    this.newFieldFormula.set(field.formula ?? '');
    this.newFieldDecimals.set(field.decimals ?? 2);
    this.newFieldIncludeInBill.set(!!field.includeInBill);
  }

  /** Cancel an in-progress field edit and clear the form. */
  cancelFieldEdit(): void {
    this.resetFieldForm();
  }

  private resetFieldForm(): void {
    this.editingFieldKey.set(null);
    this.newFieldKey.set('');
    this.newFieldLabel.set('');
    this.newFieldType.set('text');
    this.newFieldGroup.set('specs');
    this.newFieldOptions.set('');
    this.newFieldSubcats.set([]);
    this.newFieldPrefix.set('');
    this.newFieldSuffix.set('');
    this.newFieldFormula.set('');
    this.newFieldDecimals.set(2);
    this.newFieldIncludeInBill.set(false);
  }

  /** Append a {key} token to the formula being edited. */
  insertFormulaKey(key: string): void {
    this.newFieldFormula.update(f => `${f}{${key}}`);
  }

  /** Built-in numeric pricing/stock keys that can be referenced in formulas, by pricing mode. */
  private builtInNumberKeys(cat: DynamicCategory): string[] {
    const mode = this.pricingModeOf(cat);
    const common = ['discountedPrice', 'stockQty'];
    if (mode === 'length') return ['costPerMeter', 'pricePerMeter', 'bundlePrice', 'bundleLength', ...common];
    if (mode === 'unit-rope') return ['costPrice', 'price', 'totalLength', ...common];
    return ['costPrice', 'price', ...common];
  }

  /** Numeric/computed field keys that a formula may reference (custom fields + built-ins). */
  formulaKeyOptions(cat: DynamicCategory): string[] {
    const custom = this.fieldsOf(cat)
      .filter(f => f.type === 'number' || f.type === 'computed')
      .map(f => f.key);
    return [...custom, ...this.builtInNumberKeys(cat)];
  }

  /** Toggle a subcategory in the new-field scope selector. */
  toggleNewFieldSubcat(subcat: string): void {
    this.newFieldSubcats.update(list =>
      list.includes(subcat) ? list.filter(s => s !== subcat) : [...list, subcat]
    );
  }

  /** Human-readable section + subcategory scope summary for the field list. */
  sectionLabel(group?: string): string {
    return this.fieldSectionOptions.find(s => s.value === (group ?? 'specs'))?.label ?? 'Basic info';
  }

  scopeText(field: ProductField): string {
    return field.showForSubcategories?.length
      ? field.showForSubcategories.join(', ')
      : 'All subcategories';
  }

  async removeField(catId: string, field: ProductField): Promise<void> {
    this.mutateFieldConfig(catId, fields => fields.filter(f => f.key !== field.key));
    await this.persist();
  }

  /** Toggles whether a field's value is shown on bills, persisting immediately. */
  async toggleFieldBill(catId: string, field: ProductField): Promise<void> {
    this.mutateFieldConfig(catId, fields =>
      fields.map(f => {
        if (f.key !== field.key) return f;
        const next = { ...f };
        if (next.includeInBill) delete next.includeInBill;
        else next.includeInBill = true;
        return next;
      }));
    await this.persist();
  }

  /**
   * Groups a category's fields by section, preserving each field's order
   * within its section. Only non-empty sections are returned, in the same
   * order as `fieldSectionOptions`. Used to render the field list grouped
   * so reordering stays visually contained within a section.
   */
  fieldSections(cat: DynamicCategory): { value: string; label: string; fields: ProductField[] }[] {
    return this.fieldSectionOptions
      .map(s => ({
        value: s.value,
        label: s.label,
        fields: this.fieldsOf(cat).filter(f => (f.group ?? 'specs') === s.value),
      }))
      .filter(s => s.fields.length > 0);
  }

  /** Fields belonging to the same section as `field`, in display order. */
  private sameGroupFields(cat: DynamicCategory, group?: string): ProductField[] {
    const g = group ?? 'specs';
    return this.fieldsOf(cat).filter(f => (f.group ?? 'specs') === g);
  }

  /** True when `field` is the first field within its section (cannot move up). */
  isFirstInSection(cat: DynamicCategory, field: ProductField): boolean {
    return this.sameGroupFields(cat, field.group)[0]?.key === field.key;
  }

  /** True when `field` is the last field within its section (cannot move down). */
  isLastInSection(cat: DynamicCategory, field: ProductField): boolean {
    const group = this.sameGroupFields(cat, field.group);
    return group[group.length - 1]?.key === field.key;
  }

  /**
   * Reorders a field within its own section by swapping it with the nearest
   * neighbour in the same group. `direction` is -1 (up) or 1 (down).
   * The new order is what the admin product form renders, so it persists.
   */
  async moveField(catId: string, field: ProductField, direction: -1 | 1): Promise<void> {
    this.mutateFieldConfig(catId, fields => {
      const group = field.group ?? 'specs';
      const idx = fields.findIndex(f => f.key === field.key);
      if (idx === -1) return fields;

      // Find the nearest field in the same section in the requested direction.
      let target = -1;
      for (let i = idx + direction; i >= 0 && i < fields.length; i += direction) {
        if ((fields[i].group ?? 'specs') === group) { target = i; break; }
      }
      if (target === -1) return fields;

      const reordered = [...fields];
      [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
      return reordered;
    });
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
