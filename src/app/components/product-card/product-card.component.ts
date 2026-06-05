import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Product } from '../../models/product.model';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="product-card">
      <div class="product-image">
        <img *ngIf="product.image_url" 
             [src]="product.image_url" 
             [alt]="product.name"
             class="image">
        <div *ngIf="!product.image_url" class="placeholder">
          No Image
        </div>
      </div>
      
      <div class="product-info">
        <h4 class="product-name">{{ product.name }}</h4>
        
        <p class="category-badge">{{ product.category }}</p>
        
        <p class="description">{{ product.description }}</p>
        
        <div class="product-footer">
          <span class="price">₹{{ product.price | number: '1.0-2' }}</span>
          <button class="add-btn">Add to Cart</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .product-card {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .product-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    }

    .product-image {
      width: 100%;
      height: 200px;
      overflow: hidden;
      background: #f5f5f5;
    }

    .image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #999;
      font-size: 0.9rem;
    }

    .product-info {
      padding: 1rem;
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .product-name {
      margin: 0 0 0.5rem 0;
      font-size: 1rem;
      font-weight: 600;
      color: #333;
    }

    .category-badge {
      margin: 0 0 0.5rem 0;
      display: inline-block;
      padding: 0.25rem 0.5rem;
      background: #e8f0fe;
      color: #667eea;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
      width: fit-content;
    }

    .description {
      margin: 0 0 auto 0;
      font-size: 0.85rem;
      color: #666;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .product-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #eee;
    }

    .price {
      font-size: 1.25rem;
      font-weight: 700;
      color: #667eea;
    }

    .add-btn {
      padding: 0.5rem 1rem;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.3s ease;
    }

    .add-btn:hover {
      background: #764ba2;
    }
  `]
})
export class ProductCardComponent {
  @Input() product!: Product;
}
