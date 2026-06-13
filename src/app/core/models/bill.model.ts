export interface BillItem {
  productId?: string;
  productName: string;
  brand?: string;
  subcategory?: string;
  category?: string;
  unit?: string;
  qty: number;
  costPrice: number;
  sellPrice: number;   // agreed sell price per unit
  profit: number;      // (sellPrice - costPrice) * qty
  /** Custom field values flagged "include in bill" for this product's category. */
  billFields?: { label: string; value: string }[];
  /** Cumulative quantity returned by the customer (0 / undefined = none returned). */
  returnedQty?: number;
}

/** A single return transaction recorded against a bill. */
export interface BillReturn {
  date: string;          // YYYY-MM-DD the return was processed
  items: { productName: string; brand?: string; qty: number; sellPrice?: number; refund?: number }[];
  refundAmount: number;  // rounded ₹ refunded to the customer
}

export interface Bill {
  id?: string;
  billNumber?: string;  // e.g. "BILL-20260609-001"
  date: string;          // YYYY-MM-DD
  customerName?: string;
  mobileNumber?: string;
  location?: string;
  items: BillItem[];
  totalAmount: number;   // sum of sellPrice * qty (before discount) — ORIGINAL, never mutated by returns
  discountAmount: number; // discount given to customer
  finalAmount: number;   // totalAmount - discountAmount (actual amount paid) — ORIGINAL, never mutated by returns
  totalCost: number;     // sum of costPrice * qty
  totalProfit: number;   // net profit (recomputed after returns)
  note?: string;
  /** Cumulative amount refunded across all returns. */
  refundedAmount?: number;
  /** Log of return transactions against this bill. */
  returns?: BillReturn[];
  createdAt?: unknown;   // Firestore Timestamp
}
