export interface SaleEntry {
  id?: string;
  date: string;           // ISO date string YYYY-MM-DD
  productName: string;
  category?: string;
  qty: number;
  costPrice: number;      // cost per unit
  sellPrice: number;      // actual sell price per unit
  profit: number;         // (sellPrice - costPrice) * qty  – stored for quick queries
  note?: string;
  createdAt?: unknown;    // Firestore Timestamp
}
