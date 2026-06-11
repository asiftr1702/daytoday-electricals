import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FirebaseAdminService } from '../../../core/services/firebase-admin.service';
import { CatalogueConfigService } from '../../../core/services/catalogue-config.service';
import { LightProduct } from '../../../core/models/light-product.model';

const LIGHT_BRANDS = ['Philips', 'Syska', 'Havells', 'Wipro', 'Bajaj', 'Crompton'];
const LIGHT_SUBCATEGORIES = [
  'LED Bulb', 'Tube Light', 'Panel Light', 'Down Light',
  'Batten Light', 'Flood Light', 'Street Light', 'Emergency Light', 'Strip Light',
];
const LIGHT_COLOR_TEMPS = [
  { label: 'Warm White',    kelvin: '2700K', hex: '#ffcc66' },
  { label: 'Natural White', kelvin: '4000K', hex: '#ffe9a0' },
  { label: 'Cool White',    kelvin: '5000K', hex: '#f0f4ff' },
  { label: 'Daylight',      kelvin: '6500K', hex: '#ddeeff' },
  { label: 'Blue',          kelvin: '',      hex: '#3b82f6' },
  { label: 'Pink',          kelvin: '',      hex: '#f472b6' },
  { label: 'Red',           kelvin: '',      hex: '#ef4444' },
  { label: 'Green',         kelvin: '',      hex: '#22c55e' },
];
const WARRANTY_OPTIONS = ['No warranty', '6 months', '1 year', '2 years', '3 years'];
const STRIP_SIZES = ['1m', '2m', '3m', '5m', '10m', '15m', '20m'];

const SUBCAT_CODE: Record<string, string> = {
  'LED Bulb':       'LB', 'Tube Light':    'TL',
  'Panel Light':    'PL', 'Down Light':    'DL',
  'Batten Light':   'BT', 'Flood Light':   'FL',
  'Street Light':   'SL', 'Emergency Light': 'EL',
  'Strip Light':    'SR',
};

@Component({
  selector: 'app-light-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './light-admin.html',
  styleUrls: ['./light-admin.css'],
})
export class LightAdminComponent implements OnInit {
  private readonly fb              = inject(FormBuilder);
  private readonly firebaseAdmin   = inject(FirebaseAdminService);
  private readonly router          = inject(Router);
  private readonly catalogueConfig = inject(CatalogueConfigService);

  readonly lightBrands = computed(() => {
    const cat = this.catalogueConfig.categories().find(c => c.id === 'lights');
    return cat?.brands?.length ? cat.brands : LIGHT_BRANDS;
  });

  readonly lightSubcategories = computed(() => {
    const cat = this.catalogueConfig.categories().find(c => c.id === 'lights');
    return cat?.subcategories?.length ? cat.subcategories : LIGHT_SUBCATEGORIES;
  });

  readonly COLOR_TEMPS      = LIGHT_COLOR_TEMPS;
  readonly STRIP_SIZES      = STRIP_SIZES;
  readonly WARRANTY_OPTIONS = WARRANTY_OPTIONS;

  // Dynamic subcategory tracking
  readonly currentSubcat   = signal<string>('LED Bulb');
  readonly showSize        = computed(() => ['Strip Light', 'Neon Light'].includes(this.currentSubcat()));
  readonly showRopeFields  = computed(() => this.currentSubcat() === 'Rope Light');
  readonly fullBoxPrice    = signal<number | null>(null);
  readonly ropePerMeterPrice = signal<number | null>(null);

  lightForm!: FormGroup;

  // Pill-group selections
  readonly selectedColorTemp = signal<string>('');
  readonly selectedSize      = signal<string>('');

  // SKU generation
  private skuCounters: Record<string, number> = {};
  readonly generatedSku = signal<string>('');

  // Margin display
  readonly marginHint = signal<string>('');
  private _updatingMargin = false;

  // Product list
  readonly products        = signal<LightProduct[]>([]);
  readonly productsLoading = signal(false);
  readonly deletingId      = signal<string | null>(null);
  readonly confirmDeleteId = signal<string | null>(null);
  readonly editingProduct  = signal<LightProduct | null>(null);

  // Form status
  readonly isLoading      = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage   = signal('');

  // Image
  readonly imagePreview = signal<string | null>(null);
  readonly imageError   = signal<string | null>(null);
  private imageFile: File | null = null;
  private readonly MAX_DIMENSION = 900;
  private readonly JPEG_QUALITY  = 0.80;

  ngOnInit(): void {
    this.catalogueConfig.loadConfig();
    this.initForm();
    this.loadProducts();
    this.setupSKUGeneration();
    this.setupMarginCalculation();
    this.setupStockBehavior();
    this.setupRopeFields();
  }

  private initForm(): void {
    this.lightForm = this.fb.group({
      brand:           ['', Validators.required],
      subcategory:     ['LED Bulb', Validators.required],
      name:            ['', Validators.required],
      sku:             ['', Validators.required],
      costPrice:       [null, [Validators.required, Validators.min(0)]],
      price:           [null, [Validators.required, Validators.min(0)]],
      marginInput:     [null],
      discountedPrice: [null, Validators.min(0)],
      stockQty:        [null, [Validators.required, Validators.min(0)]],
      available:       [false],
      wattage:         [null],
      totalLength:     [null],
      costUnit:        ['piece'],
      warranty:        ['No warranty'],
      purchaseDate:    [''],
      location:        [''],
      remarks:         [''],
    });
  }

  private setupSKUGeneration(): void {
    ['brand', 'subcategory', 'name'].forEach(f =>
      this.lightForm.get(f)?.valueChanges.subscribe(() => this.generateSKU())
    );
    this.lightForm.get('subcategory')?.valueChanges.subscribe((val: string) => {
      this.currentSubcat.set(val ?? 'LED Bulb');
      if (!['Strip Light', 'Neon Light'].includes(val)) this.selectedSize.set('');
      if (val !== 'Rope Light') {
        this.lightForm.get('totalLength')?.setValue(null, { emitEvent: false });
        this.fullBoxPrice.set(null);
        this.ropePerMeterPrice.set(null);
      }
    });
  }

  private setupMarginCalculation(): void {
    // price changes → update margin input
    this.lightForm.get('price')?.valueChanges.subscribe((price: number | null) => {
      if (this._updatingMargin) return;
      const cost = this.lightForm.get('costPrice')?.value;
      this.calcMargin(cost, price);
    });
    // cost changes → update margin input
    this.lightForm.get('costPrice')?.valueChanges.subscribe((cost: number | null) => {
      if (this._updatingMargin) return;
      const price = this.lightForm.get('price')?.value;
      this.calcMargin(cost, price);
    });
    // margin input changes → back-calculate price
    this.lightForm.get('marginInput')?.valueChanges.subscribe((pct: number | null) => {
      if (this._updatingMargin) return;
      const cost = this.lightForm.get('costPrice')?.value;
      if (cost > 0 && pct != null) {
        this._updatingMargin = true;
        const newPrice = Math.round(cost * (1 + pct / 100));
        this.lightForm.get('price')?.setValue(newPrice, { emitEvent: false });
        this.marginHint.set(`Profit ₹${Math.round(newPrice - cost)} per unit`);
        this._updatingMargin = false;
      }
    });
  }

  private setupStockBehavior(): void {
    this.lightForm.get('stockQty')?.valueChanges.subscribe((qty: number | null) => {
      const hasStock = qty != null && qty > 0;
      this.lightForm.get('available')?.setValue(hasStock, { emitEvent: false });
    });
    ['costPrice', 'price', 'discountedPrice', 'stockQty', 'wattage', 'totalLength'].forEach(field => {
      this.lightForm.get(field)?.valueChanges.subscribe((val: number | null) => {
        if (val != null && val < 0) {
          this.lightForm.get(field)?.setValue(0, { emitEvent: false });
        }
      });
    });
  }

  private setupRopeFields(): void {
    const recalc = () => {
      const boxPrice = this.lightForm.get('price')?.value;
      const len      = this.lightForm.get('totalLength')?.value;
      if (boxPrice > 0 && len > 0) {
        const perMeter = Math.round((boxPrice / len) * 1.1);
        this.ropePerMeterPrice.set(perMeter);
        this.fullBoxPrice.set(Math.round(boxPrice * 0.9));
      } else {
        this.ropePerMeterPrice.set(null);
        this.fullBoxPrice.set(null);
      }
    };
    this.lightForm.get('totalLength')?.valueChanges.subscribe(recalc);
    this.lightForm.get('price')?.valueChanges.subscribe(recalc);
  }

  private generateSKU(): void {
    const brand  = this.lightForm.get('brand')?.value ?? '';
    const subcat = this.lightForm.get('subcategory')?.value ?? '';
    const name   = (this.lightForm.get('name')?.value ?? '').trim();

    if (!brand || !subcat || !name) {
      this.generatedSku.set('');
      this.lightForm.get('sku')?.setValue('', { emitEvent: false });
      return;
    }

    const b   = brand.slice(0, 3).toUpperCase();
    const s   = SUBCAT_CODE[subcat] ?? subcat.slice(0, 2).toUpperCase();
    const n   = name.slice(0, 4).toUpperCase().replace(/\s/g, '');
    const key = `${b}${s}${n}`;

    if (!this.skuCounters[key]) {
      const prefix   = `${b}-${s}-${n}-`;
      const existing = this.products().filter(p => p.sku?.startsWith(prefix));
      if (existing.length > 0) {
        const maxNum = Math.max(
          ...existing.map(p => parseInt(p.sku!.split('-').pop() ?? '0', 10))
        );
        this.skuCounters[key] = maxNum + 1;
      } else {
        this.skuCounters[key] = 1;
      }
    }

    const sku = `${b}-${s}-${n}-${String(this.skuCounters[key]).padStart(3, '0')}`;
    this.generatedSku.set(sku);
    this.lightForm.get('sku')?.setValue(sku, { emitEvent: false });
  }

  private calcMargin(cost?: number | null, sell?: number | null): void {
    cost = cost ?? this.lightForm.get('costPrice')?.value;
    sell = sell ?? this.lightForm.get('price')?.value;
    if (!cost || !sell) { this.marginHint.set(''); return; }
    const pct = (((sell - cost) / cost) * 100);
    this._updatingMargin = true;
    this.lightForm.get('marginInput')?.setValue(Math.round(pct * 10) / 10, { emitEvent: false });
    this._updatingMargin = false;
    this.marginHint.set(`Profit ₹${Math.round(sell - cost)} per unit`);
  }

  loadProducts(): void {
    this.productsLoading.set(true);
    this.firebaseAdmin.getProductsByCategory('lights').subscribe({
      next: (list) => {
        this.products.set(list.sort((a, b) => a.name.localeCompare(b.name)) as LightProduct[]);
        this.productsLoading.set(false);
      },
      error: () => this.productsLoading.set(false),
    });
  }

  startEdit(product: LightProduct): void {
    const isRopeEdit = product.subcategory === 'Rope Light';
    // For rope light, reverse-compute box price from stored per-meter price
    const editPrice = isRopeEdit && product.price && product.totalLength
      ? Math.round(product.price * product.totalLength / 1.1)
      : product.price ?? null;
    this.editingProduct.set(product);
    this.confirmDeleteId.set(null);
    this.lightForm.patchValue({
      brand:           product.brand          ?? '',
      subcategory:     product.subcategory    ?? 'LED Bulb',
      name:            product.name,
      sku:             product.sku            ?? '',
      costPrice:       product.costPrice      ?? null,
      price:           editPrice,
      discountedPrice: product.discountedPrice ?? null,
      stockQty:        product.stockQty       ?? null,
      available:       product.available,
      wattage:         product.wattage        ?? null,
      totalLength:     product.totalLength     ?? null,
      costUnit:        product.costUnit        ?? 'piece',
      warranty:        product.warranty       ?? 'No warranty',
      purchaseDate:    product.purchaseDate   ?? '',
      location:        product.location       ?? '',
      remarks:         product.remarks        ?? '',
    });
    this.selectedColorTemp.set(product.colorTemp ?? '');
    this.selectedSize.set(product.size          ?? '');
    this.currentSubcat.set(product.subcategory  ?? 'LED Bulb');
    if (isRopeEdit && editPrice && product.totalLength) {
      this.ropePerMeterPrice.set(Math.round((editPrice / product.totalLength) * 1.1 * 100) / 100);
      this.fullBoxPrice.set(Math.round(editPrice * 0.9));
    } else {
      this.ropePerMeterPrice.set(null);
      this.fullBoxPrice.set(null);
    }
    this.imagePreview.set(product.imageUrl      ?? null);
    this.imageFile = null;
    this.generatedSku.set(product.sku           ?? '');
    this.calcMargin();
    setTimeout(() =>
      document.querySelector('.light-form-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50
    );
  }

  cancelEdit(): void {
    this.editingProduct.set(null);
    this.resetForm();
  }

  requestDelete(id: string): void { this.confirmDeleteId.set(id); }
  cancelDelete(): void            { this.confirmDeleteId.set(null); }

  confirmDelete(id: string): void {
    this.deletingId.set(id);
    this.confirmDeleteId.set(null);
    this.firebaseAdmin.deleteProduct(id, 'lights').subscribe({
      next: () => {
        this.products.update(list => list.filter(p => p.id !== id));
        this.deletingId.set(null);
      },
      error: (err) => { console.error('Delete failed', err); this.deletingId.set(null); },
    });
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    this.imageError.set(null);
    if (!file.type.startsWith('image/')) {
      this.imageError.set('Please select a valid image (JPEG, PNG, WebP).');
      input.value = ''; return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.imageError.set('Image must be smaller than 10 MB.');
      input.value = ''; return;
    }
    this.imageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => this.imagePreview.set(e.target!.result as string);
    reader.readAsDataURL(file);
  }

  removeImage(): void {
    this.imageFile = null;
    this.imagePreview.set(null);
    this.imageError.set(null);
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
              width  = this.MAX_DIMENSION;
            } else {
              width  = Math.round((width * this.MAX_DIMENSION) / height);
              height = this.MAX_DIMENSION;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width  = width;
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

  async onSubmit(): Promise<void> {
    if (!this.lightForm.valid) { this.errorMessage.set('Please fill all required fields.'); return; }
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    let imageUrl: string | undefined;
    if (this.imageFile) {
      try {
        imageUrl = await this.compressImage(this.imageFile);
      } catch (err) {
        this.errorMessage.set(`❌ Image processing failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        this.isLoading.set(false); return;
      }
    }

    // For rope light: price field holds total box price — store per-meter price instead
    const fv          = this.lightForm.value;
    const isRope      = this.showRopeFields();
    const storedPrice = isRope ? (this.ropePerMeterPrice() ?? fv.price) : fv.price;
    const product: LightProduct = {
      ...fv,
      price:       storedPrice,
      unit:        isRope ? 'm' : 'Piece',
      costUnit:    fv.costUnit || 'piece',
      colorTemp:   this.selectedColorTemp() || undefined,
      size:        this.showSize()  ? (this.selectedSize()  || undefined) : undefined,
      totalLength: isRope           ? (fv.totalLength       || undefined) : undefined,
      ...(imageUrl ? { imageUrl } : {}),
    };

    const editing = this.editingProduct();
    if (editing?.id) {
      this.firebaseAdmin.updateProduct(editing.id, { ...product, category: 'lights' } as any, 'lights').subscribe({
        next: () => {
          this.successMessage.set(`✅ "${product.name}" updated!`);
          this.editingProduct.set(null);
          this.isLoading.set(false);
          this.resetForm();
          this.loadProducts();
          setTimeout(() => this.successMessage.set(''), 3500);
        },
        error: (err) => {
          this.errorMessage.set(`❌ ${err?.message || 'Failed to update'}`);
          this.isLoading.set(false);
        },
      });
    } else {
      this.firebaseAdmin.submitProduct(product, 'lights').subscribe({
        next: () => {
          this.successMessage.set(`✅ "${product.name}" added!`);
          this.isLoading.set(false);
          this.resetForm();
          this.loadProducts();
          setTimeout(() => this.successMessage.set(''), 3500);
        },
        error: (err) => {
          this.errorMessage.set(`❌ ${err?.message || 'Failed to add product'}`);
          this.isLoading.set(false);
        },
      });
    }
  }

  resetForm(): void {
    this.skuCounters = {};
    this.lightForm.reset({ subcategory: 'LED Bulb', available: false, warranty: 'No warranty', costUnit: 'piece' });
    this.currentSubcat.set('LED Bulb');
    this.selectedColorTemp.set('');
    this.selectedSize.set('');
    this.fullBoxPrice.set(null);
    this.ropePerMeterPrice.set(null);
    this.marginHint.set('');
    this.generatedSku.set('');
    this.removeImage();
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  goBack(): void { this.router.navigate(['/admin']); }
}
