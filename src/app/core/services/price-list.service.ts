import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  Timestamp,
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
  /** Optional unit label (e.g. pcs, mtr). */
  unit?: string;
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
}
