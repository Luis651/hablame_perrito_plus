import { Product, ComboSlotConfig } from './types';

export interface PlanchaSummaryItem {
  key: string;
  foodName: string;
  totalQuantity: number;
  fromCombosQuantity: number;
  fromSinglesQuantity: number;
}

export interface GenericOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  isCombo?: boolean;
  comboItems?: {
    productId: string;
    productName: string;
    quantity: number;
  }[];
  comboSlots?: ComboSlotConfig[];
}

/**
 * Normaliza el nombre de la comida para agrupar (ej: 'Perro Caliente Especial' -> 'Perros Calientes', 'Hamburguesa Clásica' -> 'Hamburguesas')
 */
export function normalizeFoodCategory(productName: string): string {
  const lower = productName.toLowerCase().trim();
  if (lower.includes('perro') || lower.includes('hot dog') || lower.includes('dog')) {
    return 'Perros Calientes';
  }
  if (lower.includes('hamburguesa') || lower.includes('burger')) {
    return 'Hamburguesas';
  }
  if (lower.includes('pepito')) {
    return 'Pepitos';
  }
  if (lower.includes('salchipapa') || lower.includes('papas') || lower.includes('patata')) {
    return 'Papas / Salchipapas';
  }
  if (lower.includes('refresco') || lower.includes('coca') || lower.includes('frescolita') || lower.includes('chinotto') || lower.includes('bebida') || lower.includes('jugo') || lower.includes('té')) {
    return 'Bebidas';
  }
  return productName;
}

/**
 * Calcula el resumen agregado de producción de plancha/cocina
 */
export function calculatePlanchaSummary(
  orderItems: GenericOrderItem[],
  productsList?: Product[]
): PlanchaSummaryItem[] {
  if (!orderItems || orderItems.length === 0) return [];

  const summaryMap = new Map<string, PlanchaSummaryItem>();

  const getOrCreate = (category: string) => {
    if (!summaryMap.has(category)) {
      summaryMap.set(category, {
        key: category.toLowerCase().replace(/\s+/g, '-'),
        foodName: category,
        totalQuantity: 0,
        fromCombosQuantity: 0,
        fromSinglesQuantity: 0
      });
    }
    return summaryMap.get(category)!;
  };

  for (const item of orderItems) {
    const qty = item.quantity || 1;

    if (item.isCombo) {
      if (item.comboSlots && item.comboSlots.length > 0) {
        // Recorrer slots configurados
        for (const slot of item.comboSlots) {
          const cat = normalizeFoodCategory(slot.productName || 'Producto');
          const entry = getOrCreate(cat);
          entry.totalQuantity += 1;
          entry.fromCombosQuantity += 1;
        }
      } else if (item.comboItems && item.comboItems.length > 0) {
        // Recorrer comboItems por defecto
        for (const cItem of item.comboItems) {
          const cat = normalizeFoodCategory(cItem.productName || 'Producto');
          const count = (cItem.quantity || 1) * qty;
          const entry = getOrCreate(cat);
          entry.totalQuantity += count;
          entry.fromCombosQuantity += count;
        }
      }
    } else {
      // Producto individual / suelto
      const cat = normalizeFoodCategory(item.productName || 'Producto');
      const entry = getOrCreate(cat);
      entry.totalQuantity += qty;
      entry.fromSinglesQuantity += qty;
    }
  }

  return Array.from(summaryMap.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
}
