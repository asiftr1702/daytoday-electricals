import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShopProfile } from '../../models/shop.model';
import { ShopService } from '../../services/shop.service';

@Component({
  selector: 'app-shop-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="shop-header">
      <div class="container">
        <div class="header-content">
          <img *ngIf="shopProfile()?.logo_url" 
               [src]="shopProfile()?.logo_url" 
               alt="Shop Logo" 
               class="logo">
          <div class="shop-info">
            <h1>{{ shopProfile()?.shop_name || 'Welcome to Our Shop' }}</h1>
            <p *ngIf="shopProfile()?.description" class="description">
              {{ shopProfile()?.description }}
            </p>
            <div class="contact-info">
              <span *ngIf="shopProfile()?.phone" class="phone">📞 {{ shopProfile()?.phone }}</span>
              <span *ngIf="shopProfile()?.email" class="email">✉️ {{ shopProfile()?.email }}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .shop-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 2rem 0;
      margin-bottom: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1rem;
    }

    .header-content {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .logo {
      width: 100px;
      height: 100px;
      border-radius: 8px;
      object-fit: cover;
      border: 3px solid white;
    }

    .shop-info h1 {
      margin: 0;
      font-size: 2rem;
      font-weight: 700;
    }

    .description {
      margin: 0.5rem 0;
      font-size: 1rem;
      opacity: 0.95;
    }

    .contact-info {
      display: flex;
      gap: 1.5rem;
      margin-top: 0.5rem;
      font-size: 0.95rem;
    }

    @media (max-width: 768px) {
      .header-content {
        flex-direction: column;
        text-align: center;
      }
      
      .shop-info h1 {
        font-size: 1.5rem;
      }

      .contact-info {
        flex-direction: column;
        gap: 0.5rem;
      }
    }
  `]
})
export class ShopHeaderComponent implements OnInit {
  shopProfile = () => this._shopProfile;
  private _shopProfile: ShopProfile | null = null;

  constructor(private shopService: ShopService) {}

  ngOnInit() {
    this.shopService.getShopProfile().subscribe({
      next: (profile) => {
        this._shopProfile = profile;
      },
      error: (err) => console.error('Error loading shop profile:', err)
    });
  }
}
