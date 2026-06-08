import { ChangeDetectionStrategy, Component, PLATFORM_ID, afterNextRender, computed, effect, input, signal, viewChild, ElementRef, inject } from '@angular/core';
import { isPlatformBrowser, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Product } from '../../core/models/product.model';
import { FirebaseAdminService } from '../../core/services/firebase-admin.service';
import { SalesService } from '../../core/services/sales.service';

@Component({
  selector: 'app-product-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DecimalPipe],
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

  readonly costVisible = signal(false);

  readonly costPriceDisplay = computed(() => {
    const p = this.product().costPrice;
    if (!p) return null;
    return '₹\u202f' + p.toLocaleString('en-IN');
  });

  toggleCost(event: Event): void {
    event.stopPropagation();
    this.costVisible.update(v => !v);
  }

  // ── Image upload ──────────────────────────────────────────────────────────
  private readonly firebaseAdmin = inject(FirebaseAdminService);
  readonly imageUploading = signal(false);
  readonly imageUploadError = signal<string | null>(null);

  private readonly MAX_DIMENSION = 900;
  private readonly JPEG_QUALITY = 0.80;
  /** Locally overrides imageUrl after a successful save — no page reload needed. */
  readonly localImageUrl = signal<string | null>(null);

  readonly effectiveImageUrl = computed(() =>
    this.localImageUrl() ?? this.product().imageUrl ?? null
  );

  /** Becomes true once the card scrolls near the viewport — defers image decode. */
  readonly imageRevealed = signal(false);

  /** The src actually bound to <img> — null until the card is visible. */
  readonly visibleImageSrc = computed(() =>
    this.imageRevealed() ? this.effectiveImageUrl() : null
  );

  onImageFileSelected(event: Event): void {
    event.stopPropagation();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = ''; // allow re-selecting same file

    this.imageUploadError.set(null);

    if (!file.type.startsWith('image/')) {
      this.imageUploadError.set('Please select a valid image (JPEG, PNG, WebP).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.imageUploadError.set('Image must be smaller than 10 MB.');
      return;
    }

    this.imageUploading.set(true);
    this.compressImage(file).then(dataUrl => {
      const sku = this.product().sku;
      if (!sku) {
        // No SKU (sample/local product) — update locally only
        this.localImageUrl.set(dataUrl);
        this.imageRevealed.set(true);
        this.imageUploading.set(false);
        return;
      }
      this.firebaseAdmin.updateImageUrl(sku, dataUrl).subscribe({
        next: () => {
          this.localImageUrl.set(dataUrl);
          this.imageRevealed.set(true);
          this.imageUploading.set(false);
        },
        error: (err: Error) => {
          this.imageUploadError.set(err.message ?? 'Failed to save image.');
          this.imageUploading.set(false);
        },
      });
    }).catch((err: Error) => {
      this.imageUploadError.set(err.message ?? 'Image processing failed.');
      this.imageUploading.set(false);
    });
  }

  private compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Failed to decode image.'));
        img.onload = () => {
          let { width, height } = img;
          if (width > this.MAX_DIMENSION || height > this.MAX_DIMENSION) {
            if (width >= height) {
              height = Math.round((height * this.MAX_DIMENSION) / width);
              width = this.MAX_DIMENSION;
            } else {
              width = Math.round((width * this.MAX_DIMENSION) / height);
              height = this.MAX_DIMENSION;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas not available.')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', this.JPEG_QUALITY));
        };
        img.src = e.target!.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  readonly lightboxOpen = signal(false);
  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('lightboxDialog');
  private readonly platformId = inject(PLATFORM_ID);
  private readonly hostRef = inject(ElementRef);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      // Lazy-reveal image via IntersectionObserver so text renders first.
      afterNextRender(() => {
        if (!('IntersectionObserver' in window)) {
          this.imageRevealed.set(true);
          return;
        }
        const observer = new IntersectionObserver(
          (entries) => {
            if (entries[0].isIntersecting) {
              this.imageRevealed.set(true);
              observer.disconnect();
            }
          },
          { rootMargin: '300px 0px' }, // preload 300 px before entering viewport
        );
        observer.observe(this.hostRef.nativeElement);
      });

      effect(() => {
        const dialog = this.dialogRef()?.nativeElement;
        if (!dialog) return;
        if (this.lightboxOpen()) dialog.showModal();
        else if (dialog.open) dialog.close();
      });
    }
  }

  openLightbox(): void {
    if (this.effectiveImageUrl()) {
      this.lightboxOpen.set(true);
    }
  }

  closeLightbox(): void {
    this.lightboxOpen.set(false);
  }

  // ── Quick Sale ────────────────────────────────────────────────────────────
  private readonly salesService = inject(SalesService);

  /** Locally tracks stock after a sale so UI updates without a page reload. */
  readonly localStockQty = signal<number | null>(null);
  readonly effectiveStockQty = computed(() =>
    this.localStockQty() ?? this.product().stockQty ?? null
  );

  readonly saleOpen = signal(false);
  readonly saleQty = signal(1);
  readonly saleSellPrice = signal(0);
  readonly saleSaving = signal(false);
  readonly saleDone = signal(false);
  readonly saleError = signal('');

  openSalePanel(event: Event): void {
    event.stopPropagation();
    const stock = this.effectiveStockQty();
    if (stock != null && stock <= 0) return;
    const p = this.product();
    this.saleSellPrice.set(p.discountedPrice ?? p.price ?? 0);
    this.saleQty.set(1);
    this.saleDone.set(false);
    this.saleOpen.set(true);
  }

  closeSalePanel(event: Event): void {
    event.stopPropagation();
    this.saleOpen.set(false);
  }

  submitSale(event: Event): void {
    event.stopPropagation();
    const p = this.product();
    const stock = this.effectiveStockQty();
    if (stock != null && stock <= 0) {
      this.saleError.set('Stock is 0 — cannot record sale.');
      return;
    }
    const qty = this.saleQty();
    const sell = this.saleSellPrice();
    const cost = p.costPrice ?? 0;
    const today = new Date().toISOString().slice(0, 10);
    this.saleSaving.set(true);
    this.saleError.set('');
    this.salesService.addSale({
      date: today,
      productName: p.name,
      category: (p as any)['category'] ?? '',
      qty,
      costPrice: cost,
      sellPrice: sell,
      profit: (sell - cost) * qty,
    }).subscribe({
      next: () => {
        // Decrement stock locally so UI updates immediately
        const cur = this.effectiveStockQty();
        if (cur != null) this.localStockQty.set(Math.max(0, cur - qty));
        // Persist to Firestore
        if (p.id) {
          this.firebaseAdmin.decrementStock(p.id, qty).subscribe();
        }
        this.saleSaving.set(false);
        this.saleDone.set(true);
        setTimeout(() => { this.saleOpen.set(false); this.saleDone.set(false); }, 1500);
      },
      error: (err) => {
        this.saleSaving.set(false);
        this.saleError.set(err?.message ?? 'Failed to save. Check console.');
        console.error('Quick sale error:', err);
      },
    });
  }

  saleProfit = computed(() => (this.saleSellPrice() - (this.product().costPrice ?? 0)) * this.saleQty());
}
