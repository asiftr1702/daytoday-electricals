import { ChangeDetectionStrategy, Component, PLATFORM_ID, afterNextRender, computed, effect, input, signal, viewChild, ElementRef, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Product } from '../../core/models/product.model';
import { FirebaseAdminService } from '../../core/services/firebase-admin.service';
import { SalesService } from '../../core/services/sales.service';
import { BillService } from '../../core/services/bill.service';
import { CatalogueConfigService } from '../../core/services/catalogue-config.service';
import { compressImage } from '../../core/utils/image.util';
import { colorNameToHex } from '../../core/config/product-fields.config';

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

  /**
   * Whole-box / coil cost for a wire, when applicable.
   *  • New records store a per-metre cost with costUnit='box' → multiply by the length.
   *  • Legacy records stored the whole-box figure directly in costPrice (no costUnit) —
   *    detected because a per-metre cost can never exceed the per-metre selling price.
   * Returns null for wires genuinely costed per metre and for non-wire categories.
   */
  readonly wireBoxCost = computed<number | null>(() => {
    if (!this.isWire()) return null;
    const prod = this.product() as any;
    const cost = prod.costPrice;
    if (cost == null) return null;
    const len = prod.bundleLength ?? prod.totalLength;
    if (prod.costUnit === 'box' && len) return Math.round(cost * len);
    if (!prod.costUnit && prod.price != null && cost > prod.price) return Math.round(cost);
    return null;
  });

  readonly costPriceDisplay = computed(() => {
    const box = this.wireBoxCost();
    if (box != null) return '₹\u202f' + box.toLocaleString('en-IN');
    const p = this.product().costPrice;
    if (!p) return null;
    return '₹\u202f' + p.toLocaleString('en-IN');
  });

  toggleCost(event: Event): void {
    event.stopPropagation();
    this.costVisible.update(v => !v);
  }

  /** Colour name briefly revealed when the user taps a colour swatch. */
  readonly revealedColor = signal<string | null>(null);
  private revealTimer: ReturnType<typeof setTimeout> | null = null;

  /** Show the colour name for a few seconds when its swatch is tapped. */
  revealColor(name: string, event: Event): void {
    event.stopPropagation();
    if (this.revealTimer) clearTimeout(this.revealTimer);
    this.revealedColor.set(name);
    this.revealTimer = setTimeout(() => this.revealedColor.set(null), 2000);
  }

  // ── Category detection ──────────────────────────────────────────────────────
  readonly isFan   = computed(() => (this.product() as any)['category'] === 'fans');
  readonly isLight = computed(() => (this.product() as any)['category'] === 'lights');
  readonly isWire  = computed(() => /wire|cable/i.test(String((this.product() as any)['category'] ?? '')));

  /** Whether the warranty tag should appear on the card (admin toggle, defaults to true). */
  readonly showWarranty = computed(() => (this.product() as any).showWarranty !== false);

  /** Whole roll/box price for a per-metre wire (shown as a tag on the card). */
  readonly wireBoxPrice = computed(() => {
    if (!this.isWire()) return null;
    const p = this.product() as any;
    if (!p.totalLength || !p.price) return null;
    const box = p.bundlePrice ?? Math.round((p.price * p.totalLength) / 1.1);
    return box ? box.toLocaleString('en-IN') : null;
  });

  private readonly FAN_COLOR_HEX: Record<string, string> = {
    'White':  '#f0f0f0',
    'Silver': '#C0C0C0',
    'Brown':  '#5a4a3a',
    'Black':  '#222222',
    'Gold':   '#b8860b',
    'Copper': '#e07b55',
  };

  /** Strip items shown between image and body: blade size, material abbrev, color swatch. */
  readonly fanVisualStrip = computed((): Array<{ type: 'text' | 'color'; value: string; short?: string; hex?: string }> => {
    if (!this.isFan()) return [];
    const p = this.product() as any;
    const items: Array<{ type: 'text' | 'color'; value: string; short?: string; hex?: string }> = [];
    if (p.bladeSize) items.push({ type: 'text', value: p.bladeSize, short: this.shortenStrip(p.bladeSize) });
    if (p.bladeMaterial) {
      // Show abbreviation from parens, e.g. "Copper (Cu)" → "Cu"; fallback to full name
      const m = (p.bladeMaterial as string).match(/\(([^)]+)\)/);
      items.push({ type: 'text', value: m ? m[1] : p.bladeMaterial, short: this.abbreviateMaterial(p.bladeMaterial) });
    }
    if (p.color) {
      items.push({ type: 'color', value: p.color, hex: this.FAN_COLOR_HEX[p.color] ?? '#cccccc' });
    }
    return items;
  });

  /** Remaining fan spec chips shown in the card body: wattage, RPM, speed. */
  readonly fanSpecs = computed((): { value: string; short?: string }[] => {
    if (!this.isFan()) return [];
    const p = this.product() as any;
    return [
      p.wattage       ? { value: `${p.wattage}W`,   short: `${p.wattage}w` } : null,
      p.rpm           ? { value: `${p.rpm} RPM`,    short: `${p.rpm}rpm` }   : null,
      p.speedSettings ? { value: p.speedSettings }                           : null,
    ].filter(Boolean) as { value: string; short?: string }[];
  });

  /** Compact mobile label for warranty, e.g. "2 years" / "2y" → "2". */
  readonly warrantyShort = computed((): string => {
    const w = this.product().warranty;
    if (w && w !== 'No warranty') {
      const m = w.match(/\d+(?:\.\d+)?/);
      return m ? m[0] : w;
    }
    const y = (this.product() as any).warrantyYears;
    return y > 0 ? String(y) : '';
  });

  /** Short blade material abbreviation, e.g. "Copper (Cu)" → "Cu", "Aluminium (Alu)" → "Al". */
  private abbreviateMaterial(material: string): string {
    // Prefer the abbreviation in parentheses if present, e.g. "Copper (Cu)" → "Cu".
    const paren = material.match(/\(([^)]+)\)/);
    if (paren) {
      const abbr = paren[1].trim();
      // Normalise common variants: "Alu" → "Al".
      if (/^alu/i.test(abbr)) return 'Al';
      return abbr;
    }
    const name = material.trim();
    const lower = name.toLowerCase();
    if (lower.startsWith('copper')) return 'Cu';
    if (lower.startsWith('alu')) return 'Al';
    return name.charAt(0).toUpperCase();
  }

  /** Strip units from common attribute values for a compact mobile label. */
  private shortenStrip(value: string): string {
    const v = value.trim();
    let m = v.match(/^(\d+(?:\.\d+)?)\s*(?:w|watts?)\b/i);
    if (m) return `${m[1]}w`;
    m = v.match(/^(\d+(?:\.\d+)?)\s*rpm\b/i);
    if (m) return `${m[1]}rpm`;
    // Air delivery: "230 cubic mtr/meter/m³" → "230cm"
    m = v.match(/^(\d+(?:\.\d+)?)\s*(?:cubic\s*(?:mtr|meter|metre|m)|m³|cu\s*m|cmm|cfm)\b/i);
    if (m) return `${m[1]}cm`;
    m = v.match(/^(\d+(?:\.\d+)?)\s*(?:inch(?:es)?|in|"|mm|cm|ft|feet)\b/i);
    if (m) return m[1];
    m = v.match(/^(\d+(?:\.\d+)?)\s*m(?:\s*roll)?$/i);
    if (m) return `${m[1]}m`;
    m = v.match(/^(\d+(?:\.\d+)?)\s*(?:years?|yrs?|y)$/i);
    if (m) return m[1];
    return v;
  }

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
  readonly lightVisualStrip = computed((): Array<{ type: 'text' | 'color'; value: string; short?: string; hex?: string }> => {
    if (!this.isLight()) return [];
    const p = this.product() as any;
    const items: Array<{ type: 'text' | 'color'; value: string; short?: string; hex?: string }> = [];
    if (p.colorTemp) {
      items.push({ type: 'color', value: p.colorTemp, hex: this.LIGHT_COLOR_TEMP_HEX[p.colorTemp] ?? '#fffde7' });
    }
    if (p.size) {
      items.push({ type: 'text', value: p.size, short: this.shortenStrip(p.size) });
    }
    if (p.totalLength) {
      items.push({ type: 'text', value: `${p.totalLength}m roll`, short: `${p.totalLength}m` });
    }
    if (p.wattage) {
      items.push({ type: 'text', value: `${p.wattage}W`, short: `${p.wattage}w` });
    }
    return items;
  });

  /** Strip items for wires/cables: core size · number of cores · roll length. */
  readonly wireVisualStrip = computed((): Array<{ type: 'text' | 'color'; value: string; short?: string; hex?: string }> => {
    if (!this.isWire()) return [];
    const p = this.product() as any;
    const items: Array<{ type: 'text' | 'color'; value: string; short?: string; hex?: string }> = [];
    if (p.color) items.push({ type: 'color', value: p.color, hex: this.WIRE_COLOR_HEX[p.color] ?? '#cccccc' });
    if (p.size)  items.push({ type: 'text', value: p.size, short: this.shortenStrip(p.size) });
    if (p.coreSize) items.push({ type: 'text', value: p.coreSize, short: this.shortenStrip(p.coreSize) });
    if (p.cores)    items.push({ type: 'text', value: p.cores, short: this.shortenStrip(p.cores) });
    if (p.totalLength) items.push({ type: 'text', value: `${p.totalLength}m roll`, short: `${p.totalLength}m` });
    return items;
  });

  private readonly WIRE_COLOR_HEX: Record<string, string> = {
    'Red':    '#ef4444',
    'Black':  '#222222',
    'Green':  '#22c55e',
    'Yellow': '#eab308',
    'Blue':   '#3b82f6',
    'White':  '#f0f0f0',
    'Grey':   '#9ca3af',
    'Brown':  '#92400e',
  };

  /** Full box price for rope light (totalLength × price × 90%). */
  readonly ropeBoxPrice = computed(() => {
    if (!this.isLight()) return null;
    const p = this.product() as any;
    if (!p.totalLength || !p.price) return null;
    return Math.round(p.totalLength * p.price * 0.9);
  });

  /** Light spec chips shown in the card body (empty — specs shown in strip). */
  readonly lightSpecs = computed((): { value: string }[] => []);

  // ── Per-product custom card layout ───────────────────────────────────────
  /** True when the product defines its own field placement (overrides hardcoded strips). */
  readonly hasCustomLayout = computed(() => (this.product().cardLayout?.length ?? 0) > 0);

  private resolveLayoutItem(item: { key: string; isColor?: boolean; prefix?: string; suffix?: string }):
    { type: 'text' | 'color'; value: string; short?: string; hex?: string } | null {
    const raw = (this.product() as any)[item.key];
    if (raw == null || raw === '') return null;
    if (item.isColor) {
      return { type: 'color', value: String(raw), hex: colorNameToHex(String(raw)) };
    }
    const text = `${item.prefix ?? ''}${raw}${item.suffix ? ' ' + item.suffix : ''}`;
    // Material fields abbreviate to a letter (Copper → C, Aluminium → Al); others strip units.
    const short = /material/i.test(item.key)
      ? this.abbreviateMaterial(String(raw))
      : this.shortenStrip(text);
    return { type: 'text', value: text, short };
  }

  /** Strip items from the custom layout (colour band below the image). */
  readonly customStripItems = computed(() =>
    (this.product().cardLayout ?? [])
      .filter(f => f.section === 'strip')
      .map(f => this.resolveLayoutItem(f))
      .filter((x): x is { type: 'text' | 'color'; value: string; short?: string; hex?: string } => x != null)
  );

  /** Detail chips from the custom layout (in the card body). */
  readonly customDetailItems = computed(() =>
    (this.product().cardLayout ?? [])
      .filter(f => f.section === 'details')
      .map(f => this.resolveLayoutItem(f))
      .filter((x): x is { type: 'text' | 'color'; value: string; short?: string; hex?: string } => x != null)
  );

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
  private readonly catalogueConfig = inject(CatalogueConfigService);
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
    const billFields = this.buildBillFields();
    this.billService.addItem({
      productId: p.id,
      productName: p.name,
      ...(p.brand ? { brand: p.brand } : {}),
      ...(p.subcategory ? { subcategory: p.subcategory } : {}),
      category: (p as any)['category'] ?? '',
      unit: p.unit,
      qty: this.billQty(),
      costPrice: p.costPrice ?? 0,
      sellPrice: this.billSellPrice(),
      ...(billFields.length ? { billFields } : {}),
    });
    this.billAdded.set(true);
    setTimeout(() => { this.billOpen.set(false); this.billAdded.set(false); }, 1200);
  }

  /** Custom field values for this product's category that are flagged "include in bill". */
  private buildBillFields(): { label: string; value: string }[] {
    const p = this.product() as any;
    const catId = p['category'] ?? '';
    const cat = this.catalogueConfig.categories().find(c => c.id === catId);
    const fields = cat?.fieldConfig?.fields ?? [];
    const result: { label: string; value: string }[] = [];
    for (const f of fields) {
      if (!f.includeInBill) continue;
      const raw = p[f.key];
      if (raw == null || raw === '') continue;
      const value = `${f.prefix ?? ''}${raw}${f.suffix ? ' ' + f.suffix : ''}`;
      result.push({ label: f.label, value });
    }
    return result;
  }

  goToBill(event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/bill']);
  }

  billItemProfit = computed(() =>
    (this.billSellPrice() - (this.product().costPrice ?? 0)) * this.billQty()
  );
}
