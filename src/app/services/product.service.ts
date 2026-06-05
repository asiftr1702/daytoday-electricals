import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SheetsService } from './sheets.service';
import { Product } from '../models/product.model';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  constructor(private sheetsService: SheetsService) {}

  getProducts(): Observable<Product[]> {
    return this.sheetsService.getProducts() as Observable<Product[]>;
  }

  getProductsByCategory(category: string): Observable<Product[]> {
    return new Observable(observer => {
      this.getProducts().subscribe({
        next: (products) => {
          const filtered = products.filter(p => p.category === category);
          observer.next(filtered);
          observer.complete();
        },
        error: (err) => observer.error(err)
      });
    });
  }

  searchProducts(query: string): Observable<Product[]> {
    return new Observable(observer => {
      this.getProducts().subscribe({
        next: (products) => {
          const filtered = products.filter(p =>
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.description.toLowerCase().includes(query.toLowerCase())
          );
          observer.next(filtered);
          observer.complete();
        },
        error: (err) => observer.error(err)
      });
    });
  }
}
