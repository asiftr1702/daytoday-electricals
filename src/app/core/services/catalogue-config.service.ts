import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { CATEGORIES, UNITS, WARRANTY_OPTIONS } from '../config/categories.config';
import { CategoryFieldConfig, defaultFieldConfig } from '../config/product-fields.config';

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
  return { ...cat, fieldConfig: cat.fieldConfig ?? defaultFieldConfig(cat.id) };
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

@Injectable({ providedIn: 'root' })
export class CatalogueConfigService {
  private readonly firestore = inject(Firestore);
  private readonly platformId = inject(PLATFORM_ID);

  readonly categories = signal<DynamicCategory[]>(
    CATEGORIES.map(c => withFieldConfig({ ...c, subcategories: [...c.subcategories], brands: [] }))
  );
  readonly units = signal<string[]>([...UNITS]);
  readonly warrantyOptions = signal<DynamicWarrantyOption[]>([...WARRANTY_OPTIONS]);
  readonly loaded = signal(false);

  async loadConfig(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.loaded()) return;
    try {
      const snap = await getDoc(doc(this.firestore, 'config', 'catalogue'));
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data['categories']) && data['categories'].length) {
          // Keep remote ordering/config, but ensure new default categories are still available.
          const remote = data['categories'].map((c: DynamicCategory) =>
            withFieldConfig(normalizeCategory({ ...c, brands: c.brands ?? [] })));
          const defaults = CATEGORIES.map(c =>
            withFieldConfig(normalizeCategory({ ...c, subcategories: [...c.subcategories], brands: [] })));

          const merged = new Map<string, DynamicCategory>();
          for (const c of remote) merged.set(c.id, c);
          for (const c of defaults) {
            if (!merged.has(c.id)) merged.set(c.id, c);
          }
          this.categories.set(Array.from(merged.values()));
        }
        if (Array.isArray(data['units']) && data['units'].length) {
          this.units.set(data['units']);
        }
        if (Array.isArray(data['warrantyOptions']) && data['warrantyOptions'].length) {
          this.warrantyOptions.set(data['warrantyOptions']);
        }
      }
    } catch {
      // silent — fall back to hardcoded defaults
    }
    this.loaded.set(true);
  }

  async save(): Promise<void> {
    await setDoc(doc(this.firestore, 'config', 'catalogue'), {
      categories: this.categories(),
      units: this.units(),
      warrantyOptions: this.warrantyOptions(),
    });
  }
}
