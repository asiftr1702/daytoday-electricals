import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProductAdminService } from '../../core/services/product-admin.service';
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
  private readonly adminService = inject(ProductAdminService);

  categories = CATEGORIES;
  selectedCategory: (typeof CATEGORIES)[0] | null = null;
  subcategories: string[] = [];
  productForm!: FormGroup;

  isLoading = false;
  successMessage = '';
  errorMessage = '';

  ngOnInit(): void {
    this.initializeForm();
  }

  private initializeForm(): void {
    this.productForm = this.fb.group({
      sku: ['', Validators.required],
      name: ['', Validators.required],
      description: ['', Validators.required],
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
  }

  onSubmit(): void {
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

    const product: Product = this.productForm.value;

    this.adminService.submitProduct(product, this.selectedCategory.sheetName).subscribe({
      next: () => {
        this.successMessage = `✅ Product "${product.name}" added successfully!`;
        this.productForm.reset({ unit: 'Piece', available: true });
        this.isLoading = false;
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: (err) => {
        console.error('Error submitting product:', err);
        this.errorMessage = `❌ Error: ${err?.error?.error || err?.message || 'Failed to add product'}`;
        this.isLoading = false;
      },
    });
  }

  resetForm(): void {
    this.productForm.reset({ unit: 'Piece', available: true });
    this.selectedCategory = null;
    this.successMessage = '';
    this.errorMessage = '';
  }
}
