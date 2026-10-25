import { Component, inject, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  CatalogueConfigService,
  CatalogueMenuId,
  CatalogueMenuItem,
  DynamicCategory,
  catalogueMenuFieldKey,
} from '../../core/services/catalogue-config.service';
import {
  PricingMode,
  ProductField,
  ProductFieldType,
  colorNameToHex,
  defaultFieldConfig,
} from '../../core/config/product-fields.config';

interface FieldPreset {
  label: string;
  hint: string;
  type: ProductFieldType;
  fieldName: string;
  fieldKey: string;
  options?: string;
}

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

  readonly section     = signal<string | 'menuSetup'>('categories');
  readonly saving      = signal(false);
  readonly saveSuccess = signal(false);
  readonly saveError   = signal('');
  readonly menuDraft = signal<CatalogueMenuItem[]>([]);
  readonly newMenuName = signal('');
  readonly newMenuOption = signal('');
  readonly orderedMenus = () => [...this.config.catalogueMenus()].sort((a, b) => a.order - b.order);
  readonly visibleMenus = () => this.orderedMenus().filter(menu => menu.visible);
  readonly categoriesExpanded = signal(true);

  // Category form
  readonly showCatForm    = signal(false);
  readonly categorySearch = signal('');
  readonly editingCatId   = signal<string | null>(null);
  readonly catFormName    = signal('');
  readonly catFormDesc    = signal('');
  readonly catFormIcon    = signal('📦');
  readonly catFormColor   = signal('#E3F2FD');
  readonly catFormSheetName = signal('');
  readonly categoryNameError = signal(false);
  readonly iconPickerOpen = signal(false);
  readonly categoryIconOptions = ['📦', '🌀', '💡', '🔌', '🛠️', '🚿', '🪑', '🛏️', '🧴', '🧹', '🔧', '🏷️'];
  readonly categoryColorOptions = ['#E3F2FD', '#E8F5E9', '#FFF8E1', '#FCE4EC', '#F3E5F5', '#E0F7FA', '#FFF3E0', '#ECEFF1'];

  // Subcategory + brand panel
  readonly expandedCatId  = signal<string | null>(null);
  readonly expandedTab    = signal<'subs' | 'brands' | 'fields' | 'setup'>('fields');
  readonly newSubcatValue = signal('');
  readonly newBrandValue  = signal('');
  readonly setupUnitOptions = signal('');
  readonly setupDefaultUnit = signal('');
  readonly setupWarrantyOptions = signal('');

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
  readonly newFieldRequired = signal(false);
  readonly newFieldPlaceholder = signal('');
  readonly newFieldMin = signal<number | null>(null);
  readonly editingSharedField = signal(false);
  /** Key of the field currently being edited (null = adding a new field). */
  readonly editingFieldKey = signal<string | null>(null);
  readonly fieldDialogOpen = signal(false);
  readonly fieldTypeOptions: ProductFieldType[] = ['text', 'number', 'textarea', 'select', 'pills', 'color-pills', 'computed'];
  readonly sharedFieldTypeOptions: ProductFieldType[] = ['text', 'number', 'textarea', 'select', 'pills', 'color-pills'];
  readonly fieldPresets: FieldPreset[] = [
    { label: 'Short text', hint: 'Name, model, code', type: 'text', fieldName: 'Model', fieldKey: 'model' },
    { label: 'Long text', hint: 'Notes, description', type: 'textarea', fieldName: 'Description', fieldKey: 'description' },
    { label: 'Number', hint: 'Size, weight, rating', type: 'number', fieldName: 'Size', fieldKey: 'size' },
    { label: 'Dropdown', hint: 'Choose one value', type: 'select', fieldName: 'Type', fieldKey: 'type' },
    { label: 'Multi-select', hint: 'Choose several values', type: 'pills', fieldName: 'Features', fieldKey: 'features' },
    { label: 'Yes / No', hint: 'A simple choice', type: 'select', fieldName: 'Available', fieldKey: 'available', options: 'Yes, No' },
  ];
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
    void this.config.loadConfig().then(() => {
      this.menuDraft.set(this.orderedMenus().map(menu => ({ ...menu })));
    });
  }

  goBack(): void { this.router.navigate(['/admin']); }

  activeCategory(): DynamicCategory | null {
    const categories = this.config.categories();
    return categories.find(cat => cat.id === this.expandedCatId()) ?? categories[0] ?? null;
  }

  filteredCategories(): DynamicCategory[] {
    const query = this.categorySearch().trim().toLocaleLowerCase();
    if (!query) return this.config.categories();
    return this.config.categories().filter(category =>
      `${category.name} ${category.description}`.toLocaleLowerCase().includes(query)
    );
  }

  selectCategory(catId: string): void {
    this.expandedCatId.set(catId);
    this.expandedTab.set('fields');
    this.showCatForm.set(false);
    this.editingCatId.set(null);
  }

  useFieldPreset(cat: DynamicCategory, preset: FieldPreset): void {
    const usedKeys = new Set([
      ...this.fieldsOf(cat).map(field => field.key),
      ...this.config.sharedFields().map(field => field.key),
    ]);
    let key = preset.fieldKey;
    let suffix = 2;
    while (usedKeys.has(key)) key = `${preset.fieldKey}${suffix++}`;

    this.editingFieldKey.set(null);
    this.editingSharedField.set(false);
    this.newFieldType.set(preset.type);
    this.newFieldLabel.set(preset.fieldName);
    this.newFieldKey.set(key);
    this.newFieldOptions.set(preset.options ?? '');
    this.newFieldGroup.set('specs');
    this.newFieldSubcats.set([]);
    this.newFieldPrefix.set('');
    this.newFieldSuffix.set('');
    this.newFieldFormula.set('');
    this.newFieldPlaceholder.set('');
    this.newFieldMin.set(null);
    this.newFieldRequired.set(false);
    this.newFieldIncludeInBill.set(false);
    this.fieldDialogOpen.set(true);
  }

  menuIcon(id: string): string {
    if (!['categories', 'shared', 'units', 'warranty'].includes(id)) return '☷';
    return {
      categories: '▦',
      shared: '＋',
      units: '↔',
      warranty: '◇',
    }[id as 'categories' | 'shared' | 'units' | 'warranty'];
  }

  categoryIconColor(id: string): string {
    return {
      fitting: '#ff9f43',
      mixers: '#5b9bff',
      'drill-bits': '#c9a27e',
      fans: '#b58cff',
    }[id] ?? this.config.categories().find(category => category.id === id)?.color ?? '#3ddc97';
  }

  openMenu(id: string): void {
    this.section.set(id);
    if (id === 'shared') this.startAddSharedField();
  }

  toggleCategoriesMenu(): void {
    if (this.section() !== 'categories') {
      this.openMenu('categories');
      this.categoriesExpanded.set(true);
      return;
    }
    this.categoriesExpanded.update(expanded => !expanded);
  }

  isCustomMenu(id: string): boolean {
    return this.config.catalogueMenus().some(menu => menu.id === id && menu.custom === true);
  }

  activeCustomMenu(): CatalogueMenuItem | null {
    return this.config.catalogueMenus().find(menu => menu.id === this.section() && menu.custom === true) ?? null;
  }

  addMenuToDraft(): void {
    const label = this.newMenuName().trim();
    if (!label) return;
    if ([...this.config.catalogueMenus(), ...this.menuDraft()]
      .some(menu => menu.label.trim().toLowerCase() === label.toLowerCase())) {
      this.saveError.set('A catalogue menu with this name already exists.');
      return;
    }
    const baseId = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-menu';
    const ids = new Set([...this.config.catalogueMenus(), ...this.menuDraft()].map(menu => menu.id));
    let id = baseId;
    let suffix = 2;
    const usedFieldKeys = new Set([
      ...this.config.sharedFields().map(field => field.key),
      ...this.config.categories().flatMap(category => (category.fieldConfig?.fields ?? []).map(field => field.key)),
    ]);
    while (ids.has(id) || usedFieldKeys.has(catalogueMenuFieldKey(id))) id = `${baseId}-${suffix++}`;
    this.menuDraft.update(menus => [
      ...menus,
      { id, label, visible: true, order: menus.length, custom: true, options: [] },
    ]);
    this.newMenuName.set('');
  }

  removeMenuFromDraft(menu: CatalogueMenuItem): void {
    if (menu.id === 'categories') return;
    const confirmed = confirm(
      menu.custom
        ? `Delete "${menu.label}" and all of its saved options?`
        : `Delete the "${menu.label}" menu and its saved settings? This cannot be undone.`
    );
    if (!confirmed) return;
    this.menuDraft.update(menus => menus
      .filter(existing => existing.id !== menu.id)
      .sort((a, b) => a.order - b.order)
      .map((existing, order) => ({ ...existing, order })));
  }

  async addCustomMenuOption(menu: CatalogueMenuItem): Promise<void> {
    const option = this.newMenuOption().trim();
    if (!option) return;
    if ((menu.options ?? []).some(existing => existing.toLowerCase() === option.toLowerCase())) {
      this.saveError.set('That option already exists in this menu.');
      return;
    }
    this.config.catalogueMenus.update(menus => menus.map(existing =>
      existing.id === menu.id ? { ...existing, options: [...(existing.options ?? []), option] } : existing
    ));
    this.newMenuOption.set('');
    await this.persist();
  }

  async removeCustomMenuOption(menu: CatalogueMenuItem, option: string): Promise<void> {
    this.config.catalogueMenus.update(menus => menus.map(existing =>
      existing.id === menu.id
        ? { ...existing, options: (existing.options ?? []).filter(value => value !== option) }
        : existing
    ));
    await this.persist();
  }

  openMenuSettings(): void {
    this.menuDraft.set(this.orderedMenus().map(menu => ({ ...menu })));
    this.section.set('menuSetup');
  }

  updateMenuDraft(id: CatalogueMenuId, changes: Partial<CatalogueMenuItem>): void {
    this.menuDraft.update(menus => menus.map(menu => menu.id === id ? { ...menu, ...changes } : menu));
  }

  moveMenu(id: CatalogueMenuId, direction: -1 | 1): void {
    this.menuDraft.update(menus => {
      const ordered = [...menus].sort((a, b) => a.order - b.order);
      const index = ordered.findIndex(menu => menu.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ordered.length) return menus;
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      return ordered.map((menu, order) => ({ ...menu, order }));
    });
  }

  cancelMenuSettings(): void {
    this.menuDraft.set(this.orderedMenus().map(menu => ({ ...menu })));
    this.section.set('categories');
  }

  async saveMenuSettings(): Promise<void> {
    const labels = this.menuDraft().map(menu => menu.label.trim().toLowerCase()).filter(Boolean);
    if (new Set(labels).size !== labels.length) {
      this.saveError.set('Each catalogue menu must have a unique name.');
      return;
    }
    const normalized = [...this.menuDraft()]
      .sort((a, b) => a.order - b.order)
      .map((menu, order) => ({ ...menu, order, label: menu.label.trim() || menu.id }));
    const removedMenus = this.config.catalogueMenus().filter(menu =>
      !normalized.some(candidate => candidate.id === menu.id)
    );
    this.config.catalogueMenus.set(normalized);
    for (const menu of removedMenus) {
      if (menu.id === 'shared') this.config.sharedFields.set([]);
      if (menu.id === 'units') this.config.units.set([]);
      if (menu.id === 'warranty') this.config.warrantyOptions.set([]);
    }
    await this.persist();
    this.menuDraft.set(normalized.map(menu => ({ ...menu })));
  }

  startAddSharedField(): void {
    this.resetFieldForm();
  }

  editSharedField(field: ProductField): void {
    this.editField(field);
    this.editingSharedField.set(true);
  }

  async saveSharedField(): Promise<void> {
    const field = this.fieldFromForm([]);
    if (!field) return;
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field.key)) {
      this.saveError.set('Use a field key that starts with a letter and contains only letters, numbers or underscores.');
      return;
    }
    const editingKey = this.editingFieldKey();
    const fields = this.config.sharedFields();
    if (editingKey) {
      this.config.sharedFields.set(fields.map(existing => existing.key === editingKey ? field : existing));
    } else {
      if (fields.some(existing => existing.key === field.key)) {
        this.saveError.set('A shared field with this key already exists.');
        return;
      }
      if (this.config.categories().some(category =>
        category.fieldConfig?.fields.some(existing => existing.key === field.key)
      )) {
        this.saveError.set('This key is already used by a category field. Choose a unique field key.');
        return;
      }
      this.config.sharedFields.set([...fields, field]);
    }
    this.resetFieldForm();
    this.fieldDialogOpen.set(false);
    await this.persist();
  }

  async removeSharedField(field: ProductField): Promise<void> {
    this.config.sharedFields.update(fields => fields.filter(existing => existing.key !== field.key));
    await this.persist();
  }

  async toggleSharedFieldBill(field: ProductField): Promise<void> {
    this.config.sharedFields.update(fields => fields.map(existing => {
      if (existing.key !== field.key) return existing;
      const next = { ...existing };
      if (next.includeInBill) delete next.includeInBill;
      else next.includeInBill = true;
      return next;
    }));
    await this.persist();
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
    this.categoryNameError.set(false);
    this.iconPickerOpen.set(false);
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
    this.categoryNameError.set(false);
    this.iconPickerOpen.set(false);
    this.catFormName.set(cat.name);
    this.catFormDesc.set(cat.description);
    this.catFormIcon.set(cat.icon);
    this.catFormColor.set(cat.color);
    this.catFormSheetName.set(cat.sheetName);
    this.showCatForm.set(true);
    this.expandedCatId.set(cat.id);
  }

  cancelCatForm(): void {
    this.showCatForm.set(false);
    this.editingCatId.set(null);
    this.categoryNameError.set(false);
    this.iconPickerOpen.set(false);
  }

  toggleIconPicker(): void {
    this.iconPickerOpen.update(open => !open);
  }

  async saveCatForm(): Promise<void> {
    const name = this.catFormName().trim();
    if (!name) {
      this.categoryNameError.set(true);
      return;
    }
    this.categoryNameError.set(false);
    const editId = this.editingCatId();
    const id = editId ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id || (!editId && this.config.categories().some(cat => cat.id === id))) {
      this.saveError.set('A category with this name already exists, or the name is invalid.');
      return;
    }
    if (editId) {
      this.config.deletedCategoryIds.update(ids => ids.filter(deletedId => deletedId !== editId));
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
      this.config.deletedCategoryIds.update(ids => ids.filter(deletedId => deletedId !== id));
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
    this.expandedCatId.set(id);
    this.expandedTab.set('fields');
    const selectedCategory = this.config.categories().find(category => category.id === id);
    if (selectedCategory) this.editCategorySetup(selectedCategory);
    this.showCatForm.set(false);
    this.editingCatId.set(null);
    await this.persist();
  }

  async deleteCategory(id: string): Promise<void> {
    this.config.deletedCategoryIds.update(ids => ids.includes(id) ? ids : [...ids, id]);
    this.config.categories.update(cats => cats.filter(c => c.id !== id));
    if (this.expandedCatId() === id) this.expandedCatId.set(null);
    await this.persist();
  }

  toggleSubs(catId: string): void {
    if (this.expandedCatId() === catId) {
      this.expandedCatId.set(null);
    } else {
      this.expandedCatId.set(catId);
      this.expandedTab.set('fields');
    }
    this.newSubcatValue.set('');
    this.newBrandValue.set('');
  }

  editCategorySetup(cat: DynamicCategory): void {
    const fieldConfig = cat.fieldConfig ?? defaultFieldConfig(cat.id);
    this.setupUnitOptions.set((fieldConfig.unitOptions ?? []).join(', '));
    this.setupDefaultUnit.set(fieldConfig.defaultUnit ?? '');
    this.setupWarrantyOptions.set((fieldConfig.warrantyOptions ?? []).join(', '));
  }

  async saveCategorySetup(cat: DynamicCategory): Promise<void> {
    const splitValues = (value: string) =>
      [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
    const unitOptions = splitValues(this.setupUnitOptions());
    const defaultUnit = this.setupDefaultUnit().trim();
    const warrantyOptions = splitValues(this.setupWarrantyOptions());

    if (defaultUnit && !(unitOptions.length ? unitOptions : this.config.units()).includes(defaultUnit)) {
      this.saveError.set('The default unit must be included in this category’s unit options.');
      return;
    }

    this.config.categories.update(categories => categories.map(category => {
      if (category.id !== cat.id) return category;
      const fieldConfig = { ...(category.fieldConfig ?? defaultFieldConfig(category.id)) };
      if (unitOptions.length) fieldConfig.unitOptions = unitOptions;
      else delete fieldConfig.unitOptions;
      if (defaultUnit) fieldConfig.defaultUnit = defaultUnit;
      else delete fieldConfig.defaultUnit;
      if (warrantyOptions.length) fieldConfig.warrantyOptions = warrantyOptions;
      else delete fieldConfig.warrantyOptions;
      return { ...category, fieldConfig };
    }));
    await this.persist();
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

  fieldTypeLabel(type: ProductFieldType): string {
    return type === 'pills' ? 'Multi-select' : type === 'color-pills' ? 'Colour choices' : type.charAt(0).toUpperCase() + type.slice(1);
  }

  fieldOptionsOf(field: ProductField): string[] {
    return field.type === 'color-pills'
      ? (field.colorOptions ?? []).map(option => option.label)
      : field.options ?? [];
  }

  async updateCategoryField(catId: string, field: ProductField, changes: Partial<ProductField>): Promise<void> {
    this.mutateFieldConfig(catId, fields => fields.map(existing => {
      if (existing.key !== field.key) return existing;
      const next = { ...existing, ...changes };
      if (changes.type && changes.type !== existing.type) {
        const choices = existing.type === 'color-pills'
          ? (existing.colorOptions ?? []).map(option => option.label)
          : existing.options ?? [];
        if (changes.type === 'color-pills') {
          next.colorOptions = choices.map(label => ({ label, hex: colorNameToHex(label) }));
          delete next.options;
        } else {
          next.options = choices;
          delete next.colorOptions;
        }
      }
      return next;
    }));
    await this.persist();
  }

  async addFieldOptions(catId: string, field: ProductField, input: HTMLInputElement): Promise<void> {
    const additions = input.value.split(',').map(value => value.trim()).filter(Boolean);
    if (!additions.length) return;
    const choices = [...new Set([...this.fieldOptionsOf(field), ...additions])];
    const changes: Partial<ProductField> = field.type === 'color-pills'
      ? { colorOptions: choices.map(label => ({ label, hex: colorNameToHex(label) })) }
      : { options: choices };
    input.value = '';
    await this.updateCategoryField(catId, field, changes);
  }

  async removeFieldOption(catId: string, field: ProductField, index: number): Promise<void> {
    const choices = this.fieldOptionsOf(field).filter((_, optionIndex) => optionIndex !== index);
    const changes: Partial<ProductField> = field.type === 'color-pills'
      ? { colorOptions: choices.map(label => ({ label, hex: colorNameToHex(label) })) }
      : { options: choices };
    await this.updateCategoryField(catId, field, changes);
  }

  async toggleCategoryFieldSubcategory(catId: string, field: ProductField, subcategory: string): Promise<void> {
    const current = field.showForSubcategories ?? [];
    const selected = current.includes(subcategory)
      ? current.filter(value => value !== subcategory)
      : [...current, subcategory];
    await this.updateCategoryField(catId, field, { showForSubcategories: selected.length ? selected : undefined });
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
    const subcats = this.newFieldSubcats().filter(Boolean);
    const field = this.fieldFromForm(subcats);
    if (!field) return;
    const key = field.key;
    const editingKey = this.editingFieldKey();
    const category = this.config.categories().find(cat => cat.id === catId);
    if (!category) {
      this.saveError.set('The selected category could not be found.');
      return;
    }
    if (!editingKey && (category.fieldConfig?.fields ?? []).some(existing => existing.key === key)) {
      this.saveError.set('A field with this key already exists in this category.');
      return;
    }
    if (!editingKey && this.config.sharedFields().some(existing => existing.key === key)) {
      this.saveError.set('This key is already used by a shared field. Choose a unique field key.');
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
      this.saveError.set('Use a field key that starts with a letter and contains only letters, numbers or underscores.');
      return;
    }

    if (editingKey) {
      this.mutateFieldConfig(catId, fields =>
        fields.map(existing => existing.key === editingKey ? field : existing)
      );
    } else {
      this.mutateFieldConfig(catId, fields => [...fields, field]);
    }
    this.resetFieldForm();
    this.fieldDialogOpen.set(false);
    await this.persist();
  }

  private fieldFromForm(subcats: string[]): ProductField | null {
    const key = this.newFieldKey().trim();
    const label = this.newFieldLabel().trim();
    if (!key || !label) return null;
    const type = this.newFieldType();
    const rawOptions = [...new Set(this.newFieldOptions().split(',').map(option => option.trim()).filter(Boolean))];
    const field: ProductField = { key, label, type, group: this.newFieldGroup() };
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
      if (!formula) return null;
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
    if (this.newFieldRequired()) field.required = true;
    const placeholder = this.newFieldPlaceholder().trim();
    if (placeholder) field.placeholder = placeholder;
    const min = this.newFieldMin();
    if (type === 'number' && min !== null && Number.isFinite(min)) field.min = min;
    return field;
  }

  /** Load an existing field into the editor for in-place editing. */
  editField(field: ProductField): void {
    this.editingSharedField.set(false);
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
    this.newFieldRequired.set(!!field.required);
    this.newFieldPlaceholder.set(field.placeholder ?? '');
    this.newFieldMin.set(field.min ?? null);
    this.fieldDialogOpen.set(true);
  }

  /** Cancel an in-progress field edit and clear the form. */
  cancelFieldEdit(): void {
    this.resetFieldForm();
    this.fieldDialogOpen.set(false);
  }

  private resetFieldForm(): void {
    this.editingFieldKey.set(null);
    this.editingSharedField.set(false);
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
    this.newFieldRequired.set(false);
    this.newFieldPlaceholder.set('');
    this.newFieldMin.set(null);
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
