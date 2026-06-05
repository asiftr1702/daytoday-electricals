import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, map, startWith, catchError, distinctUntilChanged } from 'rxjs/operators';
import { forkJoin, of } from 'rxjs';
import { CATEGORIES, getCategoryById } from '../../core/config/categories.config';
import { SheetsService } from '../../core/services/sheets.service';
import { Product } from '../../core/models/product.model';
import { ProductCardComponent } from '../../shared/product-card/product-card';

interface ProductsState {
  products: Product[];
  loading: boolean;
  error: string | null;
}

@Component({
  selector: 'app-products',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProductCardComponent],
  templateUrl: './products.html',
  styleUrl: './products.css',
})
export class ProductsComponent {
  private readonly sheetsService = inject(SheetsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly categories = CATEGORIES;
  readonly searchQuery = signal('');
  readonly selectedSubcategory = signal<string>('all');

  private readonly queryParams$ = this.route.queryParamMap;

  private readonly categoryId$ = this.queryParams$.pipe(
    map(params => params.get('category') || CATEGORIES[0].id),
  );

  readonly offersOnly = toSignal(
    this.queryParams$.pipe(map(params => params.get('offers') === 'true')),
    { initialValue: false },
  );

  readonly selectedCategoryId = toSignal(this.categoryId$, {
    initialValue: CATEGORIES[0].id,
  });

  readonly selectedCategory = computed(
    () => getCategoryById(this.selectedCategoryId()) ?? CATEGORIES[0],
  );

  private readonly state$ = this.queryParams$.pipe(
    map(params => ({
      isOffers: params.get('offers') === 'true',
      categoryId: params.get('category') || CATEGORIES[0].id,
    })),
    distinctUntilChanged((a, b) => a.isOffers === b.isOffers && a.categoryId === b.categoryId),
    switchMap(({ isOffers, categoryId }) => {
      if (isOffers) {
        // Load all categories in parallel, merge into one flat list
        return forkJoin(
          CATEGORIES.map(cat => this.sheetsService.getProducts(cat.id)),
        ).pipe(
          map(results => ({
            products: results.flat(),
            loading: false,
            error: null,
          }) as ProductsState),
          startWith({ products: [], loading: true, error: null } as ProductsState),
          catchError(() =>
            of({ products: [], loading: false, error: 'Unable to load products.' } as ProductsState),
          ),
        );
      }

      return this.sheetsService.getProducts(categoryId).pipe(
        map(products => ({ products, loading: false, error: null }) as ProductsState),
        startWith({ products: [], loading: true, error: null } as ProductsState),
        catchError(() =>
          of({
            products: [],
            loading: false,
            error: 'Unable to load products. Showing cached data.',
          } as ProductsState),
        ),
      );
    }),
  );

  private readonly state = toSignal(this.state$, {
    initialValue: { products: [], loading: false, error: null } as ProductsState,
  });

  readonly loading = computed(() => this.state().loading);
  readonly error = computed(() => this.state().error);

  /** Unique subcategory values present in the currently loaded product list */
  readonly availableSubcategories = computed<string[]>(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const p of this.state().products) {
      if (p.subcategory && !seen.has(p.subcategory)) {
        seen.add(p.subcategory);
        result.push(p.subcategory);
      }
    }
    return result;
  });

  readonly filteredProducts = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const sub = this.selectedSubcategory();
    const offersOnly = this.offersOnly();
    let products = this.state().products;

    if (offersOnly) {
      products = products.filter(
        p => p.discountedPrice != null && p.price != null && p.discountedPrice < p.price,
      );
    }

    if (sub !== 'all') {
      products = products.filter(p => p.subcategory === sub);
    }

    if (!q) return products;
    return products.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.brand?.toLowerCase().includes(q) ?? false),
    );
  });

  selectCategory(id: string): void {
    this.searchQuery.set('');
    this.selectedSubcategory.set('all');
    this.router.navigate([], { queryParams: { category: id } });
  }

  clearOffersFilter(): void {
    this.router.navigate([], { queryParams: { category: this.selectedCategoryId() } });
  }

  selectSubcategory(sub: string): void {
    this.selectedSubcategory.set(sub);
    this.searchQuery.set('');
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }
}
