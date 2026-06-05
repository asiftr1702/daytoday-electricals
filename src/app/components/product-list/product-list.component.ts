import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Product } from '../../models/product.model';
import { ProductService } from '../../services/product.service';
import { ProductCardComponent } from '../product-card/product-card.component';
import { CategoryFilterComponent } from '../category-filter/category-filter.component';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ProductCardComponent, CategoryFilterComponent],
  template: `
    <div class="container">
      <app-category-filter #categoryFilter></app-category-filter>

      <div class="search-bar">
        <input 
          type="text" 
          placeholder="Search products..." 
          [(ngModel)]="searchQuery"
          (input)="onSearch()"
          class="search-input">
      </div>

      <div *ngIf="isLoading()" class="loading">
        <p>Loading products...</p>
      </div>

      <div *ngIf="error()" class="error">
        <p>{{ error() }}</p>
      </div>

      <div *ngIf="!isLoading() && filteredProducts().length === 0 && !error()" class="no-results">
        <p>No products found</p>
      </div>

      <div class="products-grid" *ngIf="!isLoading() && filteredProducts().length > 0">
        <app-product-card 
          *ngFor="let product of filteredProducts()" 
          [product]="product">
        </app-product-card>
      </div>
    </div>
  `,
  styles: [`
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1rem;
    }

    .search-bar {
      margin-bottom: 2rem;
      display: flex;
      gap: 1rem;
    }

    .search-input {
      flex: 1;
      padding: 0.75rem 1rem;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 1rem;
      transition: border-color 0.3s ease;
    }

    .search-input:focus {
      outline: none;
      border-color: #667eea;
    }

    .products-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .loading,
    .error,
    .no-results {
      text-align: center;
      padding: 2rem;
      font-size: 1.1rem;
      color: #666;
    }

    .error {
      color: #d32f2f;
      background: #ffebee;
      border-radius: 8px;
    }

    @media (max-width: 768px) {
      .products-grid {
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 1rem;
      }
    }
  `]
})
export class ProductListComponent implements OnInit {
  products = signal<Product[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);
  searchQuery = '';

  filteredProducts = computed(() => {
    let filtered = this.products();

    // Filter by search query
    if (this.searchQuery) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    }

    return filtered;
  });

  constructor(private productService: ProductService) {}

  ngOnInit() {
    this.loadProducts();
  }

  loadProducts() {
    this.isLoading.set(true);
    this.error.set(null);

    this.productService.getProducts().subscribe({
      next: (data) => {
        this.products.set(data);
        this.isLoading.set(false);
        console.log('Products loaded:', data);
      },
      error: (err) => {
        this.error.set('Failed to load products. Please try again later.');
        this.isLoading.set(false);
        console.error('Error loading products:', err);
      }
    });
  }

  onSearch() {
    // Filtered products will update automatically via computed signal
  }
}
