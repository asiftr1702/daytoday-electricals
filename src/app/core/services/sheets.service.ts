import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { Product } from '../models/product.model';
import { CATEGORIES } from '../config/categories.config';
import { SPREADSHEET_ID } from '../config/sheets.config';

// ─────────────────────────────────────────────────────────────────────────────
// Sample data displayed when Google Sheets is not yet configured.
// Replace with your real Google Sheets data by updating sheets.config.ts.
// Column order mirrors the sheet: sku, product_name, subcategory, brand,
// description, unit, cost_price, selling_price, discounted_price, stock_qty,
// availability, purchase_date, location, remarks
// ─────────────────────────────────────────────────────────────────────────────
const SAMPLE_PRODUCTS: Record<string, Product[]> = {
  fans: [
    { sku: 'FAN-001', name: 'Havells Ceiling Fan 1200mm', subcategory: 'Ceiling Fan', brand: 'Havells', description: '3-blade ceiling fan, 70W, high speed', unit: 'Piece', costPrice: 1960, price: 2800, discountedPrice: 2100, stockQty: 15, available: true, purchaseDate: '2025-01-15', location: 'Rack-A', remarks: '', imageUrl: 'https://placehold.co/400x300/B3E5FC/1565C0?text=Havells+Ceiling+Fan' },
    { sku: 'FAN-002', name: 'Crompton Ceiling Fan 1200mm', subcategory: 'Ceiling Fan', brand: 'Crompton', description: 'Silent pro, energy saving 35W', unit: 'Piece', costPrice: 2240, price: 3200, stockQty: 10, available: true, purchaseDate: '2025-01-15', location: 'Rack-A', remarks: '', imageUrl: 'https://placehold.co/400x300/B3E5FC/1565C0?text=Crompton+Ceiling+Fan' },
    { sku: 'FAN-003', name: 'Orient Pedestal Fan 400mm', subcategory: 'Pedestal Fan', brand: 'Orient', description: 'Portable stand fan, 3 speed settings', unit: 'Piece', costPrice: 1540, price: 2200, discountedPrice: 1750, stockQty: 8, available: true, purchaseDate: '2025-02-10', location: 'Rack-A', remarks: '', imageUrl: 'https://placehold.co/400x300/B3E5FC/1565C0?text=Orient+Pedestal+Fan' },
    { sku: 'FAN-004', name: 'Bajaj Pedestal Fan 450mm', subcategory: 'Pedestal Fan', brand: 'Bajaj', description: 'Heavy duty pedestal fan, wide oscillation', unit: 'Piece', costPrice: 1295, price: 1850, stockQty: 12, available: true, purchaseDate: '2025-02-10', location: 'Rack-A', remarks: '' },
    { sku: 'FAN-005', name: 'Usha Table Fan 400mm', subcategory: 'Table Fan', brand: 'Usha', description: 'Compact table fan, 3-speed motor', unit: 'Piece', costPrice: 840, price: 1200, stockQty: 20, available: true, purchaseDate: '2025-03-05', location: 'Rack-B', remarks: '' },
    { sku: 'FAN-006', name: 'Havells Table Fan 300mm', subcategory: 'Table Fan', brand: 'Havells', description: 'Slim design, quiet operation', unit: 'Piece', costPrice: 1015, price: 1450, stockQty: 0, available: false, purchaseDate: '2025-03-05', location: 'Rack-B', remarks: 'Reorder pending' },
    { sku: 'FAN-007', name: 'Crompton AP Decora Fan', subcategory: 'AP Fan', brand: 'Crompton', description: 'Antique décor fan, premium finish', unit: 'Piece', costPrice: 2940, price: 4200, stockQty: 6, available: true, purchaseDate: '2025-03-05', location: 'Rack-B', remarks: '' },
    { sku: 'FAN-008', name: 'Orient AP Fan 1200mm', subcategory: 'AP Fan', brand: 'Orient', description: 'All-purpose decorative fan, 5-blade', unit: 'Piece', costPrice: 2730, price: 3900, stockQty: 5, available: true, purchaseDate: '2025-04-20', location: 'Rack-B', remarks: '' },
    { sku: 'FAN-009', name: 'Usha Exhaust Fan 6"', subcategory: 'Exhaust Fan', brand: 'Usha', description: 'Kitchen / bathroom exhaust fan', unit: 'Piece', costPrice: 476, price: 680, stockQty: 0, available: false, purchaseDate: '2025-04-20', location: 'Rack-C', remarks: 'Reorder pending' },
    { sku: 'FAN-010', name: 'Havells Exhaust Fan 9"', subcategory: 'Exhaust Fan', brand: 'Havells', description: 'High speed exhaust, rust-proof body', unit: 'Piece', costPrice: 665, price: 950, stockQty: 14, available: true, purchaseDate: '2025-04-20', location: 'Rack-C', remarks: '' },
    { sku: 'FAN-011', name: 'Crompton Wall Fan 300mm', subcategory: 'Wall Fan', brand: 'Crompton', description: 'Heavy duty wall-mount fan', unit: 'Piece', costPrice: 1050, price: 1500, stockQty: 9, available: true, purchaseDate: '2025-05-12', location: 'Rack-C', remarks: '' },
  ],
  lights: [
    { sku: 'LGT-001', name: 'Philips LED Bulb 9W', subcategory: 'LED Bulb', brand: 'Philips', description: 'B22 base, warm white, energy saving', unit: 'Piece', costPrice: 60, price: 85, discountedPrice: 60, stockQty: 50, available: true, purchaseDate: '2025-01-15', location: 'Shelf-1', remarks: '', imageUrl: 'https://placehold.co/400x300/FFF9C4/E65100?text=Philips+LED+Bulb+9W' },
    { sku: 'LGT-002', name: 'Syska LED Bulb 12W', subcategory: 'LED Bulb', brand: 'Syska', description: 'E27 base, cool daylight', unit: 'Piece', costPrice: 66, price: 95, stockQty: 40, available: true, purchaseDate: '2025-01-15', location: 'Shelf-1', remarks: '', imageUrl: 'https://placehold.co/400x300/FFF9C4/E65100?text=Syska+LED+12W' },
    { sku: 'LGT-003', name: 'Wipro LED Tube 20W', subcategory: 'LED Tube Light', brand: 'Wipro', description: '4 ft LED tube light, cool white', unit: 'Piece', costPrice: 196, price: 280, discountedPrice: 210, stockQty: 25, available: true, purchaseDate: '2025-02-10', location: 'Shelf-1', remarks: '', imageUrl: 'https://placehold.co/400x300/FFF9C4/E65100?text=Wipro+LED+Tube+20W' },
    { sku: 'LGT-004', name: 'Philips LED Tube 18W', subcategory: 'LED Tube Light', brand: 'Philips', description: '4 ft slim batten, warm white', unit: 'Piece', costPrice: 217, price: 310, stockQty: 20, available: true, purchaseDate: '2025-02-10', location: 'Shelf-1', remarks: '' },
    { sku: 'LGT-005', name: 'Havells Downlight 7W', subcategory: 'Downlight', brand: 'Havells', description: 'Recessed LED downlight, round', unit: 'Piece', costPrice: 154, price: 220, stockQty: 18, available: true, purchaseDate: '2025-03-05', location: 'Shelf-2', remarks: '' },
    { sku: 'LGT-006', name: 'Philips Downlight 9W', subcategory: 'Downlight', brand: 'Philips', description: 'Square recessed downlight, warm white', unit: 'Piece', costPrice: 207, price: 295, stockQty: 15, available: true, purchaseDate: '2025-03-05', location: 'Shelf-2', remarks: '' },
    { sku: 'LGT-007', name: 'Wipro Panel Light 18W', subcategory: 'Panel Light', brand: 'Wipro', description: '2×2 ft LED panel, 6500K cool white', unit: 'Piece', costPrice: 595, price: 850, stockQty: 10, available: true, purchaseDate: '2025-04-20', location: 'Shelf-2', remarks: '' },
    { sku: 'LGT-008', name: 'Syska Flood Light 30W', subcategory: 'Flood Light', brand: 'Syska', description: 'Outdoor waterproof LED flood light', unit: 'Piece', costPrice: 840, price: 1200, stockQty: 7, available: true, purchaseDate: '2025-04-20', location: 'Shelf-2', remarks: '' },
    { sku: 'LGT-009', name: 'Havells Street Light 45W', subcategory: 'Street Light', brand: 'Havells', description: 'IP65 street / pathway LED light', unit: 'Piece', costPrice: 1960, price: 2800, stockQty: 0, available: false, purchaseDate: '2025-05-12', location: 'Shelf-3', remarks: 'Discontinued' },
    { sku: 'LGT-010', name: 'Philips Fancy Bulb 5W', subcategory: 'Decorative Light', brand: 'Philips', description: 'G45 globe bulb, warm glow, décor use', unit: 'Piece', costPrice: 84, price: 120, stockQty: 30, available: true, purchaseDate: '2025-05-12', location: 'Shelf-3', remarks: '' },
  ],
  wires: [
    { sku: 'WIR-001', name: 'Finolex FR Wire 1.5 sqmm', subcategory: 'FR Wire', brand: 'Finolex', description: 'PVC insulated FR wire, 90m roll', unit: 'Roll', costPrice: 455, price: 650, stockQty: 20, available: true, purchaseDate: '2025-01-15', location: 'Rack-D', remarks: '' },
    { sku: 'WIR-002', name: 'Havells FR Wire 2.5 sqmm', subcategory: 'FR Wire', brand: 'Havells', description: 'FR PVC wire, 90m roll', unit: 'Roll', costPrice: 665, price: 950, stockQty: 15, available: true, purchaseDate: '2025-01-15', location: 'Rack-D', remarks: '' },
    { sku: 'WIR-003', name: 'Polycab FR-LSH Wire 1.5 sqmm', subcategory: 'FR-LSH Wire', brand: 'Polycab', description: 'Low smoke halogen-free, 90m roll', unit: 'Roll', costPrice: 504, price: 720, stockQty: 12, available: true, purchaseDate: '2025-02-10', location: 'Rack-D', remarks: '' },
    { sku: 'WIR-004', name: 'Finolex Flexible Wire 1.5 sqmm', subcategory: 'Flexible Wire', brand: 'Finolex', description: 'Multicore flexible copper wire, per metre', unit: 'Meter', costPrice: 15, price: 22, stockQty: 200, available: true, purchaseDate: '2025-02-10', location: 'Rack-D', remarks: '' },
    { sku: 'WIR-005', name: 'Polycab Armoured Cable 4 sqmm', subcategory: 'Armoured Cable', brand: 'Polycab', description: 'Heavy duty armoured cable, per meter', unit: 'Meter', costPrice: 38, price: 55, stockQty: 150, available: true, purchaseDate: '2025-03-05', location: 'Rack-E', remarks: '' },
    { sku: 'WIR-006', name: 'KEI XLPE Armoured Cable 6 sqmm', subcategory: 'Armoured Cable', brand: 'KEI', description: 'Industrial grade armoured, per meter', unit: 'Meter', costPrice: 77, price: 110, stockQty: 100, available: true, purchaseDate: '2025-03-05', location: 'Rack-E', remarks: '' },
    { sku: 'WIR-007', name: 'RG6 Coaxial Cable', subcategory: 'Coaxial Cable', brand: 'Generic', description: 'TV / CCTV coaxial cable, per metre', unit: 'Meter', costPrice: 13, price: 18, stockQty: 300, available: true, purchaseDate: '2025-04-20', location: 'Rack-E', remarks: '' },
  ],
  modular: [
    { sku: 'MOD-001', name: 'Legrand 16A SP Switch', subcategory: 'Switches', brand: 'Legrand', description: 'Single pole modular switch, white', unit: 'Piece', costPrice: 60, price: 85, stockQty: 50, available: true, purchaseDate: '2025-01-15', location: 'Shelf-4', remarks: '', imageUrl: 'https://placehold.co/400x300/E8F5E9/1B5E20?text=Legrand+16A+Switch' },
    { sku: 'MOD-002', name: 'GM Modular 6A Switch', subcategory: 'Switches', brand: 'GM Modular', description: '1-way modular switch with indicator', unit: 'Piece', costPrice: 45, price: 65, stockQty: 40, available: true, purchaseDate: '2025-01-15', location: 'Shelf-4', remarks: '' },
    { sku: 'MOD-003', name: 'Schneider 16A 3-pin Socket', subcategory: 'Sockets', brand: 'Schneider', description: '3-pin socket with indicator light', unit: 'Piece', costPrice: 102, price: 145, stockQty: 35, available: true, purchaseDate: '2025-02-10', location: 'Shelf-4', remarks: '', imageUrl: 'https://placehold.co/400x300/E8F5E9/1B5E20?text=Schneider+3-Pin+Socket' },
    { sku: 'MOD-004', name: 'GM Modular 5A Socket', subcategory: 'Sockets', brand: 'GM Modular', description: '2-pin socket with shutter', unit: 'Piece', costPrice: 66, price: 95, stockQty: 30, available: true, purchaseDate: '2025-02-10', location: 'Shelf-4', remarks: '' },
    { sku: 'MOD-005', name: 'Anchor Roma Blank Plate', subcategory: 'Plates & Frames', brand: 'Anchor', description: 'Gang plate for modular systems', unit: 'Piece', costPrice: 32, price: 45, stockQty: 60, available: true, purchaseDate: '2025-03-05', location: 'Shelf-5', remarks: '' },
    { sku: 'MOD-006', name: 'Legrand 2M Frame', subcategory: 'Plates & Frames', brand: 'Legrand', description: '2-module wall frame, white', unit: 'Piece', costPrice: 38, price: 55, stockQty: 45, available: true, purchaseDate: '2025-03-05', location: 'Shelf-5', remarks: '' },
    { sku: 'MOD-007', name: 'GM Modular Door Bell Push', subcategory: 'Bells & Buzzers', brand: 'GM Modular', description: 'Lighted bell push button, modular', unit: 'Piece', costPrice: 52, price: 75, stockQty: 25, available: true, purchaseDate: '2025-04-20', location: 'Shelf-5', remarks: '' },
    { sku: 'MOD-008', name: 'Legrand TV Socket', subcategory: 'TV & Data Points', brand: 'Legrand', description: 'TV coaxial socket, modular', unit: 'Piece', costPrice: 84, price: 120, stockQty: 20, available: true, purchaseDate: '2025-04-20', location: 'Shelf-5', remarks: '' },
  ],
  'non-modular': [
    { sku: 'NMD-001', name: '6A Bakelite Switch 1-way', subcategory: 'Switches', brand: 'Generic', description: 'Traditional single-way switch', unit: 'Piece', costPrice: 18, price: 25, stockQty: 100, available: true, purchaseDate: '2025-01-15', location: 'Shelf-6', remarks: '' },
    { sku: 'NMD-002', name: '16A 2-way Switch', subcategory: 'Switches', brand: 'Generic', description: '2-way traditional switch', unit: 'Piece', costPrice: 28, price: 40, stockQty: 80, available: true, purchaseDate: '2025-01-15', location: 'Shelf-6', remarks: '' },
    { sku: 'NMD-003', name: '16A 3-pin Socket', subcategory: 'Sockets', brand: 'Generic', description: 'Traditional 3-pin wall socket', unit: 'Piece', costPrice: 32, price: 45, stockQty: 70, available: true, purchaseDate: '2025-02-10', location: 'Shelf-6', remarks: '' },
    { sku: 'NMD-004', name: '5A 2-pin Socket', subcategory: 'Sockets', brand: 'Generic', description: 'Traditional 2-pin socket', unit: 'Piece', costPrice: 18, price: 25, stockQty: 90, available: true, purchaseDate: '2025-02-10', location: 'Shelf-6', remarks: '' },
    { sku: 'NMD-005', name: 'PVC Junction Box 3"×3"', subcategory: 'Junction Boxes', brand: 'Generic', description: 'Surface-mount PVC junction box', unit: 'Piece', costPrice: 21, price: 30, stockQty: 50, available: true, purchaseDate: '2025-03-05', location: 'Shelf-7', remarks: '' },
    { sku: 'NMD-006', name: 'MS Junction Box 4"×4"', subcategory: 'Junction Boxes', brand: 'Generic', description: 'Metal surface junction box with lid', unit: 'Piece', costPrice: 38, price: 55, stockQty: 35, available: true, purchaseDate: '2025-03-05', location: 'Shelf-7', remarks: '' },
    { sku: 'NMD-007', name: 'Conduit Pipe 20mm', subcategory: 'Conduit', brand: 'Generic', description: '3m rigid PVC conduit pipe', unit: 'Piece', costPrice: 38, price: 55, stockQty: 60, available: true, purchaseDate: '2025-04-20', location: 'Shelf-7', remarks: '' },
    { sku: 'NMD-008', name: 'Conduit Bend 20mm', subcategory: 'Conduit', brand: 'Generic', description: 'PVC conduit elbow / bend', unit: 'Piece', costPrice: 6, price: 8, stockQty: 120, available: true, purchaseDate: '2025-04-20', location: 'Shelf-7', remarks: '' },
    { sku: 'NMD-009', name: 'Electrical Tape Black', subcategory: 'Tape & Connectors', brand: 'Generic', description: 'PVC insulation tape, 10m roll', unit: 'Roll', costPrice: 14, price: 20, stockQty: 150, available: true, purchaseDate: '2025-05-12', location: 'Shelf-7', remarks: '' },
  ],
  fitting: [
    { sku: 'FIT-001', name: 'L&T MCB 32A SP', subcategory: 'MCB', brand: 'L&T', description: 'Single pole miniature circuit breaker', unit: 'Piece', costPrice: 130, price: 185, stockQty: 25, available: true, purchaseDate: '2025-01-15', location: 'Rack-F', remarks: '' },
    { sku: 'FIT-002', name: 'Havells MCB 16A DP', subcategory: 'MCB', brand: 'Havells', description: 'Double pole MCB, 10kA breaking capacity', unit: 'Piece', costPrice: 224, price: 320, stockQty: 18, available: true, purchaseDate: '2025-01-15', location: 'Rack-F', remarks: '' },
    { sku: 'FIT-003', name: 'Havells RCCB 40A 2P', subcategory: 'RCCB / ELCB', brand: 'Havells', description: '2-pole RCCB, 30mA sensitivity', unit: 'Piece', costPrice: 665, price: 950, stockQty: 10, available: true, purchaseDate: '2025-02-10', location: 'Rack-F', remarks: '' },
    { sku: 'FIT-004', name: 'Legrand ELCB 63A 4P', subcategory: 'RCCB / ELCB', brand: 'Legrand', description: '4-pole ELCB, 100mA sensitivity', unit: 'Piece', costPrice: 1540, price: 2200, stockQty: 5, available: true, purchaseDate: '2025-02-10', location: 'Rack-F', remarks: '' },
    { sku: 'FIT-005', name: 'Schneider 8-way DB', subcategory: 'Distribution Board', brand: 'Schneider', description: '8-way distribution board with door', unit: 'Piece', costPrice: 980, price: 1400, stockQty: 8, available: true, purchaseDate: '2025-03-05', location: 'Rack-G', remarks: '' },
    { sku: 'FIT-006', name: 'L&T 4-way Metallic DB', subcategory: 'Distribution Board', brand: 'L&T', description: 'Surface-mount 4-way metal DB', unit: 'Piece', costPrice: 476, price: 680, stockQty: 10, available: true, purchaseDate: '2025-03-05', location: 'Rack-G', remarks: '' },
    { sku: 'FIT-007', name: 'PVC Surface Box 3M', subcategory: 'Surface Boxes', brand: 'Generic', description: '3-module PVC surface mounting box', unit: 'Piece', costPrice: 28, price: 40, stockQty: 40, available: true, purchaseDate: '2025-04-20', location: 'Rack-G', remarks: '' },
    { sku: 'FIT-008', name: 'PVC Cable Clip 20mm', subcategory: 'Cable Clips & Ties', brand: 'Generic', description: 'Self-adhesive cable clips, pack of 100', unit: 'Pack', costPrice: 32, price: 45, stockQty: 30, available: true, purchaseDate: '2025-04-20', location: 'Rack-G', remarks: '' },
    { sku: 'FIT-009', name: 'Nylon Cable Ties 200mm', subcategory: 'Cable Clips & Ties', brand: 'Generic', description: 'UV-resistant cable ties, pack of 100', unit: 'Pack', costPrice: 42, price: 60, stockQty: 25, available: true, purchaseDate: '2025-05-12', location: 'Rack-G', remarks: '' },
    { sku: 'FIT-010', name: 'Conduit Coupler 20mm', subcategory: 'Conduit Fittings', brand: 'Generic', description: 'PVC conduit coupler / joiner', unit: 'Piece', costPrice: 4, price: 5, stockQty: 200, available: true, purchaseDate: '2025-05-12', location: 'Rack-G', remarks: '' },
  ],
  mixers: [
    { sku: 'MIX-001', name: 'Butterfly Mixer Grinder 500W', subcategory: 'Mixer Grinder', brand: 'Butterfly', description: '3 jars — wet, dry & chutney', unit: 'Piece', costPrice: 1540, price: 2200, stockQty: 10, available: true, purchaseDate: '2025-01-15', location: 'Rack-H', remarks: '', imageUrl: 'https://placehold.co/400x300/FFCCBC/BF360C?text=Butterfly+Mixer+500W' },
    { sku: 'MIX-002', name: 'Preethi Blue Leaf 750W', subcategory: 'Mixer Grinder', brand: 'Preethi', description: 'Heavy duty mixer grinder, 3 jars', unit: 'Piece', costPrice: 2660, price: 3800, stockQty: 7, available: true, purchaseDate: '2025-01-15', location: 'Rack-H', remarks: '', imageUrl: 'https://placehold.co/400x300/FFCCBC/BF360C?text=Preethi+750W+Mixer' },
    { sku: 'MIX-003', name: 'Bajaj Rex 500W', subcategory: 'Mixer Grinder', brand: 'Bajaj', description: 'Compact mixer with stainless jars', unit: 'Piece', costPrice: 1330, price: 1900, stockQty: 0, available: false, purchaseDate: '2025-02-10', location: 'Rack-H', remarks: 'Out of stock' },
    { sku: 'MIX-004', name: 'Elgi Ultra Wet Grinder 2L', subcategory: 'Wet Grinder', brand: 'Elgi Ultra', description: 'Table top wet grinder, 150W', unit: 'Piece', costPrice: 3850, price: 5500, stockQty: 4, available: true, purchaseDate: '2025-02-10', location: 'Rack-H', remarks: '' },
    { sku: 'MIX-005', name: 'Philips Dry Iron 1000W', subcategory: 'Iron Box', brand: 'Philips', description: 'Lightweight dry iron, non-stick sole', unit: 'Piece', costPrice: 406, price: 580, stockQty: 15, available: true, purchaseDate: '2025-03-05', location: 'Rack-H', remarks: '' },
    { sku: 'MIX-006', name: 'Bajaj Steam Iron 1200W', subcategory: 'Iron Box', brand: 'Bajaj', description: 'Steam iron with anti-drip feature', unit: 'Piece', costPrice: 595, price: 850, stockQty: 12, available: true, purchaseDate: '2025-04-20', location: 'Rack-H', remarks: '' },
    { sku: 'MIX-007', name: 'Prestige Induction Cooker 1600W', subcategory: 'Induction Cooker', brand: 'Prestige', description: 'Induction cooktop, 7 preset menus', unit: 'Piece', costPrice: 1680, price: 2400, stockQty: 6, available: true, purchaseDate: '2025-05-12', location: 'Rack-H', remarks: '' },
  ],
  'drill-bits': [
    { sku: 'DRL-001', name: 'Bosch HSS Drill Bit 3mm', subcategory: 'Metal / HSS Bits', brand: 'Bosch', description: 'High speed steel, for metal & wood', unit: 'Piece', costPrice: 25, price: 35, stockQty: 30, available: true, purchaseDate: '2025-01-15', location: 'Shelf-8', remarks: '', imageUrl: 'https://placehold.co/400x300/D7CCC8/4E342E?text=Bosch+HSS+3mm' },
    { sku: 'DRL-002', name: 'Bosch HSS Drill Bit 6mm', subcategory: 'Metal / HSS Bits', brand: 'Bosch', description: 'High speed steel drill bit', unit: 'Piece', costPrice: 38, price: 55, stockQty: 25, available: true, purchaseDate: '2025-01-15', location: 'Shelf-8', remarks: '', imageUrl: 'https://placehold.co/400x300/D7CCC8/4E342E?text=Bosch+HSS+6mm' },
    { sku: 'DRL-003', name: 'Stanley Masonry Bit 6mm', subcategory: 'Masonry Bits', brand: 'Stanley', description: 'Carbide-tipped masonry drill bit', unit: 'Piece', costPrice: 32, price: 45, stockQty: 20, available: true, purchaseDate: '2025-02-10', location: 'Shelf-8', remarks: '' },
    { sku: 'DRL-004', name: 'Stanley Masonry Bit 10mm', subcategory: 'Masonry Bits', brand: 'Stanley', description: 'Carbide-tipped masonry drill bit', unit: 'Piece', costPrice: 45, price: 65, stockQty: 18, available: true, purchaseDate: '2025-02-10', location: 'Shelf-8', remarks: '' },
    { sku: 'DRL-005', name: 'Taparia Wood Spade Bit 10mm', subcategory: 'Wood Bits', brand: 'Taparia', description: 'Sharp spade wood boring bit', unit: 'Piece', costPrice: 38, price: 55, stockQty: 15, available: true, purchaseDate: '2025-03-05', location: 'Shelf-9', remarks: '' },
    { sku: 'DRL-006', name: 'Bosch Wood Bit 12mm', subcategory: 'Wood Bits', brand: 'Bosch', description: 'Brad-point wood drill bit', unit: 'Piece', costPrice: 52, price: 75, stockQty: 12, available: true, purchaseDate: '2025-03-05', location: 'Shelf-9', remarks: '' },
    { sku: 'DRL-007', name: 'Bosch Tile Drill Bit 6mm', subcategory: 'Tile Bits', brand: 'Bosch', description: 'Diamond-tipped tile drill bit', unit: 'Piece', costPrice: 84, price: 120, stockQty: 10, available: true, purchaseDate: '2025-04-20', location: 'Shelf-9', remarks: '' },
    { sku: 'DRL-008', name: 'Stanley Masonry Set 5–13mm', subcategory: 'Drill Sets', brand: 'Stanley', description: '5-piece carbide masonry drill set', unit: 'Set', costPrice: 154, price: 220, stockQty: 8, available: true, purchaseDate: '2025-04-20', location: 'Shelf-9', remarks: '' },
    { sku: 'DRL-009', name: 'Bosch HSS Set 1–10mm', subcategory: 'Drill Sets', brand: 'Bosch', description: '10-piece HSS drill bit set with case', unit: 'Set', costPrice: 336, price: 480, stockQty: 5, available: true, purchaseDate: '2025-05-12', location: 'Shelf-9', remarks: '' },
  ],
  'dc-motors': [
    { sku: 'DCM-001', name: 'DC Motor 3V 100mA', subcategory: '3V Motors', brand: 'Generic', description: 'Small DC motor for hobby projects', unit: 'Piece', costPrice: 32, price: 45, stockQty: 30, available: true, purchaseDate: '2025-01-15', location: 'Shelf-10', remarks: '', imageUrl: 'https://placehold.co/400x300/B2DFDB/00695C?text=DC+Motor+3V+100mA' },
    { sku: 'DCM-002', name: 'DC Motor 3V 200mA (High Torque)', subcategory: '3V Motors', brand: 'Generic', description: '3V high-torque DC motor', unit: 'Piece', costPrice: 45, price: 65, stockQty: 25, available: true, purchaseDate: '2025-01-15', location: 'Shelf-10', remarks: '', imageUrl: 'https://placehold.co/400x300/B2DFDB/00695C?text=DC+Motor+3V+200mA' },
    { sku: 'DCM-003', name: 'DC Motor 6V 200mA', subcategory: '6V Motors', brand: 'Generic', description: '6V motor with 3mm round shaft', unit: 'Piece', costPrice: 52, price: 75, stockQty: 20, available: true, purchaseDate: '2025-02-10', location: 'Shelf-10', remarks: '' },
    { sku: 'DCM-004', name: 'DC Motor 9V 150mA', subcategory: '9V Motors', brand: 'Generic', description: '9V DC motor, ideal for school projects', unit: 'Piece', costPrice: 45, price: 65, stockQty: 18, available: true, purchaseDate: '2025-02-10', location: 'Shelf-10', remarks: '' },
    { sku: 'DCM-005', name: 'DC Motor 12V 300mA', subcategory: '12V Motors', brand: 'Generic', description: '12V DC motor, 5mm shaft', unit: 'Piece', costPrice: 84, price: 120, stockQty: 15, available: true, purchaseDate: '2025-03-05', location: 'Shelf-10', remarks: '' },
    { sku: 'DCM-006', name: 'Gear Motor 12V 60 RPM', subcategory: 'Gear Motors', brand: 'Generic', description: '12V gear-reduced DC motor', unit: 'Piece', costPrice: 154, price: 220, stockQty: 10, available: true, purchaseDate: '2025-04-20', location: 'Shelf-10', remarks: '' },
    { sku: 'DCM-007', name: 'Gear Motor 12V 120 RPM', subcategory: 'Gear Motors', brand: 'Generic', description: '12V gear motor, dual shaft', unit: 'Piece', costPrice: 196, price: 280, stockQty: 8, available: true, purchaseDate: '2025-05-12', location: 'Shelf-10', remarks: '' },
  ],
  'small-fans': [
    { sku: 'SFN-001', name: 'USB Mini Desk Fan 5V', subcategory: 'USB Fan', brand: 'Generic', description: 'Compact fan, USB powered', unit: 'Piece', costPrice: 196, price: 280, stockQty: 20, available: true, purchaseDate: '2025-01-15', location: 'Shelf-11', remarks: '', imageUrl: 'https://placehold.co/400x300/BBDEFB/0D47A1?text=USB+Mini+Fan+5V' },
    { sku: 'SFN-002', name: 'USB Fan 5V Flexible Neck', subcategory: 'USB Fan', brand: 'Generic', description: 'Flexible gooseneck USB desk fan', unit: 'Piece', costPrice: 245, price: 350, stockQty: 15, available: true, purchaseDate: '2025-01-15', location: 'Shelf-11', remarks: '', imageUrl: 'https://placehold.co/400x300/BBDEFB/0D47A1?text=USB+Flexible+Fan' },
    { sku: 'SFN-003', name: '12V DC Blower Fan 60mm', subcategory: 'DC Blower', brand: 'Generic', description: 'Radial blower for electronic cooling', unit: 'Piece', costPrice: 105, price: 150, stockQty: 12, available: true, purchaseDate: '2025-02-10', location: 'Shelf-11', remarks: '' },
    { sku: 'SFN-004', name: '12V DC Blower Fan 80mm', subcategory: 'DC Blower', brand: 'Generic', description: 'High-airflow radial blower', unit: 'Piece', costPrice: 140, price: 200, stockQty: 10, available: true, purchaseDate: '2025-02-10', location: 'Shelf-11', remarks: '' },
    { sku: 'SFN-005', name: '5V Axial Fan 80mm', subcategory: 'DC Axial Fan', brand: 'Generic', description: 'PC cabinet cooling fan', unit: 'Piece', costPrice: 154, price: 220, stockQty: 8, available: true, purchaseDate: '2025-03-05', location: 'Shelf-11', remarks: '' },
    { sku: 'SFN-006', name: '12V Brushless Fan 120mm', subcategory: 'Cooling Fan', brand: 'Generic', description: 'Silent high-airflow cooling fan', unit: 'Piece', costPrice: 245, price: 350, stockQty: 0, available: false, purchaseDate: '2025-04-20', location: 'Shelf-11', remarks: 'Out of stock' },
  ],
  'kids-science': [
    { sku: 'KID-001', name: 'Solar Energy Experiment Kit', subcategory: 'Solar Kits', brand: 'Generic', description: 'Build solar-powered toys & learn', unit: 'Kit', costPrice: 245, price: 350, stockQty: 15, available: true, purchaseDate: '2025-01-15', location: 'Shelf-12', remarks: '', imageUrl: 'https://placehold.co/400x300/E1BEE7/6A1B9A?text=Solar+Experiment+Kit' },
    { sku: 'KID-002', name: 'Solar Powered Car Kit', subcategory: 'Solar Kits', brand: 'Generic', description: 'DIY solar car building kit for kids', unit: 'Kit', costPrice: 196, price: 280, stockQty: 12, available: true, purchaseDate: '2025-01-15', location: 'Shelf-12', remarks: '', imageUrl: 'https://placehold.co/400x300/E1BEE7/6A1B9A?text=Solar+Car+Kit' },
    { sku: 'KID-003', name: 'Basic Electronics Kit 200pc', subcategory: 'Electronics Kits', brand: 'Generic', description: 'Resistors, LEDs, capacitors & more', unit: 'Kit', costPrice: 385, price: 550, stockQty: 10, available: true, purchaseDate: '2025-02-10', location: 'Shelf-12', remarks: '' },
    { sku: 'KID-004', name: 'Breadboard Starter Kit', subcategory: 'Electronics Kits', brand: 'Generic', description: 'Breadboard + jumper wires + components', unit: 'Kit', costPrice: 245, price: 350, stockQty: 18, available: true, purchaseDate: '2025-02-10', location: 'Shelf-12', remarks: '' },
    { sku: 'KID-005', name: 'DIY Robotic Arm Kit', subcategory: 'Robotics', brand: 'Generic', description: 'Build and control your own robot arm', unit: 'Kit', costPrice: 595, price: 850, stockQty: 6, available: true, purchaseDate: '2025-03-05', location: 'Shelf-12', remarks: '' },
    { sku: 'KID-006', name: 'Line Following Robot Kit', subcategory: 'Robotics', brand: 'Generic', description: 'Sensor-based line follower robot', unit: 'Kit', costPrice: 455, price: 650, stockQty: 8, available: true, purchaseDate: '2025-04-20', location: 'Shelf-12', remarks: '' },
    { sku: 'KID-007', name: 'Circuit Learning Kit 50-in-1', subcategory: 'Circuit Kits', brand: 'Generic', description: '50 circuit experiments for beginners', unit: 'Kit', costPrice: 315, price: 450, stockQty: 0, available: false, purchaseDate: '2025-04-20', location: 'Shelf-12', remarks: 'Out of stock' },
    { sku: 'KID-008', name: 'DC Motor Experiment Kit', subcategory: 'Motor Kits', brand: 'Generic', description: 'Assorted motors with project guide', unit: 'Kit', costPrice: 266, price: 380, stockQty: 9, available: true, purchaseDate: '2025-05-12', location: 'Shelf-12', remarks: '' },
  ],
};

@Injectable({ providedIn: 'root' })
export class SheetsService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Observable<Product[]>>();

  getProducts(categoryId: string): Observable<Product[]> {
    if (SPREADSHEET_ID === 'CONFIGURE_YOUR_SPREADSHEET_ID') {
      return of(SAMPLE_PRODUCTS[categoryId] ?? []);
    }

    const cached = this.cache.get(categoryId);
    if (cached) return cached;

    const category = CATEGORIES.find(c => c.id === categoryId);
    if (!category) {
      return of([]);
    }

    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(category.sheetName)}`;

    const result$ = this.http.get(url, { responseType: 'text' }).pipe(
      map(csv => this.parseCsv(csv)),
      catchError(() => of(SAMPLE_PRODUCTS[categoryId] ?? [])),
      shareReplay(1),
    );
    this.cache.set(categoryId, result$);
    return result$;
  }

  private parseCsv(csv: string): Product[] {
    const lines = csv.trim().split('\n').filter(l => l.trim().length > 0);
    if (lines.length <= 1) return [];

    const headers = this.parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());

    return lines
      .slice(1)
      .map(line => {
        const values = this.parseCsvLine(line);
        const row: Record<string, string> = {};
        headers.forEach((header, i) => {
          row[header] = (values[i] ?? '').trim();
        });

        return {
          sku: row['sku'] || undefined,
          name: (row['product_name'] || row['name']) ?? '',
          subcategory: row['subcategory'] || row['sub category'] || row['sub-category'] || undefined,
          brand: row['brand'] || row['brandname'] || row['brand name'] || undefined,
          description: row['description'] ?? '',
          unit: row['unit'] || 'Piece',
          costPrice: (() => {
            const raw = row['cost_price'] || row['costprice'] || row['cost price'];
            return raw ? parseFloat(raw) : undefined;
          })(),
          price: (() => {
            const raw = row['selling_price'] || row['sellingprice'] || row['price'];
            return raw ? parseFloat(raw) : undefined;
          })(),
          discountedPrice: (() => {
            const raw = row['discounted_price'] || row['discountedprice'] || row['discounted price'] || row['offer price'] || row['offerprice'];
            return raw ? parseFloat(raw) : undefined;
          })(),
          stockQty: (() => {
            const raw = row['stock_qty'] || row['stockqty'] || row['stock qty'] || row['stock'];
            return raw ? parseInt(raw, 10) : undefined;
          })(),
          available: !['false', 'no', '0', 'n'].includes((row['availability'] || row['available'] || 'true').toLowerCase()),
          purchaseDate: row['purchase_date'] || row['purchasedate'] || undefined,
          location: row['location'] || undefined,
          remarks: row['remarks'] || undefined,
          imageUrl: row['imageurl'] || row['image_url'] || row['image url'] || undefined,
        };
      })
      .filter(p => p.name.length > 0);
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }
}
