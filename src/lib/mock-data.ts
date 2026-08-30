
import { Location, Product, Config, Ingredient, InventoryItem } from './types';

export const MOCK_LOCATIONS: Location[] = [
  { id: 'wh-1', name: 'Depósito Central', type: 'WAREHOUSE' },
  { id: 'br-1', name: 'Sucursal CIMA', type: 'BRANCH' },
  { id: 'br-2', name: 'Sucursal TRAGO SPREXX', type: 'BRANCH' },
];

export const MOCK_INGREDIENTS: Ingredient[] = [
  // Materia Prima Directa (Depósito)
  { id: 'ing-raw-1', name: 'Carne Molida de Res Premium', unit: 'kg', category: 'Carnes en Bruto' },
  { id: 'ing-raw-2', name: 'Mix de Especias y Sal Secreta HP', unit: 'kg', category: 'Condimentos' },
  { id: 'ing-raw-3', name: 'Mayonesa Base Emulsión', unit: 'kg', category: 'Salsas Base' },
  { id: 'ing-raw-4', name: 'Mostaza Dijon y Ketchup Especial', unit: 'kg', category: 'Salsas Base' },
  { id: 'ing-raw-5', name: 'Cebolla Morada en Saco', unit: 'kg', category: 'Vegetales' },

  // Sub-Insumos / Preparados Elaborados
  { 
    id: 'ing-2', 
    name: 'Carne de Res Preparada (150g)', 
    unit: 'unidades', 
    category: 'Preparados Cocina',
    isSubInsumo: true,
    yieldQty: 10,
    recipe: [
      { ingredientId: 'ing-raw-1', ingredientName: 'Carne Molida de Res Premium', quantity: 1.5, unit: 'kg' },
      { ingredientId: 'ing-raw-2', ingredientName: 'Mix de Especias y Sal Secreta HP', quantity: 0.05, unit: 'kg' }
    ]
  },
  { 
    id: 'ing-8', 
    name: 'Salsa Especial HP de la Casa', 
    unit: 'litros', 
    category: 'Salsas',
    isSubInsumo: true,
    yieldQty: 1,
    recipe: [
      { ingredientId: 'ing-raw-3', ingredientName: 'Mayonesa Base Emulsión', quantity: 0.55, unit: 'kg' },
      { ingredientId: 'ing-raw-4', ingredientName: 'Mostaza Dijon y Ketchup Especial', quantity: 0.40, unit: 'kg' },
      { ingredientId: 'ing-raw-2', ingredientName: 'Mix de Especias y Sal Secreta HP', quantity: 0.02, unit: 'kg' }
    ]
  },
  { 
    id: 'ing-7', 
    name: 'Cebolla Caramelizada', 
    unit: 'kg', 
    category: 'Preparados Cocina',
    isSubInsumo: true,
    yieldQty: 1,
    recipe: [
      { ingredientId: 'ing-raw-5', ingredientName: 'Cebolla Morada en Saco', quantity: 1.6, unit: 'kg' }
    ]
  },

  // Insumos Base de Ensamblado en Línea
  { id: 'ing-1', name: 'Pan Brioche de Hamburguesa', unit: 'unidades', category: 'Panadería' },
  { id: 'ing-1b', name: 'Pan de Perro Caliente Brioche', unit: 'unidades', category: 'Panadería' },
  { id: 'ing-3', name: 'Queso Cheddar Americano (Fetas)', unit: 'unidades', category: 'Lácteos' },
  { id: 'ing-4', name: 'Lechuga Fresca Hidropónica', unit: 'kg', category: 'Vegetales' },
  { id: 'ing-5', name: 'Papas Prefritas Corte Bastón', unit: 'kg', category: 'Congelados' },
  { id: 'ing-6', name: 'Tomate Manzana Rebanado', unit: 'kg', category: 'Vegetales' },
  { id: 'ing-9', name: 'Salchicha Alemana Jumbo', unit: 'unidades', category: 'Embutidos' },
  { id: 'ing-10', name: 'Tocino Ahumado Rebanado', unit: 'kg', category: 'Carnes' },
  { id: 'ing-11', name: 'Refresco Cola 355ml (Lata)', unit: 'unidades', category: 'Bebidas' },
  { id: 'ing-12', name: 'Agua Mineral 500ml', unit: 'unidades', category: 'Bebidas' },
];

export const MOCK_PRODUCTS: Product[] = [
  { 
    id: 'p-1', 
    name: 'Hamburguesa Clásica Perrito', 
    masterPriceUSD: 6.50, 
    description: 'Carne 150g, queso cheddar, vegetales frescos y salsa especial en pan brioche.',
    sku: 'H-CLA-01',
    isCombo: false,
    recipe: [
      { ingredientId: 'ing-1', ingredientName: 'Pan Brioche de Hamburguesa', quantity: 1 },
      { ingredientId: 'ing-2', ingredientName: 'Carne de Res Preparada (150g)', quantity: 1 },
      { ingredientId: 'ing-3', ingredientName: 'Queso Cheddar Americano (Fetas)', quantity: 1 },
      { ingredientId: 'ing-4', ingredientName: 'Lechuga Fresca Hidropónica', quantity: 0.03 },
      { ingredientId: 'ing-6', ingredientName: 'Tomate Manzana Rebanado', quantity: 0.03 },
      { ingredientId: 'ing-8', ingredientName: 'Salsa Especial HP de la Casa', quantity: 0.02 }
    ]
  },
  { 
    id: 'p-2', 
    name: 'Doble Bacon Boss', 
    masterPriceUSD: 9.50, 
    description: 'Doble carne 150g, doble queso, extra tocino crocante y salsa especial.',
    sku: 'H-DBL-02',
    isCombo: false,
    recipe: [
      { ingredientId: 'ing-1', ingredientName: 'Pan Brioche de Hamburguesa', quantity: 1 },
      { ingredientId: 'ing-2', ingredientName: 'Carne de Res Preparada (150g)', quantity: 2 },
      { ingredientId: 'ing-3', ingredientName: 'Queso Cheddar Americano (Fetas)', quantity: 2 },
      { ingredientId: 'ing-10', ingredientName: 'Tocino Ahumado Rebanado', quantity: 0.05 },
      { ingredientId: 'ing-8', ingredientName: 'Salsa Especial HP de la Casa', quantity: 0.03 }
    ]
  },
  { 
    id: 'p-3', 
    name: 'Super Perro Caliente HP', 
    masterPriceUSD: 4.50, 
    description: 'Salchicha alemana jumbo, cebolla caramelizada, papitas y salsa especial.',
    sku: 'P-SUP-01',
    isCombo: false,
    recipe: [
      { ingredientId: 'ing-1b', ingredientName: 'Pan de Perro Caliente Brioche', quantity: 1 },
      { ingredientId: 'ing-9', ingredientName: 'Salchicha Alemana Jumbo', quantity: 1 },
      { ingredientId: 'ing-7', ingredientName: 'Cebolla Caramelizada', quantity: 0.02 },
      { ingredientId: 'ing-8', ingredientName: 'Salsa Especial HP de la Casa', quantity: 0.02 }
    ]
  },
  { 
    id: 'p-4', 
    name: 'Porción de Papas Fritas', 
    masterPriceUSD: 2.50, 
    description: 'Papas fritas corte bastón crocantes con sal marina.',
    sku: 'S-PAP-01',
    isCombo: false,
    recipe: [{ ingredientId: 'ing-5', ingredientName: 'Papas Prefritas Corte Bastón', quantity: 0.15 }]
  },
  { 
    id: 'p-5', 
    name: 'Refresco en Lata 355ml', 
    masterPriceUSD: 1.50, 
    description: 'Lata fría 355ml sabores surtidos.',
    sku: 'B-REF-01',
    isCombo: false,
    recipe: [{ ingredientId: 'ing-11', ingredientName: 'Refresco Cola 355ml (Lata)', quantity: 1 }]
  },
  {
    id: 'c-1',
    name: 'Combo Parrandero (Clásica + Papas + Refresco)',
    masterPriceUSD: 9.50,
    description: '1 Clásica Perrito + 1 Porción de Papas Fritas + 1 Refresco (Ahorro $1.00)',
    sku: 'C-PAR-01',
    isCombo: true,
    comboItems: [
      { productId: 'p-1', productName: 'Hamburguesa Clásica Perrito', quantity: 1 },
      { productId: 'p-4', productName: 'Porción de Papas Fritas', quantity: 1 },
      { productId: 'p-5', productName: 'Refresco en Lata 355ml', quantity: 1 }
    ]
  },
  {
    id: 'c-2',
    name: 'Combo Doble Boss (Doble Carne + Papas + Refresco)',
    masterPriceUSD: 12.50,
    description: '1 Doble Bacon Boss + 1 Porción de Papas Fritas + 1 Refresco (Ahorro $1.00)',
    sku: 'C-DBL-02',
    isCombo: true,
    comboItems: [
      { productId: 'p-2', productName: 'Doble Bacon Boss', quantity: 1 },
      { productId: 'p-4', productName: 'Porción de Papas Fritas', quantity: 1 },
      { productId: 'p-5', productName: 'Refresco en Lata 355ml', quantity: 1 }
    ]
  }
];

export const MOCK_INVENTORY_SEED: Partial<InventoryItem>[] = [
  { ingredientId: 'ing-1', quantity: 60 }, 
  { ingredientId: 'ing-1b', quantity: 45 }, 
  { ingredientId: 'ing-2', quantity: 50 }, 
  { ingredientId: 'ing-3', quantity: 80 }, 
  { ingredientId: 'ing-4', quantity: 4.5 },   
  { ingredientId: 'ing-5', quantity: 15 },  
  { ingredientId: 'ing-6', quantity: 4.0 },  
  { ingredientId: 'ing-7', quantity: 3.5 },  
  { ingredientId: 'ing-8', quantity: 5.0 },  
  { ingredientId: 'ing-9', quantity: 40 },  
  { ingredientId: 'ing-10', quantity: 3.0 },  
  { ingredientId: 'ing-11', quantity: 72 }, 
  { ingredientId: 'ing-12', quantity: 48 }, 
];

export const MOCK_CONFIG: Config = {
  exchangeRate: 36.50,
  lastUpdated: new Date().toISOString(),
};
