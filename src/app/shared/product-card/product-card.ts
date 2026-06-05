import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, effect, input, signal, viewChild, ElementRef, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Product } from '../../core/models/product.model';

@Component({
  selector: 'app-product-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './product-card.html',
  styleUrl: './product-card.css',
})
export class ProductCardComponent {
  readonly product = input.required<Product>();

  readonly isOffer = computed(() => {
    const p = this.product();
    return !!(p.discountedPrice && p.price && p.discountedPrice < p.price);
  });

  readonly discountPercent = computed(() => {
    const p = this.product();
    if (!p.discountedPrice || !p.price) return 0;
    return Math.round(((p.price - p.discountedPrice) / p.price) * 100);
  });

  readonly priceDisplay = computed(() => {
    const p = this.product().price;
    if (!p) return null;
    return '₹\u202f' + p.toLocaleString('en-IN');
  });

  readonly discountedPriceDisplay = computed(() => {
    const p = this.product().discountedPrice;
    if (!p) return null;
    return '₹\u202f' + p.toLocaleString('en-IN');
  });

  readonly lightboxOpen = signal(false);
  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('lightboxDialog');
  private readonly platformId = inject(PLATFORM_ID);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      effect(() => {
        const dialog = this.dialogRef()?.nativeElement;
        if (!dialog) return;
        if (this.lightboxOpen()) {
          dialog.showModal();
        } else if (dialog.open) {
          dialog.close();
        }
      });
    }
  }

  openLightbox(): void {
    if (this.product().imageUrl) {
      this.lightboxOpen.set(true);
    }
  }

  closeLightbox(): void {
    this.lightboxOpen.set(false);
  }
}
