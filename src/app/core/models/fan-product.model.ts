import { Product } from './product.model';

export interface FanProduct extends Product {
  bladeSize?: string;      // e.g. '48 inch'
  bladeMaterial?: string;  // e.g. 'Aluminium (Alu)'
  color?: string;          // e.g. 'White'
  wattage?: number;        // e.g. 70
  rpm?: number;            // Ceiling fans only, e.g. 380
  speedSettings?: string;  // Pedestal / Table fans, e.g. '3 speed'
}
