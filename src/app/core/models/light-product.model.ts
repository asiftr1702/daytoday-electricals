import { Product } from './product.model';

export interface LightProduct extends Product {
  wattage?: number;      // e.g. 9
  colorTemp?: string;    // e.g. 'Warm White'
  size?: string;         // Strip Light / Neon Light (e.g. '5m')
  totalLength?: number;  // Rope Light — total metres in roll (e.g. 100)
  costUnit?: string;     // 'box' | 'm' | 'piece' — unit for cost price display
}
