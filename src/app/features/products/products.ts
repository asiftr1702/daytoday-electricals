import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, map, startWith, catchError, distinctUntilChanged } from 'rxjs/operators';
import { forkJoin, of } from 'rxjs';
import { CatalogueConfigService } from '../../core/services/catalogue-config.service';
import { FirebaseAdminService } from '../../core/services/firebase-admin.service';
import { BillService } from '../../core/services/bill.service';
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
  imports: [ProductCardComponent, RouterLink],
  templateUrl: './products.html',
  styleUrl: './products.css',
})
export class ProductsComponent {
  private readonly firebaseAdmin = inject(FirebaseAdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly billService = inject(BillService);
  private readonly catalogueConfig = inject(CatalogueConfigService);

  constructor() {
    this.catalogueConfig.loadConfig();
  }

  readonly categories = this.catalogueConfig.categories;
  readonly searchQuery = signal('');
  readonly selectedSubcategory = signal<string>('all');

  private readonly queryParams$ = this.route.queryParamMap;

  private readonly categoryId$ = this.queryParams$.pipe(
    map(params => params.get('category') || this.catalogueConfig.categories()[0]?.id || ''),
  );

  readonly offersOnly = toSignal(
    this.queryParams$.pipe(map(params => params.get('offers') === 'true')),
    { initialValue: false },
  );

  readonly selectedCategoryId = toSignal(this.categoryId$, {
    initialValue: this.catalogueConfig.categories()[0]?.id || '',
  });

  readonly selectedCategory = computed(
    () => {
      const id = this.selectedCategoryId();
      return this.catalogueConfig.categories().find(c => c.id === id)
        ?? this.catalogueConfig.categories()[0];
    },
  );

  private readonly state$ = this.queryParams$.pipe(
    map(params => ({
      isOffers: params.get('offers') === 'true',
      categoryId: params.get('category') || this.catalogueConfig.categories()[0]?.id || '',
    })),
    distinctUntilChanged((a, b) => a.isOffers === b.isOffers && a.categoryId === b.categoryId),
    switchMap(({ isOffers, categoryId }) => {
      if (isOffers) {
        // Load all categories in parallel, merge into one flat list
        return forkJoin(
          this.catalogueConfig.categories().map(cat => this.firebaseAdmin.getProductsByCategory(cat.id)),
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

      return this.firebaseAdmin.getProductsByCategory(categoryId).pipe(
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
        p => p.discountedPrice != null && p.discountedPrice > 0 && p.price != null && p.discountedPrice < p.price,
      );
    }

    if (sub !== 'all') {
      products = products.filter(p => p.subcategory === sub);
    }

    if (!q) return products;
    return products.filter(p => {
      const fp = p as any; // covers FanProduct extra fields
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.subcategory?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.location?.toLowerCase().includes(q) ||
        p.remarks?.toLowerCase().includes(q) ||
        p.warranty?.toLowerCase().includes(q) ||
        fp.color?.toLowerCase().includes(q) ||
        fp.bladeSize?.toLowerCase().includes(q) ||
        fp.bladeMaterial?.toLowerCase().includes(q) ||
        fp.speedSettings?.toLowerCase().includes(q) ||
        fp.wattage?.toString().includes(q) ||
        fp.rpm?.toString().includes(q) ||
        p.price?.toString().includes(q) ||
        p.stockQty?.toString().includes(q)
      );
    });
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
