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

  // Collection name in Firestore
  private readonly PRODUCTS_COLLECTION = 'products';

  /**
   * Update only the imageUrl of a product, looked up by SKU.
   */
  updateImageUrl(sku: string, imageUrl: string): Observable<void> {
    const q = query(
      collection(this.firestore, this.PRODUCTS_COLLECTION),
      where('sku', '==', sku)
    );
    return from(getDocs(q)).pipe(
      switchMap((snap) => {
        if (snap.empty) throw new Error(`Product SKU ${sku} not found in Firestore`);
        const docRef = doc(this.firestore, this.PRODUCTS_COLLECTION, snap.docs[0].id);
        return from(updateDoc(docRef, { imageUrl, updatedAt: Timestamp.now() }));
      })
    );
  }

  /**
   * Submit a new product to Firestore
   */
  submitProduct(product: Product, category: string): Observable<string> {
    const productsCollection = collection(this.firestore, this.PRODUCTS_COLLECTION);

    const productData = {
      ...product,
      category,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    return from(addDoc(productsCollection, productData)).pipe(
      map((docRef) => docRef.id)
    );
  }

  /**
   * Update an existing product
   */
  updateProduct(productId: string, product: Product): Observable<void> {
    const productDoc = doc(this.firestore, this.PRODUCTS_COLLECTION, productId);

    const productData = {
      ...product,
      updatedAt: Timestamp.now(),
    };

    return from(updateDoc(productDoc, productData));
  }

  /**
   * Get all products for a category
   */
  getProductsByCategory(category: string): Observable<Product[]> {
    const productsCollection = collection(this.firestore, this.PRODUCTS_COLLECTION);
    const q = query(productsCollection, where('category', '==', category));

    return from(getDocs(q)).pipe(
      map((querySnapshot) =>
        querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as unknown as Product))
      )
    );
  }

  /**
   * Atomically decrement stockQty by the given amount (default 1)
   */
  decrementStock(productId: string, by = 1): Observable<void> {
    const productDoc = doc(this.firestore, this.PRODUCTS_COLLECTION, productId);
    return from(updateDoc(productDoc, { stockQty: increment(-by), updatedAt: Timestamp.now() }));
  }

  /**
   * Delete a product by its Firestore document ID
   */
  deleteProduct(productId: string): Observable<void> {
    const productDoc = doc(this.firestore, this.PRODUCTS_COLLECTION, productId);
    return from(deleteDoc(productDoc));
  }

  /**
   * Get all products
   */
  getAllProducts(): Observable<Product[]> {
    const productsCollection = collection(this.firestore, this.PRODUCTS_COLLECTION);

    return from(getDocs(productsCollection)).pipe(
      map((querySnapshot) =>
        querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as unknown as Product))
      )
    );
  }
}
