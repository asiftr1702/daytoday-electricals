export interface Product {
  id?: string;        // Firestore document ID (populated on read)
  sku?: string;
  name: string;
  subcategory?: string;
  brand?: string;
  description?: string;
  unit: string;
  costPrice?: number;
  price?: number;
  discountedPrice?: number;
  stockQty?: number;
  available: boolean;
  purchaseDate?: string;
  location?: string;
  remarks?: string;
  imageUrl?: string;
  warranty?: string;
  /** Whether the warranty tag is shown on the storefront product card (defaults to true). */
  showWarranty?: boolean;
  /** Per-product placement of spec/custom fields on the product card. */
  cardLayout?: CardLayoutField[];
}

/** Where a single spec/custom field is shown on the product card. */
export type CardLayoutSection = 'strip' | 'details';

/** A snapshot of a field's display info + chosen card section (stored per product). */
export interface CardLayoutField {
  key: string;                 // product property to read the value from
  label: string;               // field label (for reference)
  section: CardLayoutSection;  // where it renders on the card
  isColor?: boolean;           // render a colour swatch instead of a plain chip
  prefix?: string;             // shown before the value
  suffix?: string;             // shown after the value (e.g. 'W', 'm')
}
