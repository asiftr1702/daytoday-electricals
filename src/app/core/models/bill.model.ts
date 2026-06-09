export interface BillItem {
  productId?: string;
  productName: string;
  brand?: string;
  category?: string;
  unit?: string;
  qty: number;
  costPrice: number;
  sellPrice: number;   // agreed sell price per unit
  profit: number;      // (sellPrice - costPrice) * qty
}

export interface Bill {
  id?: string;
  billNumber?: string;  // e.g. "BILL-20260609-001"
  date: string;          // YYYY-MM-DD
  customerName?: string;
  mobileNumber?: string;
  location?: string;
  items: BillItem[];
  totalAmount: number;   // sum of sellPrice * qty (before discount)
  discountAmount: number; // discount given to customer
  finalAmount: number;   // totalAmount - discountAmount (actual amount paid)
  totalCost: number;     // sum of costPrice * qty
  totalProfit: number;   // finalAmount - totalCost
  note?: string;
  createdAt?: unknown;   // Firestore Timestamp
}
