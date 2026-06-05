export interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  sheetName: string;
  color: string;
  subcategories: readonly string[];
}

export const CATEGORIES: readonly Category[] = [
  {
    id: 'fans',
    name: 'Fans',
    description: 'Ceiling, table & exhaust fans',
    icon: '🌀',
    sheetName: 'Fans',
    color: '#B3E5FC',
    subcategories: ['Ceiling Fan', 'Pedestal Fan', 'Table Fan', 'AP Fan', 'Exhaust Fan', 'Wall Fan'],
  },
  {
    id: 'lights',
    name: 'Lights',
    description: 'LED, tube lights & lighting solutions',
    icon: '💡',
    sheetName: 'Lights',
    color: '#FFF9C4',
    subcategories: ['LED Bulb', 'LED Tube Light', 'Downlight', 'Panel Light', 'Flood Light', 'Street Light', 'Decorative Light'],
  },
  {
    id: 'wires',
    name: 'Wires & Cables',
    description: 'All electrical wires and cables',
    icon: '🔌',
    sheetName: 'Wires',
    color: '#FFCDD2',
    subcategories: ['FR Wire', 'FR-LSH Wire', 'Flexible Wire', 'Armoured Cable', 'Coaxial Cable', 'Telephone Cable'],
  },
  {
    id: 'modular',
    name: 'Modular Accessories',
    description: 'Modular switches, sockets & plates',
    icon: '🎛️',
    sheetName: 'Modular',
    color: '#CFD8DC',
    subcategories: ['Switches', 'Sockets', 'Plates & Frames', 'Bells & Buzzers', 'TV & Data Points', 'Dimmers'],
  },
  {
    id: 'non-modular',
    name: 'Non-Modular',
    description: 'Traditional switches & accessories',
    icon: '🪛',
    sheetName: 'NonModular',
    color: '#ECEFF1',
    subcategories: ['Switches', 'Sockets', 'Junction Boxes', 'Conduit', 'Tape & Connectors'],
  },
  {
    id: 'fitting',
    name: 'Fitting Items',
    description: 'MCBs, distribution boxes & fittings',
    icon: '⚡',
    sheetName: 'FittingItems',
    color: '#FFF3E0',
    subcategories: ['MCB', 'RCCB / ELCB', 'Distribution Board', 'Surface Boxes', 'Cable Clips & Ties', 'Conduit Fittings'],
  },
  {
    id: 'mixers',
    name: 'Mixers & Appliances',
    description: 'Kitchen mixers & small appliances',
    icon: '🥣',
    sheetName: 'Mixers',
    color: '#FFCCBC',
    subcategories: ['Mixer Grinder', 'Wet Grinder', 'Iron Box', 'Induction Cooker', 'Other Appliances'],
  },
  {
    id: 'drill-bits',
    name: 'Drill Bits',
    description: 'All sizes — wood, masonry & metal',
    icon: '⛏️',
    sheetName: 'DrillBits',
    color: '#D7CCC8',
    subcategories: ['Wood Bits', 'Masonry Bits', 'Metal / HSS Bits', 'Tile Bits', 'Drill Sets'],
  },
  {
    id: 'dc-motors',
    name: 'DC Motors',
    description: 'Small DC motors for every need',
    icon: '🔄',
    sheetName: 'DCMotors',
    color: '#B2DFDB',
    subcategories: ['3V Motors', '6V Motors', '9V Motors', '12V Motors', 'Gear Motors'],
  },
  {
    id: 'small-fans',
    name: 'Small Fans',
    description: 'Mini fans & cooling accessories',
    icon: '💨',
    sheetName: 'SmallFans',
    color: '#BBDEFB',
    subcategories: ['USB Fan', 'DC Axial Fan', 'DC Blower', 'Cooling Fan'],
  },
  {
    id: 'kids-science',
    name: 'Kids Science',
    description: 'Educational science kits & components',
    icon: '🔬',
    sheetName: 'KidsScience',
    color: '#E1BEE7',
    subcategories: ['Solar Kits', 'Electronics Kits', 'Robotics', 'Circuit Kits', 'Motor Kits'],
  },
] as const;

export const getCategoryById = (id: string): Category | undefined =>
  CATEGORIES.find(c => c.id === id);
