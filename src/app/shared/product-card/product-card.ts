import { ChangeDetectionStrategy, Component, PLATFORM_ID, afterNextRender, computed, effect, input, signal, viewChild, ElementRef, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Product } from '../../core/models/product.model';
import { FirebaseAdminService } from '../../core/services/firebase-admin.service';
import { SalesService } from '../../core/services/sales.service';
import { BillService } from '../../core/services/bill.service';
import { compressImage } from '../../core/utils/image.util';

@Component({
  selector: 'app-product-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
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

  // ── Category detection ──────────────────────────────────────────────────────
  readonly isFan   = computed(() => (this.product() as any)['category'] === 'fans');
  readonly isLight = computed(() => (this.product() as any)['category'] === 'lights');

  private readonly FAN_COLOR_HEX: Record<string, string> = {
    'White':  '#f0f0f0',
    'Silver': '#C0C0C0',
    'Brown':  '#5a4a3a',
    'Black':  '#222222',
    'Gold':   '#b8860b',
    'Copper': '#e07b55',
  };

  /** Strip items shown between image and body: blade size, material abbrev, color swatch. */
  readonly fanVisualStrip = computed((): Array<{ type: 'text' | 'color'; value: string; hex?: string }> => {
    if (!this.isFan()) return [];
    const p = this.product() as any;
    const items: Array<{ type: 'text' | 'color'; value: string; hex?: string }> = [];
    if (p.bladeSize) items.push({ type: 'text', value: p.bladeSize });
    if (p.bladeMaterial) {
      // Show abbreviation from parens, e.g. "Copper (Cu)" → "Cu"; fallback to full name
      const m = (p.bladeMaterial as string).match(/\(([^)]+)\)/);
      items.push({ type: 'text', value: m ? m[1] : p.bladeMaterial });
    }
    if (p.color) {
      items.push({ type: 'color', value: p.color, hex: this.FAN_COLOR_HEX[p.color] ?? '#cccccc' });
    }
    return items;
  });

  /** Remaining fan spec chips shown in the card body: wattage, RPM, speed. */
  readonly fanSpecs = computed((): { value: string }[] => {
    if (!this.isFan()) return [];
    const p = this.product() as any;
    return [
      p.wattage       ? { value: `${p.wattage}W` }    : null,
      p.rpm           ? { value: `${p.rpm} RPM` }     : null,
      p.speedSettings ? { value: p.speedSettings }    : null,
    ].filter(Boolean) as { value: string }[];
  });

  // ── Light-specific specs ──────────────────────────────────────────────────
  private readonly LIGHT_COLOR_TEMP_HEX: Record<string, string> = {
    'Warm White':    '#ffcc66',
    'Natural White': '#ffe9a0',
    'Cool White':    '#dbeafe',
    'Daylight':      '#e0f2fe',
    'Blue':          '#3b82f6',
    'Pink':          '#f472b6',
    'Red':           '#ef4444',
    'Green':         '#22c55e',
  };

  /** Strip items shown between image and body: color temperature dot + size + wattage chip. */
  readonly lightVisualStrip = computed((): Array<{ type: 'text' | 'color'; value: string; hex?: string }> => {
    if (!this.isLight()) return [];
    const p = this.product() as any;
    const items: Array<{ type: 'text' | 'color'; value: string; hex?: string }> = [];
    if (p.colorTemp) {
      items.push({ type: 'color', value: p.colorTemp, hex: this.LIGHT_COLOR_TEMP_HEX[p.colorTemp] ?? '#fffde7' });
    }
    if (p.size) {
      items.push({ type: 'text', value: p.size });
    }
    if (p.totalLength) {
      items.push({ type: 'text', value: `${p.totalLength}m roll` });
    }
    if (p.wattage) {
      items.push({ type: 'text', value: `${p.wattage}W` });
    }
    return items;
  });

  /** Full box price for rope light (totalLength × price × 90%). */
  readonly ropeBoxPrice = computed(() => {
    if (!this.isLight()) return null;
    const p = this.product() as any;
    if (!p.totalLength || !p.price) return null;
    return Math.round(p.totalLength * p.price * 0.9);
  });

  /** Light spec chips shown in the card body (empty — specs shown in strip). */
  readonly lightSpecs = computed((): { value: string }[] => []);
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
      this.firebaseAdmin.updateImageUrl(sku, dataUrl, (this.product() as any)['category'] ?? '').subscribe({
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
    return compressImage(file, { maxDimension: this.MAX_DIMENSION, quality: this.JPEG_QUALITY });
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
          this.firebaseAdmin.decrementStock(p.id, qty, (p as any)['category'] ?? '').subscribe();
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

  // ── Add to Bill ───────────────────────────────────────────────────────────
  private readonly billService = inject(BillService);
  private readonly router = inject(Router);

  readonly billOpen = signal(false);
  readonly billQty = signal(1);
  readonly billSellPrice = signal(0);
  readonly billAdded = signal(false);

  private isSameProduct(i: { productName: string; brand?: string }): boolean {
    const p = this.product();
    return i.productName === p.name && (i.brand ?? '') === (p.brand ?? '');
  }

  /** Stock already reserved in the current bill for this product */
  readonly qtyAlreadyInBill = computed(() =>
    this.billService.currentItems()
      .filter(i => this.isSameProduct(i))
      .reduce((s, i) => s + i.qty, 0)
  );

  /** Remaining stock available to add (null = no stock tracking) */
  readonly availableForBill = computed(() => {
    const stock = this.effectiveStockQty();
    if (stock == null) return null;
    return Math.max(0, stock - this.qtyAlreadyInBill());
  });

  /** Validation error for the bill qty input */
  readonly billQtyError = computed(() => {
    const avail = this.availableForBill();
    if (avail === null) return '';
    if (avail <= 0) return 'Out of stock';
    if (this.billQty() > avail) return `Only ${avail} available`;
    if (this.billQty() < 1) return 'Qty must be at least 1';
    return '';
  });

  readonly inBill = computed(() =>
    this.billService.currentItems().some(i => this.isSameProduct(i))
  );

  readonly billItemCount = computed(() => {
    const item = this.billService.currentItems().find(i => this.isSameProduct(i));
    return item?.qty ?? 0;
  });

  openBillPanel(event: Event): void {
    event.stopPropagation();
    const p = this.product();
    if (!p.available) return; // blocked — out of stock
    const stock = this.effectiveStockQty();
    if (stock != null && stock <= 0) return; // blocked — out of stock
    const isOffer = p.discountedPrice && p.price && p.discountedPrice < p.price;
    this.billSellPrice.set(isOffer ? p.discountedPrice! : (p.price ?? 0));
    const avail = this.availableForBill();
    this.billQty.set(avail != null ? Math.min(1, avail) : 1);
    this.billAdded.set(false);
    this.billOpen.set(true);
  }

  closeBillPanel(event: Event): void {
    event.stopPropagation();
    this.billOpen.set(false);
  }

  addToBill(event: Event): void {
    event.stopPropagation();
    if (this.billQtyError()) return;
    const p = this.product();
    this.billService.addItem({
      productId: p.id,
      productName: p.name,
      ...(p.brand ? { brand: p.brand } : {}),
      category: (p as any)['category'] ?? '',
      unit: p.unit,
      qty: this.billQty(),
      costPrice: p.costPrice ?? 0,
      sellPrice: this.billSellPrice(),
    });
    this.billAdded.set(true);
    setTimeout(() => { this.billOpen.set(false); this.billAdded.set(false); }, 1200);
  }

  goToBill(event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/bill']);
  }

  billItemProfit = computed(() =>
    (this.billSellPrice() - (this.product().costPrice ?? 0)) * this.billQty()
  );
}
