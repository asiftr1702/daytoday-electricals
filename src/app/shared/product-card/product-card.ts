import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, effect, input, signal, viewChild, ElementRef, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Product } from '../../core/models/product.model';
import { FirebaseAdminService } from '../../core/services/firebase-admin.service';

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

  // ── Image link dialog ────────────────────────────────────────────────────
  private readonly firebaseAdmin = inject(FirebaseAdminService);
  readonly linkDialogOpen = signal(false);
  readonly linkInput = signal('');
  readonly linkSaving = signal(false);
  readonly linkError = signal('');
  /** Locally overrides imageUrl after a successful save — no page reload needed. */
  readonly localImageUrl = signal<string | null>(null);

  readonly effectiveImageUrl = computed(() =>
    this.localImageUrl() ?? this.product().imageUrl ?? null
  );

  openLinkDialog(event: Event): void {
    event.stopPropagation();
    this.linkInput.set('');
    this.linkError.set('');
    this.linkDialogOpen.set(true);
  }

  closeLinkDialog(): void {
    this.linkDialogOpen.set(false);
  }

  /** Accepts any image URL; also converts Google Drive share links to direct embed URLs. */
  private toDriveEmbed(raw: string): string | null {
    if (!raw) return null;
    // Google Drive share link → direct embed
    const fileMatch = raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    const openMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const rawId = /^[a-zA-Z0-9_-]{25,}$/.test(raw) ? raw : null;
    const id = fileMatch?.[1] ?? openMatch?.[1] ?? rawId;
    if (id && !raw.startsWith('http')) {
      return `https://drive.google.com/uc?export=view&id=${id}`;
    }
    // Any other URL — use as-is
    try {
      new URL(raw);
      return raw;
    } catch {
      return null;
    }
  }

  saveDriveLink(): void {
    const url = this.toDriveEmbed(this.linkInput().trim());
    if (!url) {
      this.linkError.set('Invalid URL. Paste any image URL or a Google Drive share link.');
      return;
    }
    const sku = this.product().sku;
    if (!sku) {
      // No SKU — just update locally (sample data)
      this.localImageUrl.set(url);
      this.linkDialogOpen.set(false);
      return;
    }
    this.linkSaving.set(true);
    this.linkError.set('');
    this.firebaseAdmin.updateImageUrl(sku, url).subscribe({
      next: () => {
        this.localImageUrl.set(url);
        this.linkSaving.set(false);
        this.linkDialogOpen.set(false);
      },
      error: (err: Error) => {
        this.linkError.set(err.message ?? 'Failed to save. Try again.');
        this.linkSaving.set(false);
      },
    });
  }

  readonly lightboxOpen = signal(false);
  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('lightboxDialog');
  private readonly linkDialogRef = viewChild<ElementRef<HTMLDialogElement>>('linkDialog');
  private readonly platformId = inject(PLATFORM_ID);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      effect(() => {
        const dialog = this.dialogRef()?.nativeElement;
        if (!dialog) return;
        if (this.lightboxOpen()) dialog.showModal();
        else if (dialog.open) dialog.close();
      });
      effect(() => {
        const dialog = this.linkDialogRef()?.nativeElement;
        if (!dialog) return;
        if (this.linkDialogOpen()) dialog.showModal();
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
}
