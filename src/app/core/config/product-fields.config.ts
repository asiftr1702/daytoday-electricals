/* ════════════════════════════════════════════════════════════════
   PRODUCT FIELD SCHEMA
   Drives the single, dynamic product-admin page. Each category gets a
   `CategoryFieldConfig` that describes its pricing behaviour and its
   category-specific "spec" fields (pills, colour pills, selects, etc.).

   These are the DEFAULTS. They are merged onto every category at load
   time and persisted into the Firestore catalogue config, so admins can
   edit them from Catalogue Settings.
   ════════════════════════════════════════════════════════════════ */

export type ProductFieldType =
  | 'text'
  | 'number'
  | 'textarea'
  | 'select'
  | 'pills'
  | 'color-pills';

/** How the pricing block of the form behaves. */
export type PricingMode =
  | 'standard'    // cost · selling · margin% · discount   (fans + generic)
  | 'unit-rope'   // cost(+unit) · selling · margin% · rope helper (lights)
  | 'length';     // per-metre ⇄ bundle pricing            (wires)

export interface ColorOption {
  label: string;
  hex: string;
  tag?: string;   // e.g. a Kelvin value shown beside the swatch
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface ProductField {
  key: string;                                  // form control + product property
  label: string;
  type: ProductFieldType;
  group?: 'specs' | 'admin';                    // where it renders (default 'specs')
  required?: boolean;
  options?: string[];                           // select / pills
  colorOptions?: ColorOption[];                 // color-pills
  optionsBySubcategory?: Record<string, string[]>; // pills that change per subcategory
  showForSubcategories?: string[];              // only visible for these subcategories
  placeholder?: string;
  min?: number;
  suffix?: string;                              // chip suffix in the inventory list (e.g. 'W')
}

export interface CategoryFieldConfig {
  pricingMode: PricingMode;
  fields: ProductField[];
  /** SKU subcategory codes (2 letters). Falls back to first 2 letters of the subcategory. */
  skuCodes?: Record<string, string>;
  warrantyOptions?: string[];
  /** standard mode: optional unit selector. If omitted, `defaultUnit` is used as a fixed unit. */
  unitOptions?: string[];
  defaultUnit?: string;
  /** length mode (wires) */
  bundleLengths?: number[];
  stockUnits?: SelectOption[];
  /** unit-rope mode (lights) */
  costUnits?: SelectOption[];
  ropeSubcategory?: string;
}

const STANDARD_WARRANTY = ['No warranty', '6 months', '1 year', '2 years', '3 years'];

// ── Fans ──────────────────────────────────────────────────────────────────
const FAN_CONFIG: CategoryFieldConfig = {
  pricingMode: 'standard',
  defaultUnit: 'Piece',
  warrantyOptions: STANDARD_WARRANTY,
  skuCodes: {
    'Ceiling Fan': 'CF', 'Pedestal Fan': 'PF', 'Wall Fan': 'WF',
    'Exhaust Fan': 'EF', 'Table Fan': 'TF', 'AP Fan': 'AF',
  },
  fields: [
    {
      key: 'bladeSize', label: 'Blade size', type: 'pills', group: 'specs',
      optionsBySubcategory: {
        'Ceiling Fan':  ['36 inch', '42 inch', '48 inch', '56 inch'],
        'Pedestal Fan': ['12 inch', '16 inch', '18 inch', '20 inch'],
        'Wall Fan':     ['12 inch', '16 inch', '18 inch'],
        'Exhaust Fan':  ['6 inch', '8 inch', '9 inch', '10 inch', '12 inch', '18 inch'],
        'Table Fan':    ['12 inch', '16 inch'],
        'AP Fan':       ['6 inch', '9 inch', '12 inch'],
      },
    },
    {
      key: 'bladeMaterial', label: 'Blade material', type: 'pills', group: 'specs',
      options: ['Aluminium (Alu)', 'Copper (Cu)', 'PVC', 'Steel'],
    },
    {
      key: 'color', label: 'Color', type: 'color-pills', group: 'specs',
      colorOptions: [
        { label: 'White',  hex: '#ffffff' },
        { label: 'Silver', hex: '#C0C0C0' },
        { label: 'Brown',  hex: '#5a4a3a' },
        { label: 'Black',  hex: '#222222' },
        { label: 'Gold',   hex: '#b8860b' },
        { label: 'Copper', hex: '#e07b55' },
      ],
    },
    {
      key: 'wattage', label: 'Wattage (W)', type: 'number', group: 'admin',
      placeholder: 'e.g. 70', min: 0, suffix: 'W',
    },
    {
      key: 'rpm', label: 'RPM', type: 'number', group: 'admin',
      placeholder: 'e.g. 380', min: 0, suffix: 'RPM',
      showForSubcategories: ['Ceiling Fan', 'Exhaust Fan'],
    },
    {
      key: 'speedSettings', label: 'Speed settings', type: 'select', group: 'admin',
      options: ['3 speed', '4 speed', '5 speed', 'Variable (regulator)'],
      showForSubcategories: ['Pedestal Fan', 'Table Fan', 'Wall Fan', 'AP Fan'],
    },
  ],
};

// ── Lights ────────────────────────────────────────────────────────────────
const LIGHT_CONFIG: CategoryFieldConfig = {
  pricingMode: 'unit-rope',
  defaultUnit: 'Piece',
  warrantyOptions: STANDARD_WARRANTY,
  ropeSubcategory: 'Rope Light',
  costUnits: [
    { value: 'piece', label: '/ piece' },
    { value: 'm',     label: '/ meter' },
    { value: 'box',   label: '/ box' },
  ],
  skuCodes: {
    'LED Bulb': 'LB', 'Tube Light': 'TL', 'Panel Light': 'PL', 'Down Light': 'DL',
    'Batten Light': 'BT', 'Flood Light': 'FL', 'Street Light': 'SL',
    'Emergency Light': 'EL', 'Strip Light': 'SR',
  },
  fields: [
    {
      key: 'colorTemp', label: 'Color temperature', type: 'color-pills', group: 'specs',
      colorOptions: [
        { label: 'Warm White',    hex: '#ffcc66', tag: '2700K' },
        { label: 'Natural White', hex: '#ffe9a0', tag: '4000K' },
        { label: 'Cool White',    hex: '#f0f4ff', tag: '5000K' },
        { label: 'Daylight',      hex: '#ddeeff', tag: '6500K' },
        { label: 'Blue',          hex: '#3b82f6' },
        { label: 'Pink',          hex: '#f472b6' },
        { label: 'Red',           hex: '#ef4444' },
        { label: 'Green',         hex: '#22c55e' },
      ],
    },
    {
      key: 'size', label: 'Strip size', type: 'pills', group: 'specs',
      options: ['1m', '2m', '3m', '5m', '10m', '15m', '20m'],
      showForSubcategories: ['Strip Light', 'Neon Light'],
    },
    {
      key: 'wattage', label: 'Wattage (W)', type: 'number', group: 'admin',
      placeholder: 'e.g. 9', min: 0, suffix: 'W',
    },
  ],
};

// ── Wires & Cables ──────────────────────────────────────────────────────────
const WIRE_CONFIG: CategoryFieldConfig = {
  pricingMode: 'length',
  warrantyOptions: ['No warranty', '1 year', '2 years', '3 years', '5 years'],
  bundleLengths: [45, 90, 100, 180, 200, 500],
  stockUnits: [
    { value: 'bundle', label: 'Bundle / Coil' },
    { value: 'm',      label: 'Metres' },
    { value: 'piece',  label: 'Piece' },
  ],
  skuCodes: {
    'FR Wire': 'FR', 'FR-LSH Wire': 'LS', 'Flexible Wire': 'FX',
    'Armoured Cable': 'AC', 'Coaxial Cable': 'CX', 'Telephone Cable': 'TC',
  },
  fields: [
    {
      key: 'coreSize', label: 'Core size (sq mm)', type: 'pills', group: 'specs',
      options: ['0.5 sq mm', '0.75 sq mm', '1 sq mm', '1.5 sq mm',
        '2.5 sq mm', '4 sq mm', '6 sq mm', '10 sq mm', '16 sq mm'],
    },
    {
      key: 'cores', label: 'Number of cores', type: 'pills', group: 'specs',
      options: ['1 core', '2 core', '3 core', '4 core', '3.5 core'],
    },
  ],
};

// ── Generic fallback (any other category) ────────────────────────────────────
export const GENERIC_FIELD_CONFIG: CategoryFieldConfig = {
  pricingMode: 'standard',
  defaultUnit: 'Piece',
  warrantyOptions: STANDARD_WARRANTY,
  unitOptions: ['Piece', 'Roll', 'Bundle', 'Meter', 'Pack', 'Box', 'Dozen'],
  fields: [],
};

export const DEFAULT_FIELD_CONFIGS: Record<string, CategoryFieldConfig> = {
  fans:   FAN_CONFIG,
  lights: LIGHT_CONFIG,
  wires:  WIRE_CONFIG,
};

/** Returns the default field config for a category id (deep-cloned). */
export function defaultFieldConfig(categoryId: string): CategoryFieldConfig {
  const base = DEFAULT_FIELD_CONFIGS[categoryId] ?? GENERIC_FIELD_CONFIG;
  return structuredClone(base);
}
