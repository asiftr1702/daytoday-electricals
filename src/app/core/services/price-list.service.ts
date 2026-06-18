import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  Timestamp,
  setDoc,
  arrayUnion,
} from '@angular/fire/firestore';

/** A single simple price-list row, stored independently of the main product catalogue. */
export interface PriceListEntry {
  id?: string;
  /** Product name (editable). */
  name: string;
  /** Selling price shown to the customer (editable). */
  sellPrice: number | null;
  /** Actual cost price — hidden by default, revealed on long-press (editable). */
  costPrice?: number | null;
  /** Category id used only for grouping on the page. */
  category: string;
  /** Optional subcategory label (used for fan section mapping). */
  subcategory?: string;
  /** Optional unit label (e.g. pcs, mtr). */
  unit?: string;
  /** Wire/cable bundle length in metres — used to derive the per-metre price. */
  bundleLength?: number | null;
  /** Current stock count. null/undefined means not tracked. */
  stock?: number | null;
  /** Manual low-stock flag for tracking items to reorder. */
  manualLowStock?: boolean;
  /** Optional product image stored as a base64 data URL. */
  imageUrl?: string | null;
}

/** Category metadata used by the price list page. */
export interface PriceListCategory {
  /** Stable id used by price-list entries as `category`. */
  id: string;
  /** Display name in UI. */
  name: string;
  /** Subcategories rendered as tabs for the category. */
  subcategories: string[];
}

/**
 * Stores the simplified price list in its OWN Firestore collection (`priceList`),
 * fully independent of the rich product catalogue. Editing a name/price here never
 * touches the real product documents.
 */
@Injectable({ providedIn: 'root' })
export class PriceListService {
  private readonly firestore = inject(Firestore);
  private readonly col = 'priceList';
  private readonly categoryCol = 'priceListCategories';

  /** Read every price-list row. */
  async getAll(): Promise<PriceListEntry[]> {
    const snap = await getDocs(collection(this.firestore, this.col));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<PriceListEntry, 'id'>) }));
  }

  /** Read only the rows for one category (fast, fetched on demand). */
  async getByCategory(category: string): Promise<PriceListEntry[]> {
    const q = query(collection(this.firestore, this.col), where('category', '==', category));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<PriceListEntry, 'id'>) }));
  }

  /** Add a new row; returns the created document id. */
  async add(entry: Omit<PriceListEntry, 'id'>): Promise<string> {
    const ref = await addDoc(collection(this.firestore, this.col), {
      ...entry,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return ref.id;
  }

  /** Update an existing row's editable fields. */
  async update(id: string, patch: Partial<Omit<PriceListEntry, 'id'>>): Promise<void> {
    await updateDoc(doc(this.firestore, this.col, id), {
      ...patch,
      updatedAt: Timestamp.now(),
    });
  }

  /** Delete a row. */
  async remove(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, this.col, id));
  }

  /** Bulk-insert rows (used for the one-time import from the product catalogue). */
  async importMany(entries: Omit<PriceListEntry, 'id'>[]): Promise<void> {
    await Promise.all(entries.map(e => this.add(e)));
  }

  /** Get all items marked as manually low-stock (for the low-stock tracking page). */
  async getManualLowStock(): Promise<PriceListEntry[]> {
    const q = query(collection(this.firestore, this.col), where('manualLowStock', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<PriceListEntry, 'id'>) }));
  }

  /** Read all price-list categories (with subcategories) from Firestore. */
  async getCategories(): Promise<PriceListCategory[]> {
    const snap = await getDocs(collection(this.firestore, this.categoryCol));
    return snap.docs.map(d => {
      const data = d.data() as Partial<PriceListCategory>;
      return {
        id: d.id,
        name: (data.name ?? d.id).trim(),
        subcategories: Array.isArray(data.subcategories)
          ? data.subcategories.filter(s => typeof s === 'string').map(s => s.trim()).filter(Boolean)
          : [],
      };
    });
  }

  /** Create/update one category document. */
  async createCategory(name: string, subcategories: string[] = []): Promise<string> {
    const cleanName = name.trim();
    const id = this.slugifyCategoryId(cleanName);
    return this.upsertCategory(id, cleanName, subcategories);
  }

  /** Create/update one category document using an explicit category id. */
  async upsertCategory(categoryId: string, name: string, subcategories: string[] = []): Promise<string> {
    const cleanName = name.trim();
    const id = this.slugifyCategoryId(categoryId);
    const uniqSubs = Array.from(new Set(subcategories.map(s => s.trim()).filter(Boolean)));
    await setDoc(doc(this.firestore, this.categoryCol, id), {
      name: cleanName,
      subcategories: uniqSubs,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }, { merge: true });
    return id;
  }

  /** Add one subcategory to an existing category document. */
  async addSubcategory(categoryId: string, subcategory: string): Promise<void> {
    const cat = categoryId.trim().toLowerCase();
    const sub = subcategory.trim();
    if (!cat || !sub) return;
    // setDoc with merge so item-derived categories (no doc yet) are created.
    await setDoc(doc(this.firestore, this.categoryCol, cat), {
      subcategories: arrayUnion(sub),
      updatedAt: Timestamp.now(),
    }, { merge: true });
  }

  /** Update an existing subcategory name in a category. */
  async updateSubcategory(categoryId: string, oldName: string, newName: string): Promise<void> {
    const cat = categoryId.trim().toLowerCase();
    const old = oldName.trim();
    const neo = newName.trim();
    if (!cat || !old || !neo) return;

    // Update category document if it exists (otherwise the category is item-derived).
    const docRef = doc(this.firestore, this.categoryCol, cat);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as Partial<PriceListCategory>;
      const existing = data.subcategories ?? [];
      const subs = existing.includes(old)
        ? existing.map(s => (s === old ? neo : s))
        : [...existing, neo];
      await updateDoc(docRef, {
        subcategories: subs,
        updatedAt: Timestamp.now(),
      });
    }

    // Always update all items in this category that use the old subcategory name.
    const allItems = await this.getAll();
    const toUpdate = allItems.filter(item =>
      (item.category ?? '').trim().toLowerCase() === cat &&
      (item.subcategory ?? '').trim() === old
    );

    for (const item of toUpdate) {
      if (!item.id) continue;
      await updateDoc(doc(this.firestore, this.col, item.id), {
        subcategory: neo,
        updatedAt: Timestamp.now(),
      });
    }
  }

  /** Rename a category's display name (id stays the same). */
  async renameCategory(categoryId: string, newName: string): Promise<void> {
    const cat = categoryId.trim().toLowerCase();
    const name = newName.trim();
    if (!cat || !name) return;
    // Use setDoc with merge so item-derived categories (no doc yet) are created.
    await setDoc(doc(this.firestore, this.categoryCol, cat), {
      name,
      updatedAt: Timestamp.now(),
    }, { merge: true });
  }

  /** Delete a category document. Items keep their category field untouched. */
  async deleteCategory(categoryId: string): Promise<void> {
    const cat = categoryId.trim().toLowerCase();
    if (!cat) return;
    await deleteDoc(doc(this.firestore, this.categoryCol, cat));
  }

  /** Remove a subcategory from a category. Items keep their subcategory field. */
  async deleteSubcategory(categoryId: string, subcategory: string): Promise<void> {
    const cat = categoryId.trim().toLowerCase();
    const sub = subcategory.trim();
    if (!cat || !sub) return;
    const docRef = doc(this.firestore, this.categoryCol, cat);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as Partial<PriceListCategory>;
      const subs = (data.subcategories ?? []).filter(s => s !== sub);
      await updateDoc(docRef, {
        subcategories: subs,
        updatedAt: Timestamp.now(),
      });
    }
  }

  private slugifyCategoryId(name: string): string {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base || 'other';
  }
}
