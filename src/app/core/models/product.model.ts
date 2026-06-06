export interface Product {
  id?: string;        // Firestore document ID (populated on read)
  sku?: string;
  name: string;
  subcategory?: string;
  brand?: string;
  description: string;
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
}
