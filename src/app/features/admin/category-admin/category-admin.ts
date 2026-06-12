import { Component, inject, OnInit, signal, computed, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FirebaseAdminService } from '../../../core/services/firebase-admin.service';
import { CatalogueConfigService, DynamicCategory } from '../../../core/services/catalogue-config.service';
import { CategoryFieldConfig, ProductField, colorNameToHex, evaluateFormula } from '../../../core/config/product-fields.config';
import { AnyProduct } from '../../../core/models/any-product.model';
import { CardLayoutField, CardLayoutSection } from '../../../core/models/product.model';
import { compressImage } from '../../../core/utils/image.util';
import { AdminNavComponent } from '../../../shared/admin-nav/admin-nav';

@Component({
  selector: 'app-category-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AdminNavComponent, RouterLink],
  templateUrl: './category-admin.html',
  styleUrls: ['./category-admin.css', './category-admin-sheet.css'],
})
export class CategoryAdminComponent implements OnInit {
  private readonly fb              = inject(FormBuilder);
  private readonly firebaseAdmin   = inject(FirebaseAdminService);
  private readonly catalogueConfig = inject(CatalogueConfigService);
  private readonly route           = inject(ActivatedRoute);
  private readonly router          = inject(Router);
  private readonly destroyRef      = inject(DestroyRef);

  // ── Category + schema ────────────────────────────────────────────────────
  readonly category    = signal<DynamicCategory | null>(null);
  /** All catalogue categories — drives the desktop horizontal nav bar. */
  readonly allCategories = this.catalogueConfig.categories;
  readonly fieldConfig = computed<CategoryFieldConfig | null>(() => this.category()?.fieldConfig ?? null);
  // Pricing mode is temporarily forced to 'standard' for every category — the
  // unit-rope / length pricing experiences are disabled until reworked. The
  // mode-specific code below is retained so it can be re-enabled later.
  readonly pricingMode = computed<'standard' | 'unit-rope' | 'length'>(() => 'standard');

  readonly subcategories = computed(() => this.category()?.subcategories ?? []);
  readonly brands        = computed(() => this.category()?.brands ?? []);
  readonly warrantyOptions = computed(() => this.fieldConfig()?.warrantyOptions ?? ['No warranty', '6 months', '1 year', '2 years', '3 years']);
  readonly bundleLengths = computed(() => this.fieldConfig()?.bundleLengths ?? [45, 90, 100, 180, 200, 500]);
  readonly stockUnits    = computed(() => this.fieldConfig()?.stockUnits ?? [{ value: 'bundle', label: 'Bundle / Coil' }, { value: 'm', label: 'Metres' }, { value: 'piece', label: 'Piece' }]);
  readonly costUnits     = computed(() => {
    const cfg = this.fieldConfig()?.costUnits;
    if (cfg?.length) return cfg;
    return this.pricingMode() === 'length'
      ? [{ value: 'box', label: '/ box' }, { value: 'm', label: '/ metre' }]
      : [{ value: 'piece', label: '/ piece' }, { value: 'm', label: '/ meter' }, { value: 'box', label: '/ box' }];
  });
  /**
   * Unit dropdown options. A category may override via `fieldConfig.unitOptions`,
   * otherwise the global units list (managed in Catalogue Settings) is used so the
   * Unit field is common across every category.
   */
  readonly unitOptions   = computed(() => {
    const override = this.fieldConfig()?.unitOptions;
    if (override?.length) return override;
    const global = this.catalogueConfig.units();
    return global.length ? global : null;
  });

  // ── Subcategory-aware field visibility ───────────────────────────────────
  readonly currentSubcat = signal<string>('');
  readonly visibleSpecFields = computed(() =>
    (this.fieldConfig()?.fields ?? []).filter(f => this.isFieldVisible(f))
  );
  readonly basicSpecFields = computed(() => this.visibleSpecFields().filter(f => (f.group ?? 'specs') === 'specs'));
  readonly pricingSpecFields = computed(() => this.visibleSpecFields().filter(f => f.group === 'pricing'));
  readonly stockSpecFields = computed(() => this.visibleSpecFields().filter(f => f.group === 'stock'));
  readonly adminSpecFields = computed(() => this.visibleSpecFields().filter(f => f.group === 'admin'));

  // ── Card layout (per-product field placement) ────────────────────────────
  /** Spec/custom fields the admin may place on the product card. */
  readonly placeableFields = computed(() =>
    this.visibleSpecFields().filter(f => f.type !== 'computed' || !!f.formula)
  );
  /** key → chosen card section ('off' = not shown). */
  readonly cardPlacement = signal<Record<string, CardLayoutSection | 'off'>>({});
  placement(key: string): CardLayoutSection | 'off' { return this.cardPlacement()[key] ?? 'off'; }
  setPlacement(key: string, section: CardLayoutSection | 'off'): void {
    this.cardPlacement.update(p => ({ ...p, [key]: section }));
  }

  /** key → optional prefix/suffix shown around the value on the card. */
  readonly cardAffix = signal<Record<string, { prefix?: string; suffix?: string }>>({});
  cardPrefix(key: string): string { return this.cardAffix()[key]?.prefix ?? ''; }
  cardSuffix(key: string): string { return this.cardAffix()[key]?.suffix ?? ''; }
  setCardPrefix(key: string, value: string): void {
    this.cardAffix.update(a => ({ ...a, [key]: { ...a[key], prefix: value } }));
  }
  setCardSuffix(key: string, value: string): void {
    this.cardAffix.update(a => ({ ...a, [key]: { ...a[key], suffix: value } }));
  }

  readonly isRope = computed(() =>
    this.pricingMode() === 'unit-rope' &&
    !!this.fieldConfig()?.ropeSubcategory &&
    this.currentSubcat() === this.fieldConfig()!.ropeSubcategory
  );

  /** Wires category using the standard pricing block → enable box-price ⇒ per-metre helper. */
  readonly isWireStandard = computed(() => false);

  // ── Pill selections (single-select chips, not form controls) ─────────────
  readonly pills = signal<Record<string, string>>({});
  pill(key: string): string { return this.pills()[key] ?? ''; }
  togglePill(key: string, value: string): void {
    this.pills.update(p => ({ ...p, [key]: p[key] === value ? '' : value }));
    this.recomputeComputed();
  }

  // ── Computed (auto-calculated) fields ─────────────────────────────────────
  readonly computedValues = signal<Record<string, number | null>>({});
  computedValue(key: string): number | null { return this.computedValues()[key] ?? null; }

  /** Recalculates every computed field from the current form + pill values. */
  private recomputeComputed(): void {
    const fields = (this.fieldConfig()?.fields ?? []).filter(f => f.type === 'computed');
    if (!fields.length) { this.computedValues.set({}); return; }
    const values: Record<string, unknown> = { ...this.productForm?.getRawValue?.(), ...this.pills() };
    const result: Record<string, number | null> = {};
    for (const f of fields) {
      let v = evaluateFormula(f.formula, values);
      if (v != null) {
        const dp = f.decimals ?? 2;
        const factor = Math.pow(10, dp);
        v = Math.round(v * factor) / factor;
        values[f.key] = v; // allow later computed fields to reference this one
      }
      result[f.key] = v;
    }
    this.computedValues.set(result);
  }

  productForm!: FormGroup;

  // ── SKU ──────────────────────────────────────────────────────────────────
  private skuCounters: Record<string, number> = {};
  readonly generatedSku = signal<string>('');

  // ── Margin / derived pricing ─────────────────────────────────────────────
  readonly marginHint = signal<string>('');
  private _updatingMargin = false;
  private _updatingPrice  = false;
  readonly pricePerMeter     = signal<number | null>(null); // length mode display
  readonly bundlePrice       = signal<number | null>(null); // length mode display
  readonly costPerMeterDerived = signal<number | null>(null); // length mode: per-metre cost when entered per box
  readonly ropePerMeterPrice = signal<number | null>(null); // rope display
  readonly fullBoxPrice      = signal<number | null>(null); // rope display
  readonly wirePerMeterPrice = signal<number | null>(null); // wire box→/m display

  // ── Product list ─────────────────────────────────────────────────────────
  readonly products        = signal<AnyProduct[]>([]);
  readonly productsLoading  = signal(false);
  readonly deletingId       = signal<string | null>(null);
  readonly confirmDeleteId  = signal<string | null>(null);
  readonly editingProduct   = signal<AnyProduct | null>(null);

  // ── Form status ──────────────────────────────────────────────────────────
  readonly isLoading      = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage   = signal('');

  // ── Image ────────────────────────────────────────────────────────────────
  readonly imagePreview = signal<string | null>(null);
  readonly imageError   = signal<string | null>(null);
  private imageFile: File | null = null;
  private readonly MAX_DIMENSION = 900;
  private readonly JPEG_QUALITY  = 0.80;

  ngOnInit(): void {
    // React to param changes so navigating between categories (via the admin
    // menu) reloads the page instead of reusing the previous category's data.
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const catId = params.get('id') ?? '';
        this.catalogueConfig.loadConfig().then(() => this.loadCategory(catId));
      });
  }

  private loadCategory(catId: string): void {
    const found = this.catalogueConfig.categories().find(c => c.id === catId) ?? null;
    if (!found) { this.router.navigate(['/admin']); return; }
    this.editingProduct.set(null);
    this.successMessage.set('');
    this.errorMessage.set('');
    this.skuCounters = {};
    this.category.set(this.forceWireStandardPricing(found));
    this.currentSubcat.set(found.subcategories[0] ?? '');
    this.buildForm();
    this.loadProducts();
  }

  /**
   * Wire/cable categories use the plain standard pricing block (cost · selling · margin · discount).
   * Overrides any legacy `length` pricing mode stored in Firestore for the admin form.
   */
  private forceWireStandardPricing(cat: DynamicCategory): DynamicCategory {
    const isWire = /wire|cable/i.test(cat.id) || /wire|cable/i.test(cat.name ?? '');
    if (!isWire || cat.fieldConfig?.pricingMode !== 'length') return cat;
    const fc = cat.fieldConfig ?? { pricingMode: 'standard' as const, fields: [] };
    return { ...cat, fieldConfig: { ...fc, pricingMode: 'standard' } };
  }

  // ── Field helpers ──────────────────────────────────────────────────────
  isFieldVisible(f: ProductField): boolean {
    if (!f.showForSubcategories?.length) return true;
    return f.showForSubcategories.includes(this.currentSubcat());
  }
  fieldOptions(f: ProductField): string[] {
    if (f.optionsBySubcategory) return f.optionsBySubcategory[this.currentSubcat()] ?? [];
    return f.options ?? [];
  }
  isPillField(f: ProductField): boolean { return f.type === 'pills' || f.type === 'color-pills'; }
  isComputedField(f: ProductField): boolean { return f.type === 'computed'; }
  /** Resolve a swatch colour: use stored hex unless it's the grey placeholder, then derive from the label. */
  swatchHex(c: { label: string; hex?: string }): string {
    const hex = (c.hex ?? '').trim().toLowerCase();
    if (hex && hex !== '#cccccc' && hex !== '#ccc') return hex;
    return colorNameToHex(c.label);
  }
  private controlSpecFields(): ProductField[] {
    return (this.fieldConfig()?.fields ?? []).filter(f => !this.isPillField(f) && !this.isComputedField(f));
  }

  // ── Build the reactive form for the active pricing mode ──────────────────
  private buildForm(): void {
    const mode = this.pricingMode();
    const controls: Record<string, unknown[]> = {
      brand:           ['', Validators.required],
      subcategory:     [this.currentSubcat(), Validators.required],
      name:            ['', Validators.required],
      sku:             ['', Validators.required],
      discountedPrice: [null, Validators.min(0)],
      stockQty:        [null, [Validators.required, Validators.min(0)]],
      available:       [false],
      warranty:        [this.warrantyOptions()[0] ?? 'No warranty'],
      showWarranty:    [true],
      purchaseDate:    [''],
      location:        [''],
      remarks:         [''],
    };

    if (mode === 'length') {
      controls['costPerMeter']  = [null, [Validators.required, Validators.min(0)]];
      controls['costUnit']      = [this.costUnits()[0]?.value ?? 'box'];
      controls['bundleLength']  = [this.bundleLengths()[1] ?? 90, [Validators.required, Validators.min(1)]];
      controls['pricePerMeter'] = [null, [Validators.required, Validators.min(0)]];
      controls['bundlePrice']   = [null, [Validators.required, Validators.min(0)]];
      controls['marginInput']   = [null];
      controls['stockUnit']     = [this.stockUnits()[0]?.value ?? 'bundle'];
    } else {
      controls['costPrice'] = [null, [Validators.required, Validators.min(0)]];
      controls['price']     = [null, [Validators.required, Validators.min(0)]];
      controls['marginInput'] = [null];
      if (this.isWireStandard()) {
        controls['rollLength'] = [null, [Validators.required, Validators.min(1)]];
      }
      if (mode === 'unit-rope') {
        controls['costUnit']    = [this.costUnits()[0]?.value ?? 'piece'];
        controls['totalLength'] = [null, Validators.min(0)];
      }
      if (this.unitOptions()) {
        controls['unit'] = [this.unitOptions()![0] ?? 'Piece', Validators.required];
      }
    }

    // Non-pill spec fields become controls
    for (const f of this.controlSpecFields()) {
      controls[f.key] = [f.type === 'number' ? null : ''];
    }

    this.productForm = this.fb.group(controls);
    this.wireBehaviours();
    this.recomputeComputed();
  }

  private wireBehaviours(): void {
    // Recalculate auto-computed fields on any value change
    this.productForm.valueChanges.subscribe(() => this.recomputeComputed());

    // SKU
    ['brand', 'subcategory', 'name'].forEach(f =>
      this.productForm.get(f)?.valueChanges.subscribe(() => this.generateSKU()));

    // Track subcategory → conditional fields & resets
    this.productForm.get('subcategory')?.valueChanges.subscribe((val: string) => {
      this.currentSubcat.set(val ?? '');
      for (const f of this.fieldConfig()?.fields ?? []) {
        if (f.optionsBySubcategory) this.pills.update(p => ({ ...p, [f.key]: '' }));
        if (f.showForSubcategories && !f.showForSubcategories.includes(val)) {
          this.pills.update(p => ({ ...p, [f.key]: '' }));
          if (this.productForm.contains(f.key)) {
            this.productForm.get(f.key)?.setValue(f.type === 'number' ? null : '', { emitEvent: false });
          }
        }
      }
      if (this.pricingMode() === 'unit-rope' && !this.isRope()) {
        this.productForm.get('totalLength')?.setValue(null, { emitEvent: false });
        this.ropePerMeterPrice.set(null);
        this.fullBoxPrice.set(null);
      }
    });

    // Stock → availability
    this.productForm.get('stockQty')?.valueChanges.subscribe((qty: number | null) => {
      this.productForm.get('available')?.setValue(qty != null && qty > 0, { emitEvent: false });
    });

    // Clamp negatives
    ['costPrice', 'price', 'discountedPrice', 'stockQty', 'wattage', 'totalLength', 'rollLength',
      'costPerMeter', 'pricePerMeter', 'bundlePrice', 'bundleLength'].forEach(field => {
      this.productForm.get(field)?.valueChanges.subscribe((val: number | null) => {
        if (val != null && val < 0) this.productForm.get(field)?.setValue(0, { emitEvent: false });
      });
    });

    if (this.pricingMode() === 'length') this.wireLengthPricing();
    else this.wireStandardMargin();
    if (this.pricingMode() === 'unit-rope') this.wireRope();
    if (this.isWireStandard()) this.wireBoxPerMeter();
  }

  // ── Wire box price ⇒ per-metre (standard block) ──────────────────────────
  // Per-metre selling price = (whole box/roll price ÷ roll length) × 110%.
  private wireBoxPerMeter(): void {
    const recalc = () => {
      const box = this.productForm.get('price')?.value;
      const len = this.productForm.get('rollLength')?.value;
      if (box > 0 && len > 0) {
        this.wirePerMeterPrice.set(Math.round((box / len) * 1.1));
      } else {
        this.wirePerMeterPrice.set(null);
      }
    };
    this.productForm.get('price')?.valueChanges.subscribe(recalc);
    this.productForm.get('rollLength')?.valueChanges.subscribe(recalc);
  }

  // ── Margin (standard / unit-rope) ────────────────────────────────────────
  private wireStandardMargin(): void {
    const recalc = () => {
      if (this._updatingMargin) return;
      this.calcMargin(this.productForm.get('costPrice')?.value, this.productForm.get('price')?.value);
    };
    this.productForm.get('costPrice')?.valueChanges.subscribe(recalc);
    this.productForm.get('price')?.valueChanges.subscribe(recalc);
    this.productForm.get('marginInput')?.valueChanges.subscribe((pct: number | null) => {
      if (this._updatingMargin) return;
      const cost = this.productForm.get('costPrice')?.value;
      if (cost > 0 && pct != null) {
        this._updatingMargin = true;
        const newPrice = Math.round(cost * (1 + pct / 100));
        this.productForm.get('price')?.setValue(newPrice, { emitEvent: false });
        this.marginHint.set(`Profit ₹${Math.round(newPrice - cost)} per unit`);
        this._updatingMargin = false;
      }
    });
  }

  private calcMargin(cost?: number | null, sell?: number | null): void {
    cost = cost ?? this.productForm.get('costPrice')?.value;
    sell = sell ?? this.productForm.get('price')?.value;
    if (!cost || !sell) { this.marginHint.set(''); return; }
    this._updatingMargin = true;
    this.productForm.get('marginInput')?.setValue(Math.round(((sell - cost) / cost) * 1000) / 10, { emitEvent: false });
    this._updatingMargin = false;
    this.marginHint.set(`Profit ₹${Math.round(sell - cost)} per unit`);
  }

  // ── Rope helper (lights) ─────────────────────────────────────────────────
  private wireRope(): void {
    const recalc = () => {
      const boxPrice = this.productForm.get('price')?.value;
      const len      = this.productForm.get('totalLength')?.value;
      if (this.isRope() && boxPrice > 0 && len > 0) {
        this.ropePerMeterPrice.set(Math.round((boxPrice / len) * 1.1));
        this.fullBoxPrice.set(Math.round(boxPrice * 0.9));
      } else {
        this.ropePerMeterPrice.set(null);
        this.fullBoxPrice.set(null);
      }
    };
    this.productForm.get('totalLength')?.valueChanges.subscribe(recalc);
    this.productForm.get('price')?.valueChanges.subscribe(recalc);
  }

  // ── Length pricing (wires): perMeter ⇄ bundle, margin on /m ──────────────
  private wireLengthPricing(): void {
    this.productForm.get('pricePerMeter')?.valueChanges.subscribe((ppm: number | null) => {
      if (this._updatingPrice) return;
      const len = this.productForm.get('bundleLength')?.value;
      this._updatingPrice = true;
      if (ppm != null && len > 0) {
        const bp = Math.round(ppm * len);
        this.bundlePrice.set(bp);
        this.productForm.get('bundlePrice')?.setValue(bp, { emitEvent: false });
      } else { this.bundlePrice.set(null); }
      this.pricePerMeter.set(ppm);
      this._updatingPrice = false;
    });
    this.productForm.get('bundlePrice')?.valueChanges.subscribe((bp: number | null) => {
      if (this._updatingPrice) return;
      const len = this.productForm.get('bundleLength')?.value;
      this._updatingPrice = true;
      if (bp != null && len > 0) {
        const ppm = Math.round((bp / len) * 100) / 100;
        this.pricePerMeter.set(ppm);
        this.productForm.get('pricePerMeter')?.setValue(ppm, { emitEvent: false });
      } else { this.pricePerMeter.set(null); }
      this.bundlePrice.set(bp);
      this._updatingPrice = false;
    });
    this.productForm.get('bundleLength')?.valueChanges.subscribe((len: number | null) => {
      if (this._updatingPrice || !len) return;
      const ppm = this.productForm.get('pricePerMeter')?.value;
      if (ppm != null && ppm > 0) {
        this._updatingPrice = true;
        const bp = Math.round(ppm * len);
        this.bundlePrice.set(bp);
        this.productForm.get('bundlePrice')?.setValue(bp, { emitEvent: false });
        this._updatingPrice = false;
      }
    });
    const recalcMargin = () => {
      if (this._updatingMargin) return;
      this.calcMarginPerMeter(this.effectiveCostPerMeter(), this.productForm.get('pricePerMeter')?.value);
    };
    this.productForm.get('costPerMeter')?.valueChanges.subscribe(recalcMargin);
    this.productForm.get('pricePerMeter')?.valueChanges.subscribe(recalcMargin);
    this.productForm.get('costUnit')?.valueChanges.subscribe(recalcMargin);
    this.productForm.get('bundleLength')?.valueChanges.subscribe(recalcMargin);
    this.productForm.get('marginInput')?.valueChanges.subscribe((pct: number | null) => {
      if (this._updatingMargin) return;
      const cost = this.effectiveCostPerMeter();
      if (cost != null && cost > 0 && pct != null) {
        this._updatingMargin = true;
        this.productForm.get('pricePerMeter')?.setValue(Math.round(cost * (1 + pct / 100) * 100) / 100);
        this._updatingMargin = false;
      }
    });
  }

  /**
   * Cost per metre used for margin maths. When the cost is entered per box/coil it is
   * divided by the bundle length; otherwise the entered value is already per metre.
   * Also publishes `costPerMeterDerived` for the per-metre hint shown beside a box cost.
   */
  private effectiveCostPerMeter(): number | null {
    const raw = this.productForm.get('costPerMeter')?.value;
    if (raw == null || raw === '') { this.costPerMeterDerived.set(null); return null; }
    if (this.productForm.get('costUnit')?.value === 'box') {
      const len = this.productForm.get('bundleLength')?.value;
      const perMeter = len > 0 ? raw / len : null;
      this.costPerMeterDerived.set(perMeter != null ? Math.round(perMeter * 100) / 100 : null);
      return perMeter;
    }
    this.costPerMeterDerived.set(null);
    return raw;
  }

  private calcMarginPerMeter(cost?: number | null, sell?: number | null): void {
    if (!cost || !sell) { this.marginHint.set(''); return; }
    this._updatingMargin = true;
    this.productForm.get('marginInput')?.setValue(Math.round(((sell - cost) / cost) * 1000) / 10, { emitEvent: false });
    this._updatingMargin = false;
    this.marginHint.set(`Profit ₹${(sell - cost).toFixed(2)} / m`);
  }

  // ── SKU generation ───────────────────────────────────────────────────────
  private generateSKU(): void {
    const brand  = this.productForm.get('brand')?.value ?? '';
    const subcat = this.productForm.get('subcategory')?.value ?? '';
    const name   = (this.productForm.get('name')?.value ?? '').trim();
    if (!brand || !subcat || !name) {
      this.generatedSku.set('');
      this.productForm.get('sku')?.setValue('', { emitEvent: false });
      return;
    }
    const codes = this.fieldConfig()?.skuCodes ?? {};
    const b = brand.slice(0, 3).toUpperCase();
    const s = codes[subcat] ?? subcat.replace(/\s/g, '').slice(0, 2).toUpperCase();
    const n = name.slice(0, 4).toUpperCase().replace(/\s/g, '');
    const key = `${b}${s}${n}`;
    if (!this.skuCounters[key]) {
      const prefix = `${b}-${s}-${n}-`;
      const existing = this.products().filter(p => p.sku?.startsWith(prefix));
      this.skuCounters[key] = existing.length
        ? Math.max(...existing.map(p => parseInt(p.sku!.split('-').pop() ?? '0', 10))) + 1
        : 1;
    }
    const sku = `${b}-${s}-${n}-${String(this.skuCounters[key]).padStart(3, '0')}`;
    this.generatedSku.set(sku);
    this.productForm.get('sku')?.setValue(sku, { emitEvent: false });
  }

  // ── Product list ───────────────────────────────────────────────────────
  loadProducts(): void {
    const catId = this.category()?.id;
    if (!catId) return;
    this.productsLoading.set(true);
    this.firebaseAdmin.getProductsByCategory(catId).subscribe({
      next: list => {
        this.products.set((list as AnyProduct[]).sort((a, b) => a.name.localeCompare(b.name)));
        this.productsLoading.set(false);
      },
      error: () => this.productsLoading.set(false),
    });
  }

  startEdit(product: AnyProduct): void {
    this.editingProduct.set(product);
    this.confirmDeleteId.set(null);
    const mode = this.pricingMode();

    const common: Record<string, unknown> = {
      brand:           product.brand          ?? '',
      subcategory:     product.subcategory    ?? this.subcategories()[0] ?? '',
      name:            product.name,
      sku:             product.sku            ?? '',
      discountedPrice: product.discountedPrice ?? null,
      stockQty:        product.stockQty       ?? null,
      available:       product.available,
      warranty:        product.warranty       ?? this.warrantyOptions()[0] ?? 'No warranty',
      showWarranty:    product.showWarranty !== false,
      purchaseDate:    product.purchaseDate   ?? '',
      location:        product.location       ?? '',
      remarks:         product.remarks        ?? '',
    };

    if (mode === 'length') {
      const perMeterCost = product.costPerMeter ?? product.costPrice ?? null;
      const bundleLen    = product.bundleLength ?? 90;
      const hasUnit      = product.costUnit != null;
      const costUnit     = product.costUnit ?? 'box';
      // Re-derive the value the admin originally typed.
      //  • New records (costUnit set, 'box'): costPrice is per-metre → multiply back to box cost.
      //  • Legacy records (no costUnit): costPrice already holds the whole-box figure → use as-is.
      const enteredCost  = hasUnit && costUnit === 'box' && perMeterCost != null
        ? Math.round(perMeterCost * bundleLen * 100) / 100
        : perMeterCost;
      Object.assign(common, {
        costPerMeter:  enteredCost,
        costUnit,
        bundleLength:  bundleLen,
        pricePerMeter: product.pricePerMeter ?? product.price ?? null,
        bundlePrice:   product.bundlePrice   ?? null,
        stockUnit:     product.unit          ?? 'bundle',
      });
    } else {
      const isRopeEdit = mode === 'unit-rope' && product.subcategory === this.fieldConfig()?.ropeSubcategory;
      const editPrice = isRopeEdit && product.price && product.totalLength
        ? Math.round(product.price * product.totalLength / 1.1)
        : product.price ?? null;
      Object.assign(common, {
        costPrice: product.costPrice ?? null,
        price:     editPrice,
      });
      if (this.isWireStandard()) {
        // Restore the whole box/roll price + roll length so per-metre re-derives.
        const boxPrice = product.bundlePrice
          ?? (product.price && product.totalLength
            ? Math.round((product.price * product.totalLength) / 1.1)
            : null);
        Object.assign(common, { price: boxPrice, rollLength: product.totalLength ?? null });
      }
      if (mode === 'unit-rope') {
        Object.assign(common, { costUnit: product.costUnit ?? 'piece', totalLength: product.totalLength ?? null });
      }
      if (this.unitOptions()) common['unit'] = product.unit ?? this.unitOptions()![0];
    }

    // Non-pill spec fields
    for (const f of this.controlSpecFields()) {
      common[f.key] = (product[f.key] as string | number | undefined) ?? (f.type === 'number' ? null : '');
    }

    this.productForm.patchValue(common);

    // Pills
    const pillState: Record<string, string> = {};
    for (const f of this.fieldConfig()?.fields ?? []) {
      if (this.isPillField(f)) pillState[f.key] = (product[f.key] as string) ?? '';
    }
    this.pills.set(pillState);

    // Card layout placement
    const placement: Record<string, CardLayoutSection | 'off'> = {};
    for (const f of this.fieldConfig()?.fields ?? []) placement[f.key] = 'off';
    const affix: Record<string, { prefix?: string; suffix?: string }> = {};
    for (const item of (product.cardLayout ?? [])) {
      placement[item.key] = item.section;
      if (item.prefix || item.suffix) affix[item.key] = { prefix: item.prefix, suffix: item.suffix };
    }
    this.cardPlacement.set(placement);
    this.cardAffix.set(affix);

    this.currentSubcat.set(product.subcategory ?? this.subcategories()[0] ?? '');
    this.imagePreview.set(product.imageUrl ?? null);
    this.imageFile = null;
    this.generatedSku.set(product.sku ?? '');

    if (mode === 'length') {
      this.calcMarginPerMeter(this.effectiveCostPerMeter(), this.productForm.get('pricePerMeter')?.value);
      this.pricePerMeter.set(product.pricePerMeter ?? product.price ?? null);
      this.bundlePrice.set(product.bundlePrice ?? null);
    } else {
      this.calcMargin(this.productForm.get('costPrice')?.value, this.productForm.get('price')?.value);
      const bp = this.productForm.get('price')?.value;
      if (this.isRope() && bp && product.totalLength) {
        this.ropePerMeterPrice.set(Math.round((bp / product.totalLength) * 1.1 * 100) / 100);
        this.fullBoxPrice.set(Math.round(bp * 0.9));
      }
    }

    setTimeout(() =>
      document.querySelector('.ca-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  cancelEdit(): void { this.editingProduct.set(null); this.resetForm(); }

  requestDelete(id: string): void { this.confirmDeleteId.set(id); }
  cancelDelete(): void            { this.confirmDeleteId.set(null); }

  confirmDelete(id: string): void {
    const catId = this.category()?.id ?? '';
    this.deletingId.set(id);
    this.confirmDeleteId.set(null);
    this.firebaseAdmin.deleteProduct(id, catId).subscribe({
      next: () => { this.products.update(list => list.filter(p => p.id !== id)); this.deletingId.set(null); },
      error: err => { console.error('Delete failed', err); this.deletingId.set(null); },
    });
  }

  // ── Image ────────────────────────────────────────────────────────────────
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    this.imageError.set(null);
    if (!file.type.startsWith('image/')) { this.imageError.set('Please select a valid image (JPEG, PNG, WebP).'); input.value = ''; return; }
    if (file.size > 10 * 1024 * 1024) { this.imageError.set('Image must be smaller than 10 MB.'); input.value = ''; return; }
    this.imageFile = file;
    const reader = new FileReader();
    reader.onload = e => this.imagePreview.set(e.target!.result as string);
    reader.readAsDataURL(file);
  }

  removeImage(): void { this.imageFile = null; this.imagePreview.set(null); this.imageError.set(null); }

  private compressImage(file: File): Promise<string> {
    return compressImage(file, { maxDimension: this.MAX_DIMENSION, quality: this.JPEG_QUALITY });
  }

  // ── Submit ───────────────────────────────────────────────────────────────
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
        this.errorMessage.set(`❌ Image processing failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        this.isLoading.set(false); return;
      }
    }

    const product = this.buildProduct();
    if (imageUrl) product.imageUrl = imageUrl;

    const editing = this.editingProduct();
    const onOk = (verb: string) => {
      this.successMessage.set(`✅ "${product.name}" ${verb}!`);
      this.editingProduct.set(null);
      this.isLoading.set(false);
      this.resetForm();
      this.loadProducts();
      setTimeout(() => this.successMessage.set(''), 3500);
    };
    const onErr = (fallback: string) => (err: { message?: string }) => {
      this.errorMessage.set(`❌ ${err?.message || fallback}`);
      this.isLoading.set(false);
    };

    if (editing?.id) {
      this.firebaseAdmin.updateProduct(editing.id, { ...product, category: catId } as never, catId)
        .subscribe({ next: () => onOk('updated'), error: onErr('Failed to update') });
    } else {
      this.firebaseAdmin.submitProduct(product as never, catId)
        .subscribe({ next: () => onOk('added'), error: onErr('Failed to add product') });
    }
  }

  private buildProduct(): AnyProduct {
    const fv = this.productForm.value;
    const mode = this.pricingMode();

    const product: AnyProduct = {
      sku:             fv.sku,
      name:            fv.name,
      brand:           fv.brand        || undefined,
      subcategory:     fv.subcategory  || undefined,
      discountedPrice: fv.discountedPrice ?? undefined,
      stockQty:        fv.stockQty     ?? undefined,
      available:       fv.available    ?? false,
      warranty:        fv.warranty     || undefined,
      showWarranty:    fv.showWarranty === false ? false : undefined,
      purchaseDate:    fv.purchaseDate || undefined,
      location:        fv.location     || undefined,
      remarks:         fv.remarks      || undefined,
      unit:            'Piece',
    };

    // Pills
    for (const f of this.fieldConfig()?.fields ?? []) {
      if (this.isPillField(f)) {
        const val = this.isFieldVisible(f) ? this.pill(f.key) : '';
        product[f.key] = val || undefined;
      }
    }
    // Non-pill spec fields
    for (const f of this.controlSpecFields()) {
      const val = this.isFieldVisible(f) ? fv[f.key] : undefined;
      product[f.key] = (val === '' || val == null) ? undefined : val;
    }
    // Computed fields — store their latest calculated value
    this.recomputeComputed();
    for (const f of (this.fieldConfig()?.fields ?? [])) {
      if (f.type !== 'computed') continue;
      const val = this.isFieldVisible(f) ? this.computedValue(f.key) : null;
      product[f.key] = val ?? undefined;
    }

    if (mode === 'length') {
      // Cost may be entered per box/coil — store the true per-metre cost so margin/profit
      // (selling is per metre) stay correct, while remembering how it was entered.
      const perMeterCost = this.effectiveCostPerMeter() ?? undefined;
      product.costUnit      = fv.costUnit || 'box';
      product.costPrice     = perMeterCost;
      product.costPerMeter  = perMeterCost;
      product.price         = fv.pricePerMeter ?? undefined;
      product.pricePerMeter = fv.pricePerMeter ?? undefined;
      product.bundlePrice   = fv.bundlePrice ?? undefined;
      product.bundleLength  = fv.bundleLength ?? undefined;
      product.unit          = fv.stockUnit || 'bundle';
    } else if (mode === 'unit-rope') {
      const isRope = this.isRope();
      product.costPrice   = fv.costPrice ?? undefined;
      product.costUnit    = fv.costUnit || 'piece';
      product.price       = isRope ? (this.ropePerMeterPrice() ?? fv.price) : fv.price;
      product.unit        = isRope ? 'm' : (this.fieldConfig()?.defaultUnit ?? 'Piece');
      product.totalLength = isRope ? (fv.totalLength || undefined) : undefined;
    } else {
      product.costPrice = fv.costPrice ?? undefined;
      if (this.isWireStandard() && fv.price > 0 && fv.rollLength > 0) {
        const perMeter = this.wirePerMeterPrice()
          ?? Math.round((fv.price / fv.rollLength) * 1.1);
        product.price         = perMeter;
        product.pricePerMeter = perMeter;
        product.bundlePrice   = fv.price;        // whole box / roll selling price
        product.totalLength   = fv.rollLength;   // roll length in metres
        product.unit          = 'm';
      } else {
        product.price     = fv.price ?? undefined;
        product.unit      = this.unitOptions() ? (fv.unit || 'Piece') : (this.fieldConfig()?.defaultUnit ?? 'Piece');
      }
    }

    // Per-product card layout
    const layout: CardLayoutField[] = [];
    for (const f of this.placeableFields()) {
      const section = this.placement(f.key);
      if (section !== 'strip' && section !== 'details') continue;
      const item: CardLayoutField = { key: f.key, label: f.label, section };
      if (f.type === 'color-pills') item.isColor = true;
      const prefix = this.cardPrefix(f.key).trim();
      const suffix = this.cardSuffix(f.key).trim();
      if (prefix) item.prefix = prefix;
      if (suffix) item.suffix = suffix;
      layout.push(item);
    }
    product.cardLayout = layout.length ? layout : undefined;

    return product;
  }

  resetForm(): void {
    this.skuCounters = {};
    const mode = this.pricingMode();
    const base: Record<string, unknown> = {
      subcategory: this.subcategories()[0] ?? '',
      available: false,
      warranty: this.warrantyOptions()[0] ?? 'No warranty',
    };
    if (mode === 'length') { base['bundleLength'] = this.bundleLengths()[1] ?? 90; base['stockUnit'] = this.stockUnits()[0]?.value ?? 'bundle'; base['costUnit'] = this.costUnits()[0]?.value ?? 'box'; }
    if (mode === 'unit-rope') base['costUnit'] = this.costUnits()[0]?.value ?? 'piece';
    if (this.unitOptions()) base['unit'] = this.unitOptions()![0] ?? 'Piece';
    this.productForm.reset(base);
    this.currentSubcat.set(this.subcategories()[0] ?? '');
    this.pills.set({});
    this.cardPlacement.set({});
    this.cardAffix.set({});
    this.generatedSku.set('');
    this.marginHint.set('');
    this.pricePerMeter.set(null);
    this.bundlePrice.set(null);
    this.costPerMeterDerived.set(null);
    this.ropePerMeterPrice.set(null);
    this.fullBoxPrice.set(null);
    this.wirePerMeterPrice.set(null);
    this.removeImage();
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  goBack(): void { this.router.navigate(['/admin']); }
}
