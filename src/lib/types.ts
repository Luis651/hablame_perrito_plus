
export type Role = 'ADMIN' | 'CASHIER' | 'WAITER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export type LocationType = 'WAREHOUSE' | 'BRANCH';

export interface Location {
  id: string;
  name: string;
  type: LocationType;
}

export interface RecipeSubItem {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit?: string;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  category?: string;
  isSubInsumo?: boolean;
  yieldQty?: number;
  recipe?: RecipeSubItem[];
}

export interface InventoryItem {
  id: string;
  locationId: string;
  ingredientId: string;
  quantity: number;
  lastUpdatedAt?: any;
}

export interface ProductRecipeItem {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
}

export interface Product {
  id: string;
  name: string;
  masterPriceUSD: number;
  description?: string;
  sku?: string;
  isCombo?: boolean;
  comboItems?: {
    productId: string;
    productName: string;
    quantity: number;
  }[];
  recipe?: ProductRecipeItem[];
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceUSD: number;
  subtotalUSD: number;
  notes?: string;
}

export interface Payment {
  id: string;
  orderId: string;
  amountUSD: number;
  amountBS: number;
  exchangeRateAtPayment: number;
  paymentMethod: string;
  paymentDate: any;
  cashierId: string;
}

export type OrderStatus = 'OPEN' | 'PAID';

export interface Order {
  id: string;
  orderNumber: string;
  customerNotes: string;
  tableNumber: string;
  status: OrderStatus;
  totalUSD: number;
  totalPaidUSD: number;
  pendingBalanceUSD: number;
  createdAt: string;
  archived: boolean;
  locationId?: string;
  orderDate?: any;
}

export interface Config {
  exchangeRate: number;
  lastUpdated: string;
}

export type WasteReason = 'EXPIRATION' | 'DAMAGE' | 'COOKING_MISTAKE' | 'COUNT_ADJUSTMENT' | 'OTHER';

export interface WasteLog {
  id: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  locationId: string;
  reason: WasteReason;
  notes?: string;
  registeredBy: string;
  registeredByName?: string;
  createdAt: any;
}
