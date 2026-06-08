import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FirebaseAdminService } from '../../core/services/firebase-admin.service';
import { CATEGORIES } from '../../core/config/categories.config';
import { Product } from '../../core/models/product.model';
import './admin.css';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin.html',
  styleUrls: ['./admin.css'],
})
export class AdminComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly firebaseAdmin = inject(FirebaseAdminService);

  categories = CATEGORIES;
  selectedCategory: (typeof CATEGORIES)[0] | null = null;
  subcategories: string[] = [];
  productForm!: FormGroup;

  isLoading = false;
  successMessage = '';
  errorMessage = '';

  // Product sheet state
  products = signal<Product[]>([]);
  productsLoading = signal(false);
  deletingId = signal<string | null>(null);
  confirmDeleteId = signal<string | null>(null);

  // Image upload state
  imagePreview = signal<string | null>(null);
  imageError = signal<string | null>(null);
  private imageFile: File | null = null;

  private readonly MAX_IMAGE_BYTES = 800_000; // warn above 800 KB source
  private readonly MAX_DIMENSION = 900;       // px – longest edge after resize
  private readonly JPEG_QUALITY = 0.80;

  ngOnInit(): void {
    this.initializeForm();
  }

  private initializeForm(): void {
    this.productForm = this.fb.group({
      sku: ['', Validators.required],
      name: ['', Validators.required],
      description: [''],
      subcategory: [''],
      brand: [''],
      price: [0, [Validators.required, Validators.min(0)]],
      costPrice: [0, [Validators.required, Validators.min(0)]],
      discountedPrice: [0, Validators.min(0)],
      stockQty: [0, [Validators.required, Validators.min(0)]],
      unit: ['Piece', Validators.required],
      available: [true],
      purchaseDate: [''],
      location: [''],
      remarks: [''],
    });
  }

  onCategorySelect(category: (typeof CATEGORIES)[0]): void {
    this.selectedCategory = category;
    this.subcategories = [...category.subcategories];
    this.productForm.patchValue({ subcategory: this.subcategories[0] || '' });
    this.loadProducts();
  }

  private loadProducts(): void {
    if (!this.selectedCategory) return;
    this.productsLoading.set(true);
    this.firebaseAdmin.getProductsByCategory(this.selectedCategory.id).subscribe({
      next: (list) => {
        this.products.set(list.sort((a, b) => a.name.localeCompare(b.name)));
        this.productsLoading.set(false);
      },
      error: () => this.productsLoading.set(false),
    });
  }

  requestDelete(id: string): void {
    this.confirmDeleteId.set(id);
  }

  cancelDelete(): void {
    this.confirmDeleteId.set(null);
  }

  confirmDelete(id: string): void {
    this.deletingId.set(id);
    this.confirmDeleteId.set(null);
    this.firebaseAdmin.deleteProduct(id).subscribe({
      next: () => {
        this.products.update(list => list.filter(p => p.id !== id));
        this.deletingId.set(null);
      },
      error: (err) => {
        console.error('Delete failed', err);
        this.deletingId.set(null);
      },
    });
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.imageError.set(null);

    if (!file.type.startsWith('image/')) {
      this.imageError.set('Please select a valid image file (JPEG, PNG, WebP).');
      input.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.imageError.set('Image must be smaller than 10 MB.');
      input.value = '';
      return;
    }

    this.imageFile = file;

    // Show preview immediately using the raw file
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

  async onSubmit(): Promise<void> {
    if (!this.productForm.valid) {
      this.errorMessage = 'Please fill all required fields';
      return;
    }

    if (!this.selectedCategory) {
      this.errorMessage = 'Please select a category';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    let imageUrl: string | undefined;
    if (this.imageFile) {
      try {
        imageUrl = await this.compressImage(this.imageFile);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.errorMessage = `❌ Image processing failed: ${msg}`;
        this.isLoading = false;
        return;
      }
    }

    const product: Product = {
      ...this.productForm.value,
      ...(imageUrl ? { imageUrl } : {}),
    };

    this.firebaseAdmin.submitProduct(product, this.selectedCategory.id).subscribe({
      next: () => {
        this.successMessage = `✅ Product "${product.name}" added successfully!`;
        this.productForm.reset({ unit: 'Piece', available: true });
        this.removeImage();
        this.isLoading = false;
        this.loadProducts();
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: (err) => {
        console.error('Error submitting product:', err);
        this.errorMessage = `❌ Error: ${err?.message || 'Failed to add product'}`;
        this.isLoading = false;
      },
    });
  }

  resetForm(): void {
    this.productForm.reset({ unit: 'Piece', available: true });
    this.selectedCategory = null;
    this.removeImage();
    this.successMessage = '';
    this.errorMessage = '';
  }
}

