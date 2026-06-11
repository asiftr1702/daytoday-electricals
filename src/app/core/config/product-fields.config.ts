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
  | 'color-pills'
  | 'computed';

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
  group?: 'specs' | 'pricing' | 'stock' | 'admin';  // which form section it renders in (default 'specs' = Basic info)
  required?: boolean;
  options?: string[];                           // select / pills
  colorOptions?: ColorOption[];                 // color-pills
  optionsBySubcategory?: Record<string, string[]>; // pills that change per subcategory
  showForSubcategories?: string[];              // only visible for these subcategories
  placeholder?: string;
  min?: number;
  prefix?: string;                              // text/number: shown before the input value (e.g. '₹')
  suffix?: string;                              // chip suffix in the inventory list + after the input value (e.g. 'W')
  /**
   * computed: arithmetic formula that references other field keys with {key} tokens.
   * Supports + - * / ( ) and decimal numbers. Example: ({boxPrice} / {totalLength}) * 1.1
   */
  formula?: string;
  decimals?: number;                            // computed: rounding (decimal places, default 2)
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

// ── Wire size + colour spec fields (shared so they apply to any wire/cable category) ──
export const WIRE_COLOR_OPTIONS: ColorOption[] = [
  { label: 'Red',    hex: '#ef4444' },
  { label: 'Black',  hex: '#222222' },
  { label: 'Green',  hex: '#22c55e' },
  { label: 'Yellow', hex: '#eab308' },
  { label: 'Blue',   hex: '#3b82f6' },
  { label: 'White',  hex: '#f0f0f0' },
  { label: 'Grey',   hex: '#9ca3af' },
  { label: 'Brown',  hex: '#92400e' },
];

/** Common colour-name → hex lookup used to resolve a swatch for user-entered colours. */
const COLOR_NAME_HEX: Record<string, string> = {
  red: '#ef4444', crimson: '#dc143c', maroon: '#800000', pink: '#f472b6',
  orange: '#f97316', amber: '#f59e0b', yellow: '#eab308', gold: '#b8860b',
  green: '#22c55e', olive: '#808000', teal: '#14b8a6', cyan: '#06b6d4',
  blue: '#3b82f6', navy: '#1e3a8a', indigo: '#6366f1', purple: '#a855f7',
  violet: '#8b5cf6', magenta: '#d946ef', brown: '#92400e', beige: '#f5f5dc',
  black: '#222222', white: '#f0f0f0', grey: '#9ca3af', gray: '#9ca3af',
  silver: '#c0c0c0', copper: '#e07b55', bronze: '#cd7f32', ivory: '#fffff0',
  cream: '#fffdd0',
};

/** Resolve a hex swatch for a colour label. Accepts hex (#rgb/#rrggbb) or a known name. */
export function colorNameToHex(label: string): string {
  const v = (label ?? '').trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return v;
  return COLOR_NAME_HEX[v] ?? '#cccccc';
}


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
  pricingMode: 'standard',
  defaultUnit: 'Piece',
  warrantyOptions: ['No warranty', '1 year', '2 years', '3 years', '5 years'],
  bundleLengths: [45, 90, 100, 180, 200, 500],
  stockUnits: [
    { value: 'bundle', label: 'Bundle / Coil' },
    { value: 'm',      label: 'Metres' },
    { value: 'piece',  label: 'Piece' },
  ],
  // How the purchase/cost price is entered. Wires are usually bought per box/coil.
  costUnits: [
    { value: 'box', label: '/ box' },
    { value: 'm',   label: '/ metre' },
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

// ── Computed-field formula evaluation ────────────────────────────────────────

/** Safe arithmetic parser supporting + - * / ( ) and decimal numbers (no eval). */
function evalArithmetic(expr: string): number {
  if (!/^[\d\s.+\-*/()]*$/.test(expr)) throw new Error('invalid characters');
  let pos = 0;
  const s = expr;
  const skipWs = () => { while (pos < s.length && s[pos] === ' ') pos++; };

  const parseExpression = (): number => {
    let value = parseTerm();
    skipWs();
    while (pos < s.length && (s[pos] === '+' || s[pos] === '-')) {
      const op = s[pos++];
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
      skipWs();
    }
    return value;
  };
  const parseTerm = (): number => {
    let value = parseFactor();
    skipWs();
    while (pos < s.length && (s[pos] === '*' || s[pos] === '/')) {
      const op = s[pos++];
      const rhs = parseFactor();
      value = op === '*' ? value * rhs : value / rhs;
      skipWs();
    }
    return value;
  };
  const parseFactor = (): number => {
    skipWs();
    if (s[pos] === '+') { pos++; return parseFactor(); }
    if (s[pos] === '-') { pos++; return -parseFactor(); }
    if (s[pos] === '(') {
      pos++;
      const v = parseExpression();
      skipWs();
      if (s[pos] === ')') pos++; else throw new Error('missing )');
      return v;
    }
    const start = pos;
    while (pos < s.length && /[\d.]/.test(s[pos])) pos++;
    if (pos === start) throw new Error('number expected');
    const num = Number(s.slice(start, pos));
    if (Number.isNaN(num)) throw new Error('bad number');
    return num;
  };

  const result = parseExpression();
  skipWs();
  if (pos !== s.length) throw new Error('unexpected token');
  return result;
}

/**
 * Evaluates a computed-field `formula`, substituting {key} tokens with numeric values.
 * Returns null when the formula is empty, a referenced value is missing/non-numeric,
 * or the result is not finite (e.g. divide by zero).
 */
export function evaluateFormula(
  formula: string | undefined,
  values: Record<string, unknown>,
): number | null {
  if (!formula?.trim()) return null;
  let missing = false;
  const substituted = formula.replace(/\{([^}]+)\}/g, (_m, rawKey: string) => {
    const v = values[rawKey.trim()];
    const n = typeof v === 'number' ? v : Number(v);
    if (v === null || v === undefined || v === '' || Number.isNaN(n)) { missing = true; return '0'; }
    return `(${n})`;
  });
  if (missing) return null;
  try {
    const result = evalArithmetic(substituted);
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

/** Extracts the {key} references used in a formula. */
export function formulaKeys(formula: string | undefined): string[] {
  if (!formula) return [];
  const keys = new Set<string>();
  for (const m of formula.matchAll(/\{([^}]+)\}/g)) keys.add(m[1].trim());
  return [...keys];
}

