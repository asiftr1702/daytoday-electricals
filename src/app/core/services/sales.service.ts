import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SaleEntry } from '../models/sale.model';

@Injectable({ providedIn: 'root' })
export class SalesService {
  private readonly firestore = inject(Firestore);
  private readonly COLLECTION = 'sales';

  addSale(sale: SaleEntry): Observable<string> {
    const col = collection(this.firestore, this.COLLECTION);
    return from(addDoc(col, { ...sale, createdAt: Timestamp.now() })).pipe(
      map(ref => ref.id)
    );
  }

  getSalesByDate(date: string): Observable<SaleEntry[]> {
    const col = collection(this.firestore, this.COLLECTION);
    const q = query(col, where('date', '==', date));
    return from(getDocs(q)).pipe(
      map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as SaleEntry))
        .sort((a, b) => (a.createdAt as any)?.seconds - (b.createdAt as any)?.seconds))
    );
  }

  getSalesByDateRange(from_: string, to: string): Observable<SaleEntry[]> {
    const col = collection(this.firestore, this.COLLECTION);
    const q = query(
      col,
      where('date', '>=', from_),
      where('date', '<=', to)
    );
    return from(getDocs(q)).pipe(
      map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as SaleEntry))
        .sort((a, b) => {
          const dateCmp = (a.date ?? '').localeCompare(b.date ?? '');
          if (dateCmp !== 0) return dateCmp;
          return ((a.createdAt as any)?.seconds ?? 0) - ((b.createdAt as any)?.seconds ?? 0);
        }))
    );
  }

  deleteSale(id: string): Observable<void> {
    return from(deleteDoc(doc(this.firestore, this.COLLECTION, id)));
  }
}
