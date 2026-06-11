import { Product } from './product.model';

/**
 * A superset product used by the single dynamic admin form. It carries the
 * base product fields plus every category-specific field (fans, lights, wires)
 * and an index signature so config-driven spec fields can be read/written
 * generically.
 */
export interface AnyProduct extends Product {
  // Fan
  bladeSize?: string;
  bladeMaterial?: string;
  color?: string;
  rpm?: number;
  speedSettings?: string;
  // Light
  colorTemp?: string;
  size?: string;
  totalLength?: number;
  costUnit?: string;
  // Wire
  coreSize?: string;
  cores?: string;
  bundleLength?: number;
  pricePerMeter?: number;
  bundlePrice?: number;
  costPerMeter?: number;
  // Shared extra
  wattage?: number;

  [key: string]: unknown;
}
