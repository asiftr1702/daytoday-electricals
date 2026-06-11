import { Product } from './product.model';

export interface WireProduct extends Product {
  coreSize?: string;       // e.g. '1.5 sq mm', '2.5 sq mm', '4 sq mm'
  cores?: string;          // e.g. '2 core', '3 core', '4 core'
  bundleLength?: number;   // metres in one bundle/coil (e.g. 90, 100, 180)

  // Per-metre pricing (stored)
  pricePerMeter?: number;       // selling price per metre (rounded)
  bundlePrice?: number;         // selling price for full bundle (rounded)
  costPerMeter?: number;        // cost per metre
}
