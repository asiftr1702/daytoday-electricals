import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FirebaseAdminService } from '../../../core/services/firebase-admin.service';
import { FanProduct } from '../../../core/models/fan-product.model';

const FAN_BRANDS = ['Havells', 'Bajaj', 'Crompton', 'Orient', 'Usha', 'V-Guard'];
const FAN_SUBCATEGORIES = ['Ceiling Fan', 'Pedestal Fan', 'Wall Fan', 'Exhaust Fan', 'Table Fan', 'AP Fan'];
const FAN_BLADE_SIZES_BY_SUBCAT: Record<string, string[]> = {
  'Ceiling Fan':  ['36 inch', '42 inch', '48 inch', '56 inch'],
  'Pedestal Fan': ['12 inch', '16 inch', '18 inch', '20 inch'],
  'Wall Fan':     ['12 inch', '16 inch', '18 inch'],
  'Exhaust Fan':  ['6 inch', '8 inch', '9 inch', '10 inch', '12 inch', '18 inch'],
  'Table Fan':    ['12 inch', '16 inch'],
  'AP Fan':       ['6 inch', '9 inch', '12 inch'],
};
const FAN_BLADE_MATERIALS = ['Aluminium (Alu)', 'Copper (Cu)', 'PVC', 'Steel'];
const FAN_COLORS = [
  { label: 'White',  hex: '#ffffff' },
  { label: 'Silver', hex: '#C0C0C0' },
  { label: 'Brown',  hex: '#5a4a3a' },
  { label: 'Black',  hex: '#222222' },
  { label: 'Gold',   hex: '#b8860b' },
  { label: 'Copper', hex: '#e07b55' },
];
const FAN_SPEED_OPTIONS = ['3 speed', '4 speed', '5 speed', 'Variable (regulator)'];
const WARRANTY_OPTIONS = ['No warranty', '6 months', '1 year', '2 years', '3 years'];

const SUBCAT_CODE: Record<string, string> = {
  'Ceiling Fan': 'CF', 'Pedestal Fan': 'PF',
  'Wall Fan': 'WF',    'Exhaust Fan': 'EF', 'Table Fan': 'TF', 'AP Fan': 'AF',
};

@Component({
  selector: 'app-fan-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './fan-admin.html',
  styleUrls: ['./fan-admin.css'],
})
export class FanAdminComponent implements OnInit {
  private readonly fb             = inject(FormBuilder);
  private readonly firebaseAdmin  = inject(FirebaseAdminService);
  private readonly router         = inject(Router);

  readonly BRANDS          = FAN_BRANDS;
  readonly SUBCATEGORIES   = FAN_SUBCATEGORIES;
  readonly BLADE_MATERIALS = FAN_BLADE_MATERIALS;
  readonly COLORS          = FAN_COLORS;
  readonly SPEED_OPTIONS   = FAN_SPEED_OPTIONS;
  readonly WARRANTY_OPTIONS = WARRANTY_OPTIONS;

  // Blade sizes are dynamic per subcategory
  readonly bladeSizes = computed(() =>
    FAN_BLADE_SIZES_BY_SUBCAT[this.currentSubcat()] ?? []
  );

  fanForm!: FormGroup;

  // Pill-group selections
  readonly selectedBladeSize     = signal<string>('');
  readonly selectedBladeMaterial = signal<string>('');
  readonly selectedColor         = signal<string>('');

  // SKU generation
  private skuCounters: Record<string, number> = {};
  readonly generatedSku = signal<string>('');

  // Margin display
  readonly marginText = signal<string>('');
  readonly marginHint = signal<string>('');

  // Dynamic field visibility based on selected subcategory
  readonly currentSubcat = signal<string>('Ceiling Fan');
  readonly showRpm   = computed(() =>
    ['Ceiling Fan', 'Exhaust Fan'].includes(this.currentSubcat())
  );
  readonly showSpeed = computed(() =>
    ['Pedestal Fan', 'Table Fan', 'Wall Fan', 'AP Fan'].includes(this.currentSubcat())
  );

  // Product list
  readonly products        = signal<FanProduct[]>([]);
  readonly productsLoading = signal(false);
  readonly deletingId      = signal<string | null>(null);
  readonly confirmDeleteId = signal<string | null>(null);
  readonly editingProduct  = signal<FanProduct | null>(null);

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
    this.initForm();
    this.loadProducts();
    this.setupSKUGeneration();
    this.setupMarginCalculation();
  }

  private initForm(): void {
    this.fanForm = this.fb.group({
      brand:            ['', Validators.required],
      subcategory:      ['Ceiling Fan', Validators.required],
      name:             ['', Validators.required],
      sku:              ['', Validators.required],
      costPrice:        [null, [Validators.required, Validators.min(0)]],
      price:            [null, [Validators.required, Validators.min(0)]],
      discountedPrice:  [null, Validators.min(0)],
      stockQty:         [null, [Validators.required, Validators.min(0)]],
      available:        [true],
      wattage:          [null],
      rpm:              [null],
      speedSettings:    [''],
      warranty:         ['No warranty'],
      purchaseDate:     [''],
      location:         [''],
      remarks:          [''],
    });
  }

  private setupSKUGeneration(): void {
    ['brand', 'subcategory', 'name'].forEach(f =>
      this.fanForm.get(f)?.valueChanges.subscribe(() => this.generateSKU())
    );
    // Track subcategory to drive conditional fields
    this.fanForm.get('subcategory')?.valueChanges.subscribe((val: string) => {
      this.currentSubcat.set(val ?? 'Ceiling Fan');
      // Reset blade size when subcategory changes — sizes differ per type
      this.selectedBladeSize.set('');
      // Clear fields that don't apply to this subcategory
      if (!['Ceiling Fan', 'Exhaust Fan'].includes(val)) this.fanForm.get('rpm')?.setValue(null, { emitEvent: false });
      if (!['Pedestal Fan', 'Table Fan', 'Wall Fan', 'AP Fan'].includes(val)) {
        this.fanForm.get('speedSettings')?.setValue('', { emitEvent: false });
      }
    });
  }

  private setupMarginCalculation(): void {
    ['costPrice', 'price'].forEach(f =>
      this.fanForm.get(f)?.valueChanges.subscribe(() => this.calcMargin())
    );
  }

  private generateSKU(): void {
    const brand  = this.fanForm.get('brand')?.value ?? '';
    const subcat = this.fanForm.get('subcategory')?.value ?? '';
    const name   = (this.fanForm.get('name')?.value ?? '').trim();

    if (!brand || !subcat || !name) {
      this.generatedSku.set('');
      this.fanForm.get('sku')?.setValue('', { emitEvent: false });
      return;
    }

    const b   = brand.slice(0, 3).toUpperCase();
    const s   = SUBCAT_CODE[subcat] ?? subcat.slice(0, 2).toUpperCase();
    const n   = name.slice(0, 4).toUpperCase().replace(/\s/g, '');
    const key = `${b}${s}${n}`;

    if (!this.skuCounters[key]) {
      const prefix  = `${b}-${s}-${n}-`;
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
    this.fanForm.get('sku')?.setValue(sku, { emitEvent: false });
  }

  private calcMargin(): void {
    const cost = this.fanForm.get('costPrice')?.value ?? 0;
    const sell = this.fanForm.get('price')?.value ?? 0;
    if (!cost || !sell) { this.marginText.set(''); this.marginHint.set(''); return; }
    const pct = (((sell - cost) / cost) * 100).toFixed(1);
    this.marginText.set(`${sell > cost ? '+' : ''}${pct}%`);
    this.marginHint.set(`Profit ₹${Math.round(sell - cost)} per unit`);
  }

  loadProducts(): void {
    this.productsLoading.set(true);
    this.firebaseAdmin.getProductsByCategory('fans').subscribe({
      next: (list) => {
        this.products.set(list.sort((a, b) => a.name.localeCompare(b.name)) as FanProduct[]);
        this.productsLoading.set(false);
      },
      error: () => this.productsLoading.set(false),
    });
  }

  startEdit(product: FanProduct): void {
    this.editingProduct.set(product);
    this.confirmDeleteId.set(null);
    this.fanForm.patchValue({
      brand:           product.brand          ?? '',
      subcategory:     product.subcategory    ?? 'Ceiling Fan',
      name:            product.name,
      sku:             product.sku            ?? '',
      costPrice:       product.costPrice      ?? null,
      price:           product.price          ?? null,
      discountedPrice: product.discountedPrice ?? null,
      stockQty:        product.stockQty       ?? null,
      available:       product.available,
      wattage:         product.wattage        ?? null,
      rpm:             product.rpm            ?? null,
      speedSettings:   product.speedSettings  ?? '',
      warranty:        product.warranty       ?? 'No warranty',
      purchaseDate:    product.purchaseDate   ?? '',
      location:        product.location       ?? '',
      remarks:         product.remarks        ?? '',
    });
    this.selectedBladeSize.set(product.bladeSize     ?? '');
    this.selectedBladeMaterial.set(product.bladeMaterial ?? '');
    this.selectedColor.set(product.color             ?? '');
    this.currentSubcat.set(product.subcategory       ?? 'Ceiling Fan');
    this.imagePreview.set(product.imageUrl           ?? null);
    this.imageFile = null;
    this.generatedSku.set(product.sku                ?? '');
    this.calcMargin();
    setTimeout(() =>
      document.querySelector('.fan-form-section')
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
    this.firebaseAdmin.deleteProduct(id, 'fans').subscribe({
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
    if (!this.fanForm.valid) { this.errorMessage.set('Please fill all required fields.'); return; }
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

    const fv = this.fanForm.value;
    const product: FanProduct = {
      ...fv,
      unit:          'Piece',
      bladeSize:     this.selectedBladeSize()      || undefined,
      bladeMaterial: this.selectedBladeMaterial()  || undefined,
      color:         this.selectedColor()          || undefined,
      // Clear fields that don't apply to the selected subcategory
      rpm:           this.showRpm()   ? (fv.rpm   || undefined) : undefined,
      speedSettings: this.showSpeed() ? (fv.speedSettings || undefined) : undefined,
      ...(imageUrl ? { imageUrl } : {}),
    };

    const editing = this.editingProduct();
    if (editing?.id) {
      this.firebaseAdmin.updateProduct(editing.id, { ...product, category: 'fans' } as any, 'fans').subscribe({
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
      this.firebaseAdmin.submitProduct(product, 'fans').subscribe({
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
    this.fanForm.reset({ subcategory: 'Ceiling Fan', available: true, warranty: 'No warranty' });
    this.currentSubcat.set('Ceiling Fan');
    this.selectedBladeSize.set('');
    this.selectedBladeMaterial.set('');
    this.selectedColor.set('');
    this.generatedSku.set('');
    this.marginText.set('');
    this.marginHint.set('');
    this.removeImage();
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  goBack(): void { this.router.navigate(['/admin']); }
}
