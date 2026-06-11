import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FirebaseAdminService } from '../../../core/services/firebase-admin.service';
import { CatalogueConfigService, DynamicCategory } from '../../../core/services/catalogue-config.service';
import { Product } from '../../../core/models/product.model';
import { AdminNavComponent } from '../../../shared/admin-nav/admin-nav';

@Component({
  selector: 'app-category-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AdminNavComponent],
  templateUrl: './category-admin.html',
  styleUrls: ['./category-admin.css'],
})
export class CategoryAdminComponent implements OnInit {
  private readonly fb            = inject(FormBuilder);
  private readonly firebaseAdmin = inject(FirebaseAdminService);
  private readonly catalogueConfig = inject(CatalogueConfigService);
  private readonly route         = inject(ActivatedRoute);
  private readonly router        = inject(Router);

  readonly category    = signal<DynamicCategory | null>(null);
  readonly products    = signal<Product[]>([]);
  readonly isLoading   = signal(false);
  readonly productsLoading = signal(false);
  readonly deletingId  = signal<string | null>(null);
  readonly confirmDeleteId = signal<string | null>(null);
  readonly editingProduct  = signal<Product | null>(null);
  readonly successMessage  = signal('');
  readonly errorMessage    = signal('');
  readonly imagePreview    = signal<string | null>(null);
  readonly imageError      = signal<string | null>(null);
  private imageFile: File | null = null;
  private readonly MAX_DIMENSION = 900;
  private readonly JPEG_QUALITY  = 0.80;

  readonly subcategories = computed(() => this.category()?.subcategories ?? []);
  readonly brands        = computed(() => this.category()?.brands ?? []);

  productForm!: FormGroup;

  ngOnInit(): void {
    this.catalogueConfig.loadConfig();
    this.initForm();

    const catId = this.route.snapshot.paramMap.get('id') ?? '';
    const found = this.catalogueConfig.categories().find(c => c.id === catId) ?? null;
    this.category.set(found);

    if (!found) { this.router.navigate(['/admin']); return; }
    this.loadProducts();
  }

  private initForm(): void {
    this.productForm = this.fb.group({
      sku:             ['', Validators.required],
      name:            ['', Validators.required],
      description:     [''],
      subcategory:     [''],
      brand:           [''],
      costPrice:       [null, [Validators.required, Validators.min(0)]],
      price:           [null, [Validators.required, Validators.min(0)]],
      discountedPrice: [null, Validators.min(0)],
      stockQty:        [null, [Validators.required, Validators.min(0)]],
      unit:            ['Piece', Validators.required],
      available:       [false],
      warranty:        [''],
      location:        [''],
      remarks:         [''],
    });

    // Auto-toggle availability based on stock
    this.productForm.get('stockQty')?.valueChanges.subscribe((qty: number | null) => {
      const hasStock = qty != null && qty > 0;
      this.productForm.get('available')?.setValue(hasStock, { emitEvent: false });
    });

    // Clamp negatives to 0
    ['costPrice', 'price', 'discountedPrice', 'stockQty'].forEach(field => {
      this.productForm.get(field)?.valueChanges.subscribe((val: number | null) => {
        if (val != null && val < 0) {
          this.productForm.get(field)?.setValue(0, { emitEvent: false });
        }
      });
    });
  }

  loadProducts(): void {
    const catId = this.category()?.id;
    if (!catId) return;
    this.productsLoading.set(true);
    this.firebaseAdmin.getProductsByCategory(catId).subscribe({
      next: list => {
        this.products.set(list.sort((a, b) => a.name.localeCompare(b.name)));
        this.productsLoading.set(false);
      },
      error: () => this.productsLoading.set(false),
    });
  }

  startEdit(product: Product): void {
    this.editingProduct.set(product);
    this.confirmDeleteId.set(null);
    this.productForm.patchValue({
      sku:             product.sku            ?? '',
      name:            product.name,
      description:     product.description    ?? '',
      subcategory:     product.subcategory    ?? '',
      brand:           product.brand          ?? '',
      costPrice:       product.costPrice      ?? null,
      price:           product.price          ?? null,
      discountedPrice: product.discountedPrice ?? null,
      stockQty:        product.stockQty       ?? null,
      unit:            product.unit,
      available:       product.available,
      warranty:        product.warranty       ?? '',
      location:        product.location       ?? '',
      remarks:         product.remarks        ?? '',
    });
    this.imagePreview.set(product.imageUrl ?? null);
    this.imageFile = null;
    setTimeout(() =>
      document.querySelector('.ca-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50
    );
  }

  cancelEdit(): void {
    this.editingProduct.set(null);
    this.resetForm();
  }

  requestDelete(id: string): void  { this.confirmDeleteId.set(id); }
  cancelDelete(): void             { this.confirmDeleteId.set(null); }

  confirmDelete(id: string): void {
    const catId = this.category()?.id ?? '';
    this.deletingId.set(id);
    this.confirmDeleteId.set(null);
    this.firebaseAdmin.deleteProduct(id, catId).subscribe({
      next: () => {
        this.products.update(list => list.filter(p => p.id !== id));
        this.deletingId.set(null);
      },
      error: err => { console.error('Delete failed', err); this.deletingId.set(null); },
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
    reader.onload = e => this.imagePreview.set(e.target!.result as string);
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
      reader.onload = e => {
        const img = new Image();
        img.onerror = () => reject(new Error('Failed to decode image.'));
        img.onload = () => {
          let { width, height } = img;
          if (width > this.MAX_DIMENSION || height > this.MAX_DIMENSION) {
            if (width >= height) { height = Math.round((height * this.MAX_DIMENSION) / width); width = this.MAX_DIMENSION; }
            else { width = Math.round((width * this.MAX_DIMENSION) / height); height = this.MAX_DIMENSION; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
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
    if (!this.productForm.valid) { this.errorMessage.set('Please fill all required fields.'); return; }
    const catId = this.category()?.id ?? '';
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    let imageUrl: string | undefined;
    if (this.imageFile) {
      try { imageUrl = await this.compressImage(this.imageFile); }
      catch (err) {
        this.errorMessage.set(`❌ Image error: ${err instanceof Error ? err.message : 'Unknown'}`);
        this.isLoading.set(false); return;
      }
    }

    const product: Product = { ...this.productForm.value, ...(imageUrl ? { imageUrl } : {}) };
    const editing = this.editingProduct();

    if (editing?.id) {
      this.firebaseAdmin.updateProduct(editing.id, { ...product, category: catId } as any, catId).subscribe({
        next: () => {
          this.successMessage.set(`✅ "${product.name}" updated!`);
          this.editingProduct.set(null);
          this.isLoading.set(false);
          this.resetForm();
          this.loadProducts();
          setTimeout(() => this.successMessage.set(''), 3500);
        },
        error: err => { this.errorMessage.set(`❌ ${err?.message || 'Failed to update'}`); this.isLoading.set(false); },
      });
    } else {
      this.firebaseAdmin.submitProduct(product, catId).subscribe({
        next: () => {
          this.successMessage.set(`✅ "${product.name}" added!`);
          this.isLoading.set(false);
          this.resetForm();
          this.loadProducts();
          setTimeout(() => this.successMessage.set(''), 3500);
        },
        error: err => { this.errorMessage.set(`❌ ${err?.message || 'Failed to add'}`); this.isLoading.set(false); },
      });
    }
  }

  resetForm(): void {
    this.productForm.reset({ unit: 'Piece', available: false });
    this.removeImage();
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  goBack(): void { this.router.navigate(['/admin']); }
}
