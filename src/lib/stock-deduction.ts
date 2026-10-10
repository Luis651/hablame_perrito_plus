import { Firestore, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Product, ComboSlotConfig } from './types';
import { round4 } from './utils';

export interface IngredientUsage {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
}

export interface SimplifiedOrderItem {
  productId: string;
  quantity: number;
  isCombo?: boolean;
  comboItems?: {
    productId: string;
    productName: string;
    quantity: number;
  }[];
  comboSlots?: ComboSlotConfig[];
  customizations?: {
    ingredientId?: string;
    ingredientName: string;
    intensity: 'sin' | 'poco' | 'normal' | 'extra';
  }[];
}

/**
 * Desglosa recursivamente los ingredientes necesarios para un conjunto de items de comanda
 * soportando tanto productos individuales como combos compuestos, ranuras de combo (comboSlots) y personalizaciones.
 */
export function calculateOrderIngredientUsage(
  orderItems: SimplifiedOrderItem[],
  productsList: Product[]
): Record<string, IngredientUsage> {
  const productsMap = new Map<string, Product>();
  productsList.forEach(p => productsMap.set(p.id, p));

  const usageMap: Record<string, IngredientUsage> = {};

  const addIngredient = (ingredientId: string, ingredientName: string, qty: number) => {
    if (!ingredientId || qty <= 0) return;
    if (!usageMap[ingredientId]) {
      usageMap[ingredientId] = {
        ingredientId,
        ingredientName: ingredientName || 'Insumo',
        quantity: 0
      };
    }
    usageMap[ingredientId].quantity = round4(usageMap[ingredientId].quantity + qty);
  };

  const processProduct = (productId: string, multiplier: number, customizations?: SimplifiedOrderItem['customizations']) => {
    const product = productsMap.get(productId);
    if (!product) return;

    // Crear mapa de personalización por ID o Nombre
    const customMap = new Map<string, 'sin' | 'poco' | 'normal' | 'extra'>();
    if (customizations && customizations.length > 0) {
      customizations.forEach(c => {
        if (c.ingredientId) customMap.set(c.ingredientId, c.intensity);
        if (c.ingredientName) customMap.set(c.ingredientName.toLowerCase().trim(), c.intensity);
      });
    }

    if (product.recipe && product.recipe.length > 0) {
      for (const recipeItem of product.recipe) {
        let intensityFactor = 1.0;
        const customIntensity = 
          customMap.get(recipeItem.ingredientId) || 
          customMap.get(recipeItem.ingredientName.toLowerCase().trim());
        
        if (customIntensity === 'sin') {
          intensityFactor = 0;
        } else if (customIntensity === 'poco') {
          intensityFactor = 0.5;
        } else if (customIntensity === 'extra') {
          intensityFactor = 1.5;
        }

        if (intensityFactor > 0) {
          addIngredient(
            recipeItem.ingredientId,
            recipeItem.ingredientName,
            (recipeItem.quantity || 0) * multiplier * intensityFactor
          );
        }
      }
    }
  };

  for (const item of orderItems) {
    const qty = item.quantity || 1;

    if (item.isCombo) {
      if (item.comboSlots && item.comboSlots.length > 0) {
        // Procesar cada ranura con su personalización específica
        for (const slot of item.comboSlots) {
          processProduct(slot.productId, 1, slot.customizations);
        }
      } else if (item.comboItems && item.comboItems.length > 0) {
        for (const comboItem of item.comboItems) {
          processProduct(comboItem.productId, qty * (comboItem.quantity || 1), item.customizations);
        }
      }
    } else {
      processProduct(item.productId, qty, item.customizations);
    }
  }

  return usageMap;
}

/**
 * Aplica el descuento o ajuste diferencial de stock de forma 100% atómica en Firestore
 * mediante runTransaction, eliminando race conditions entre pedidos concurrentes.
 * - Si es una orden nueva: oldItems está vacío y se descuenta todo newItems.
 * - Si es una edición de orden: se calcula el delta neto (new - old) para ajustar con precisión.
 * - Si es una anulación de orden: newItems está vacío y se reintegran los insumos.
 */
export async function applyStockDeduction(
  firestore: Firestore,
  locationId: string,
  oldItems: SimplifiedOrderItem[],
  newItems: SimplifiedOrderItem[],
  productsList: Product[]
): Promise<{ success: boolean; modifiedIngredientsCount: number; error?: string }> {
  if (!locationId) return { success: false, modifiedIngredientsCount: 0, error: 'Sede no especificada' };

  try {
    const oldUsage = calculateOrderIngredientUsage(oldItems, productsList);
    const newUsage = calculateOrderIngredientUsage(newItems, productsList);

    // Obtener todos los IDs de ingredientes cuyo consumo neto ha cambiado
    const allIngredientIds = Array.from(new Set([
      ...Object.keys(oldUsage),
      ...Object.keys(newUsage)
    ])).filter(id => {
      const oldQty = oldUsage[id]?.quantity || 0;
      const newQty = newUsage[id]?.quantity || 0;
      return round4(newQty - oldQty) !== 0;
    });

    if (allIngredientIds.length === 0) {
      return { success: true, modifiedIngredientsCount: 0 };
    }

    await runTransaction(firestore, async (transaction) => {
      // 1. Lecturas atómicas de todos los insumos afectados bajo bloqueo optimista
      const docRefs = allIngredientIds.map(id => doc(firestore, 'locations', locationId, 'inventory', id));
      const snaps = await Promise.all(docRefs.map(ref => transaction.get(ref)));

      // 2. Escrituras atómicas dentro de la transacción
      snaps.forEach((snap, idx) => {
        const ingredientId = allIngredientIds[idx];
        const oldQty = oldUsage[ingredientId]?.quantity || 0;
        const newQty = newUsage[ingredientId]?.quantity || 0;
        const delta = round4(newQty - oldQty); // delta > 0: descuento, delta < 0: reintegro

        const currentAvailable = snap.exists() ? (snap.data().quantity || 0) : 0;
        const updatedQuantity = Math.max(0, round4(currentAvailable - delta));

        transaction.set(snap.ref, {
          id: ingredientId,
          ingredientId: ingredientId,
          locationId: locationId,
          quantity: updatedQuantity,
          lastUpdatedAt: serverTimestamp()
        }, { merge: true });
      });
    });

    return { success: true, modifiedIngredientsCount: allIngredientIds.length };
  } catch (error: any) {
    console.error('Error applying stock deduction atomically:', error);
    return { success: false, modifiedIngredientsCount: 0, error: error.message || 'Error al actualizar inventario' };
  }
}
