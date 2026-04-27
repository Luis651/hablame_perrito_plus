
import { Location, Product, Config, Ingredient, InventoryItem } from './types';

export const MOCK_LOCATIONS: Location[] = [
  { id: 'wh-1', name: 'Depósito Central', type: 'WAREHOUSE' },
  { id: 'br-1', name: 'Sucursal CIMA', type: 'BRANCH' },
  { id: 'br-2', name: 'Sucursal TRAGO SPREXX', type: 'BRANCH' },
];

export const MOCK_INGREDIENTS: Ingredient[] = [
  { id: 'ing-1', name: 'Pan de Hamburguesa', unit: 'unidades', category: 'Panadería' },
  { id: 'ing-2', name: 'Carne de Res (150g)', unit: 'unidades', category: 'Carnes' },
  { id: 'ing-3', name: 'Queso Cheddar (Fetas)', unit: 'unidades', category: 'Lácteos' },
  { id: 'ing-4', name: 'Lechuga Picada', unit: 'kg', category: 'Vegetales' },
  { id: 'ing-5', name: 'Papas Prefritas', unit: 'kg', category: 'Congelados' },
  { id: 'ing-6', name: 'Tomate Rebanado', unit: 'kg', category: 'Vegetales' },
  { id: 'ing-7', name: 'Cebolla Picada', unit: 'kg', category: 'Vegetales' },
  { id: 'ing-8', name: 'Salsa Especial HP', unit: 'litros', category: 'Salsas' },
  { id: 'ing-9', name: 'Salchicha Jumbo', unit: 'unidades', category: 'Carnes' },
  { id: 'ing-10', name: 'Tocino Ahumado', unit: 'kg', category: 'Carnes' },
  { id: 'ing-11', name: 'Refresco Cola (Lata)', unit: 'unidades', category: 'Bebidas' },
];

export const MOCK_PRODUCTS: Product[] = [
  { 
    id: 'p-1', 
    name: 'Clásica Perrito', 
    masterPriceUSD: 6.50, 
    description: 'Hamburguesa de res con vegetales frescos y salsa especial.',
    sku: 'H-CLA-01',
    isCombo: false,
    recipe: [
      { ingredientId: 'ing-1', ingredientName: 'Pan de Hamburguesa', quantity: 1 },
      { ingredientId: 'ing-2', ingredientName: 'Carne de Res (150g)', quantity: 1 },
      { ingredientId: 'ing-3', ingredientName: 'Queso Cheddar (Fetas)', quantity: 1 },
      { ingredientId: 'ing-4', ingredientName: 'Lechuga Picada', quantity: 0.03 },
      { ingredientId: 'ing-6', ingredientName: 'Tomate Rebanado', quantity: 0.03 },
      { ingredientId: 'ing-8', ingredientName: 'Salsa Especial HP', quantity: 0.02 }
    ]
  },
  { 
    id: 'p-2', 
    name: 'Doble Bacon Boss', 
    masterPriceUSD: 9.50, 
    description: 'Doble carne, doble queso y extra tocino crocante.',
    sku: 'H-DBL-02',
    isCombo: false,
    recipe: [
      { ingredientId: 'ing-1', ingredientName: 'Pan de Hamburguesa', quantity: 1 },
      { ingredientId: 'ing-2', ingredientName: 'Carne de Res (150g)', quantity: 2 },
      { ingredientId: 'ing-3', ingredientName: 'Queso Cheddar (Fetas)', quantity: 2 },
      { ingredientId: 'ing-10', ingredientName: 'Tocino Ahumado', quantity: 0.05 },
      { ingredientId: 'ing-8', ingredientName: 'Salsa Especial HP', quantity: 0.03 }
    ]
  },
  { 
    id: 'p-3', 
    name: 'Super Perro Caliente', 
    masterPriceUSD: 4.50, 
    description: 'Salchicha jumbo con lluvia de papas y salsas de la casa.',
    sku: 'P-SUP-01',
    isCombo: false,
    recipe: [
      { ingredientId: 'ing-1', ingredientName: 'Pan de Hamburguesa', quantity: 1 },
      { ingredientId: 'ing-9', ingredientName: 'Salchicha Jumbo', quantity: 1 },
      { ingredientId: 'ing-7', ingredientName: 'Cebolla Picada', quantity: 0.01 },
      { ingredientId: 'ing-8', ingredientName: 'Salsa Especial HP', quantity: 0.02 }
    ]
  },
  { 
    id: 'p-4', 
    name: 'Papas Medianas', 
    masterPriceUSD: 2.50, 
    description: 'Papas fritas crocantes con sal.',
    sku: 'S-PAP-01',
    isCombo: false,
    recipe: [{ ingredientId: 'ing-5', ingredientName: 'Papas Prefritas', quantity: 0.15 }]
  },
  {
    id: 'c-1',
    name: 'Combo Parrandero',
    masterPriceUSD: 12.00,
    description: 'Clásica + Papas + Refresco. Ahorro de $1.00',
    sku: 'C-PAR-01',
    isCombo: true,
    comboItems: [
      { productId: 'p-1', productName: 'Clásica Perrito', quantity: 1 },
      { productId: 'p-4', productName: 'Papas Medianas', quantity: 1 }
    ]
  }
];

export const MOCK_INVENTORY_SEED: Partial<InventoryItem>[] = [
  { ingredientId: 'ing-1', quantity: 150 }, 
  { ingredientId: 'ing-2', quantity: 120 }, 
  { ingredientId: 'ing-3', quantity: 100 }, 
  { ingredientId: 'ing-4', quantity: 5 },   
  { ingredientId: 'ing-5', quantity: 20 },  
  { ingredientId: 'ing-8', quantity: 10 },  
  { ingredientId: 'ing-9', quantity: 80 },  
  { ingredientId: 'ing-10', quantity: 2 },  
  { ingredientId: 'ing-11', quantity: 200 }, 
];

export const MOCK_CONFIG: Config = {
  exchangeRate: 36.50,
  lastUpdated: new Date().toISOString(),
};
