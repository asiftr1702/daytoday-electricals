import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { CATEGORIES, UNITS, WARRANTY_OPTIONS } from '../config/categories.config';

export interface DynamicCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  sheetName: string;
  color: string;
  subcategories: string[];
  brands: string[];
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
    CATEGORIES.map(c => ({ ...c, subcategories: [...c.subcategories], brands: [] }))
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
          // ensure legacy entries without brands field get an empty array
          this.categories.set(data['categories'].map((c: DynamicCategory) => ({ ...c, brands: c.brands ?? [] })));
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
