import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Category } from '../../models/category.model';
import { CategoryService } from '../../services/category.service';

@Component({
  selector: 'app-category-filter',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="filter-container">
      <h3>Filter by Category</h3>
      <div class="category-buttons">
        <button 
          class="category-btn"
          [class.active]="selectedCategory() === ''"
          (click)="selectCategory('')">
          All
        </button>
        <button 
          *ngFor="let category of categories()"
          class="category-btn"
          [class.active]="selectedCategory() === category.name"
          (click)="selectCategory(category.name)">
          {{ category.name }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .filter-container {
      margin-bottom: 2rem;
      padding: 1.5rem;
      background: #f8f9fa;
      border-radius: 8px;
    }

    h3 {
      margin: 0 0 1rem 0;
      color: #333;
      font-size: 1.1rem;
    }

    .category-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .category-btn {
      padding: 0.5rem 1rem;
      background: white;
      border: 2px solid #ddd;
      border-radius: 20px;
      cursor: pointer;
      transition: all 0.3s ease;
      font-weight: 500;
      color: #666;
    }

    .category-btn:hover {
      border-color: #667eea;
      color: #667eea;
    }

    .category-btn.active {
      background: #667eea;
      color: white;
      border-color: #667eea;
    }
  `]
})
export class CategoryFilterComponent implements OnInit {
  categories = signal<Category[]>([]);
  selectedCategory = signal('');

  constructor(private categoryService: CategoryService) {}

  ngOnInit() {
    this.categoryService.getCategories().subscribe({
      next: (data) => {
        this.categories.set(data);
      },
      error: (err) => console.error('Error loading categories:', err)
    });
  }

  selectCategory(category: string) {
    this.selectedCategory.set(category);
  }
}
