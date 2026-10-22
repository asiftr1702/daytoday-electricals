import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { CATEGORIES, UNITS, WARRANTY_OPTIONS } from '../config/categories.config';
import { CategoryFieldConfig, defaultFieldConfig, ProductField } from '../config/product-fields.config';

export interface DynamicCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  sheetName: string;
  color: string;
  subcategories: string[];
  brands: string[];
  /** Drives the dynamic product-admin form (pricing mode + spec fields). */
  fieldConfig?: CategoryFieldConfig;
}

/** Ensures every category has a `fieldConfig`, falling back to per-category defaults. */
function withFieldConfig(cat: DynamicCategory): DynamicCategory {
  const fieldConfig = cat.fieldConfig
    ? { ...cat.fieldConfig }
    : defaultFieldConfig(cat.id);
  const legacyUnits = ['Piece', 'Roll', 'Bundle', 'Meter', 'Pack', 'Box', 'Dozen'];
  const legacyWarranty = ['No warranty', '6 months', '1 year', '2 years', '3 years'];

  // Older saved defaults were copied into every category and shadowed shop-wide settings.
  if (fieldConfig.unitOptions?.length === legacyUnits.length &&
      fieldConfig.unitOptions.every((unit, index) => unit === legacyUnits[index])) {
    delete fieldConfig.unitOptions;
  }
  if (fieldConfig.warrantyOptions?.length === legacyWarranty.length &&
      fieldConfig.warrantyOptions.every((option, index) => option === legacyWarranty[index])) {
    delete fieldConfig.warrantyOptions;
  }

  return { ...cat, fieldConfig };
}

/** Migrates legacy category ids to the latest naming. */
function normalizeCategory(cat: DynamicCategory): DynamicCategory {
  if (cat.id === 'repaid-items') {
    return {
      ...cat,
      id: 'repair-items',
      name: 'Repair Items',
      sheetName: cat.sheetName === 'RepaidItems' ? 'RepairItems' : cat.sheetName,
    };
  }
  return cat;
}

export interface DynamicWarrantyOption {
  value: string;
  label: string;
}

export type CatalogueMenuId = 'categories' | 'shared' | 'units' | 'warranty' | (string & {});

export interface CatalogueMenuItem {
  id: CatalogueMenuId;
  label: string;
  visible: boolean;
  order: number;
  custom?: boolean;
  options?: string[];
  required?: boolean;
  includeInBill?: boolean;
}

const DEFAULT_CATALOGUE_MENUS: CatalogueMenuItem[] = [
  { id: 'categories', label: 'Categories & fields', visible: true, order: 0 },
  { id: 'shared', label: 'Shared product fields', visible: true, order: 1 },
  { id: 'units', label: 'Units of measure', visible: true, order: 2 },
  { id: 'warranty', label: 'Warranty options', visible: true, order: 3 },
];

const BUILT_IN_MENU_IDS = new Set(['categories', 'shared', 'units', 'warranty']);

function normalizeCatalogueMenus(saved: unknown): CatalogueMenuItem[] {
  if (!Array.isArray(saved)) return DEFAULT_CATALOGUE_MENUS.map(menu => ({ ...menu }));

  const valid = (saved as Partial<CatalogueMenuItem>[])
    .filter((menu): menu is Partial<CatalogueMenuItem> & Pick<CatalogueMenuItem, 'id' | 'label' | 'visible' | 'order'> =>
      typeof menu.id === 'string' &&
      typeof menu.label === 'string' &&
      typeof menu.visible === 'boolean' &&
      typeof menu.order === 'number' &&
      Number.isFinite(menu.order)
    )
    .map(menu => ({
      id: menu.id,
      label: menu.label.trim(),
      visible: menu.visible,
      order: menu.order,
      ...(menu.custom === true ? {
        custom: true,
        options: Array.isArray(menu.options) ? menu.options.filter((option): option is string => typeof option === 'string') : [],
        required: menu.required === true,
        includeInBill: menu.includeInBill === true,
      } : {}),
    }))
    .filter(menu => menu.label.length > 0)
    .sort((a, b) => a.order - b.order);

  const byId = new Map<string, CatalogueMenuItem>();
  for (const menu of valid) {
    if (!byId.has(menu.id)) byId.set(menu.id, menu);
  }

  const selected = [...byId.values()].sort((a, b) => {
    if (a.id === 'categories') return -1;
    if (b.id === 'categories') return 1;
    if (BUILT_IN_MENU_IDS.has(a.id) !== BUILT_IN_MENU_IDS.has(b.id)) {
      return BUILT_IN_MENU_IDS.has(a.id) ? -1 : 1;
    }
    return a.order - b.order;
  });
  const seenLabels = new Set<string>();
  const unique = selected.filter(menu => {
    const normalizedLabel = menu.label.trim().toLocaleLowerCase();
    if (seenLabels.has(normalizedLabel)) return false;
    seenLabels.add(normalizedLabel);
    return true;
  }).sort((a, b) => a.order - b.order);

  if (!unique.some(menu => menu.id === 'categories')) {
    unique.push({ ...DEFAULT_CATALOGUE_MENUS[0], order: unique.length });
  }
  return unique.map((menu, order) => ({ ...menu, order }));
}

export function catalogueMenuFieldKey(id: string): string {
  return `catalogue_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

@Injectable({ providedIn: 'root' })
export class CatalogueConfigService {
  private readonly firestore = inject(Firestore);
  private readonly platformId = inject(PLATFORM_ID);

  readonly categories = signal<DynamicCategory[]>(
    CATEGORIES.map(c => withFieldConfig({ ...c, subcategories: [...c.subcategories], brands: [] }))
  );
  readonly units = signal<string[]>([...UNITS]);
  readonly warrantyOptions = signal<DynamicWarrantyOption[]>([...WARRANTY_OPTIONS]);
  readonly sharedFields = signal<ProductField[]>([]);
  readonly catalogueMenus = signal<CatalogueMenuItem[]>(DEFAULT_CATALOGUE_MENUS.map(menu => ({ ...menu })));
  readonly deletedCategoryIds = signal<string[]>([]);
  readonly loaded = signal(false);

  async loadConfig(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.loaded()) return;
    try {
      const snap = await getDoc(doc(this.firestore, 'config', 'catalogue'));
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data['deletedCategoryIds'])) {
          this.deletedCategoryIds.set(
            data['deletedCategoryIds'].filter((id): id is string => typeof id === 'string')
          );
        }
        if (Array.isArray(data['categories'])) {
          // Keep remote ordering/config, but ensure new default categories are still available.
          const remote = data['categories'].map((c: DynamicCategory) =>
            withFieldConfig(normalizeCategory({ ...c, brands: c.brands ?? [] })));
          const defaults = CATEGORIES.map(c =>
            withFieldConfig(normalizeCategory({ ...c, subcategories: [...c.subcategories], brands: [] })));
          const deletedIds = new Set(this.deletedCategoryIds());

          const merged = new Map<string, DynamicCategory>();
          for (const c of remote) merged.set(c.id, c);
          for (const c of defaults) {
            if (!merged.has(c.id) && !deletedIds.has(c.id)) merged.set(c.id, c);
          }
          this.categories.set(Array.from(merged.values()));
        }
        if (Array.isArray(data['units'])) {
          this.units.set(data['units']);
        }
        if (Array.isArray(data['warrantyOptions'])) {
          this.warrantyOptions.set(data['warrantyOptions']);
        }
        if (Array.isArray(data['sharedFields'])) {
          this.sharedFields.set(data['sharedFields'] as ProductField[]);
        }
        if (Array.isArray(data['catalogueMenus'])) {
          this.catalogueMenus.set(normalizeCatalogueMenus(data['catalogueMenus']));
        }
      }
    } catch {
      // silent — fall back to hardcoded defaults
    }
    this.loaded.set(true);
  }

  async save(): Promise<void> {
    const catalogueMenus = normalizeCatalogueMenus(this.catalogueMenus());
    this.catalogueMenus.set(catalogueMenus);
    await setDoc(doc(this.firestore, 'config', 'catalogue'), {
      categories: this.categories(),
      units: this.units(),
      warrantyOptions: this.warrantyOptions(),
      sharedFields: this.sharedFields(),
      catalogueMenus,
      deletedCategoryIds: this.deletedCategoryIds(),
    });
  }
}
