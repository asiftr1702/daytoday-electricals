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
  increment,
} from '@angular/fire/firestore';
import { Observable, from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Product } from '../models/product.model';

/**
 * Firebase Admin Service
 *
 * Stores product data in Firestore (Firebase's NoSQL database)
 * No CORS issues, real-time updates, scales automatically
 */

@Injectable({
  providedIn: 'root',
})
export class FirebaseAdminService {
  private readonly firestore = inject(Firestore);

  /** Remove keys whose value is undefined — Firestore rejects them. */
  private stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
  }

  /**
   * Update only the imageUrl of a product, looked up by SKU within its category collection.
   */
  updateImageUrl(sku: string, imageUrl: string, category: string): Observable<void> {
    const q = query(
      collection(this.firestore, category),
      where('sku', '==', sku)
    );
    return from(getDocs(q)).pipe(
      switchMap((snap) => {
        if (snap.empty) throw new Error(`Product SKU ${sku} not found in Firestore`);
        const docRef = doc(this.firestore, category, snap.docs[0].id);
        return from(updateDoc(docRef, { imageUrl, updatedAt: Timestamp.now() }));
      })
    );
  }

  /**
   * Submit a new product to its category collection in Firestore.
   */
  submitProduct(product: Product, category: string): Observable<string> {
    const categoryCollection = collection(this.firestore, category);

    const productData = this.stripUndefined({
      ...product,
      category,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    return from(addDoc(categoryCollection, productData)).pipe(
      map((docRef) => docRef.id)
    );
  }

  /**
   * Update an existing product in its category collection.
   */
  updateProduct(productId: string, product: Product, category: string): Observable<void> {
    const productDoc = doc(this.firestore, category, productId);

    const productData = this.stripUndefined({
      ...product,
      updatedAt: Timestamp.now(),
    });

    return from(updateDoc(productDoc, productData));
  }

  /**
   * Get all products from a category's dedicated collection.
   */
  getProductsByCategory(category: string): Observable<Product[]> {
    const categoryCollection = collection(this.firestore, category);

    return from(getDocs(categoryCollection)).pipe(
      map((querySnapshot) =>
        querySnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        } as unknown as Product))
      )
    );
  }

  /**
   * Atomically decrement stockQty by the given amount (default 1).
   */
  decrementStock(productId: string, by = 1, category = ''): Observable<void> {
    const productDoc = doc(this.firestore, category, productId);
    return from(updateDoc(productDoc, { stockQty: increment(-by), updatedAt: Timestamp.now() }));
  }

  /**
   * Mark a product as discontinued (no longer restocked) or active again.
   */
  setDiscontinued(productId: string, category: string, discontinued: boolean): Observable<void> {
    const productDoc = doc(this.firestore, category, productId);
    return from(updateDoc(productDoc, { discontinued, updatedAt: Timestamp.now() }));
  }

  /**
   * Delete a product by its Firestore document ID from its category collection.
   */
  deleteProduct(productId: string, category: string): Observable<void> {
    const productDoc = doc(this.firestore, category, productId);
    return from(deleteDoc(productDoc));
  }

  /**
   * Get all products across all provided category collections.
   */
  getAllProducts(categories: string[]): Observable<Product[]> {
    return from(
      Promise.all(
        categories.map(cat =>
          getDocs(collection(this.firestore, cat)).then(snap =>
            snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as Product))
          )
        )
      )
    ).pipe(map(results => results.flat()));
  }
}
