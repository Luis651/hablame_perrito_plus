import { Firestore, doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Product } from './types';
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
}

/**
 * Desglosa recursivamente los ingredientes necesarios para un conjunto de items de comanda
 * soportando tanto productos individuales como combos compuestos.
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

  const processProduct = (productId: string, multiplier: number) => {
    const product = productsMap.get(productId);
    if (!product) return;

    if (product.isCombo && product.comboItems && product.comboItems.length > 0) {
      for (const comboItem of product.comboItems) {
        processProduct(comboItem.productId, multiplier * (comboItem.quantity || 1));
      }
    } else if (product.recipe && product.recipe.length > 0) {
      for (const recipeItem of product.recipe) {
        addIngredient(
          recipeItem.ingredientId,
          recipeItem.ingredientName,
          (recipeItem.quantity || 0) * multiplier
        );
      }
    }
  };

  for (const item of orderItems) {
    processProduct(item.productId, item.quantity || 1);
  }

  return usageMap;
}

/**
 * Aplica el descuento o ajuste diferencial de stock de forma atómica en Firestore.
 * - Si es una orden nueva: oldItems está vacío y se descuenta todo newItems.
 * - Si es una edición de orden: se calcula el delta neto (new - old) para ajustar con precisión.
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

    // Obtener todos los IDs de ingredientes involucrados
    const allIngredientIds = Array.from(new Set([
      ...Object.keys(oldUsage),
      ...Object.keys(newUsage)
    ]));

    if (allIngredientIds.length === 0) {
      return { success: true, modifiedIngredientsCount: 0 };
    }

    const batch = writeBatch(firestore);
    let modifiedCount = 0;

    for (const ingredientId of allIngredientIds) {
      const oldQty = oldUsage[ingredientId]?.quantity || 0;
      const newQty = newUsage[ingredientId]?.quantity || 0;
      const delta = round4(newQty - oldQty); // delta > 0 significa mayor consumo (descontar)

      if (delta === 0) continue;

      const invRef = doc(firestore, 'locations', locationId, 'inventory', ingredientId);
      const invSnap = await getDoc(invRef);
      const currentAvailable = invSnap.exists() ? (invSnap.data().quantity || 0) : 0;

      // Restamos el delta neto (si delta es negativo, se reintegran insumos automáticamente)
      const updatedQuantity = Math.max(0, round4(currentAvailable - delta));

      batch.set(invRef, {
        id: ingredientId,
        ingredientId: ingredientId,
        locationId: locationId,
        quantity: updatedQuantity,
        lastUpdatedAt: serverTimestamp()
      }, { merge: true });

      modifiedCount++;
    }

    if (modifiedCount > 0) {
      await batch.commit();
    }

    return { success: true, modifiedIngredientsCount: modifiedCount };
  } catch (error: any) {
    console.error('Error applying stock deduction:', error);
    return { success: false, modifiedIngredientsCount: 0, error: error.message || 'Error al actualizar inventario' };
  }
}
