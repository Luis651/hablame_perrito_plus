"use client";

import { useState, useEffect, useMemo } from 'react';
import { AppSidebar } from '@/components/layout/Sidebar';
import { OrderCard } from '@/components/orders/OrderCard';
import { Button } from '@/components/ui/button';
import { 
  Plus, 
  Search, 
  Check, 
  X, 
  ShoppingCart, 
  UtensilsCrossed, 
  Minus, 
  DollarSign,
  Pencil,
  Wallet,
  CreditCard,
  Banknote,
  Smartphone,
  History,
  Archive,
  MapPin,
  CircleDollarSign,
  TrendingUp,
  RefreshCw,
  Landmark,
  Ban,
  AlertTriangle,
  Loader2,
  ChefHat,
  BellRing,
  CheckCheck,
  Hourglass,
  Flame,
  LayoutGrid,
  List,
  Clock,
  Unlock,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { KitchenStatus, PaymentStatus, IngredientCustomization, IngredientIntensity, ComboSlotConfig, Product } from '@/lib/types';
import { fetchOfficialRates } from '@/lib/dolar-api';
import { calculatePlanchaSummary, PlanchaSummaryItem } from '@/lib/plancha-summary';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  useCollection, 
  useDoc,
  useFirestore, 
  useMemoFirebase, 
  addDocumentNonBlocking, 
  updateDocumentNonBlocking, 
  setDocumentNonBlocking,
  useUser
} from '@/firebase';
import { collection, doc, query, serverTimestamp, where, writeBatch, getDocs } from 'firebase/firestore';
import { cn, round2, round4, convertBsToUsd, convertUsdToBs, formatUSD, formatBS } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { MOCK_CONFIG, MOCK_LOCATIONS } from '@/lib/mock-data';
import { applyStockDeduction } from '@/lib/stock-deduction';

interface DraftItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceUSD: number;
  subtotalUSD: number;
  notes: string;
  customizations?: IngredientCustomization[];
  isCombo?: boolean;
  comboItems?: any[];
  comboSlots?: ComboSlotConfig[];
}

const PAYMENT_METHODS = [
  { id: 'DIVISAS', label: 'Efectivo ($)', icon: Wallet, defaultCurrency: 'USD' as const },
  { id: 'PAGO_MOVIL', label: 'Pago Móvil (BS)', icon: Smartphone, defaultCurrency: 'BS' as const },
  { id: 'PUNTO', label: 'Punto de Venta (BS)', icon: CreditCard, defaultCurrency: 'BS' as const },
  { id: 'EFECTIVO_BS', label: 'Efectivo (BS)', icon: Banknote, defaultCurrency: 'BS' as const },
  { id: 'TRANSFERENCIA', label: 'Transferencia (BS)', icon: History, defaultCurrency: 'BS' as const },
];

export default function ComandasPage() {
  const firestore = useFirestore();
  const { user, profile, role } = useUser();
  const { toast } = useToast();
  
  const [activeLocationId, setActiveLocationId] = useState<string>("br-1");
  const isAdmin = role === 'ADMIN';

  // Tasa cambiaria en tiempo real
  const configRef = useMemoFirebase(() => doc(firestore, 'config', 'exchangeRate'), [firestore]);
  const { data: exchangeData } = useDoc(configRef);
  const currentExchangeRate = exchangeData?.exchangeRate || MOCK_CONFIG.exchangeRate;

  useEffect(() => {
    if (profile?.locationId) {
      const isBranch = MOCK_LOCATIONS.find(l => l.id === profile.locationId)?.type === 'BRANCH';
      setActiveLocationId(isBranch ? profile.locationId : "br-1");
    }
  }, [profile]);

  const ordersQuery = useMemoFirebase(() => {
    if (!user || !activeLocationId) return null;
    return query(
      collection(firestore, 'locations', activeLocationId, 'orders'), 
      where('archived', '==', false)
    );
  }, [firestore, activeLocationId, user]);
  
  const { data: rawOrders, isLoading: ordersLoading } = useCollection(ordersQuery);
  
  const orders = rawOrders?.sort((a, b) => {
    const getOrderPriority = (order: Order) => {
      if (order.status === 'CANCELLED') return 4; // Últimos siempre al final
      const isPaid = order.status === 'PAID' || (order.pendingBalanceUSD !== undefined && order.pendingBalanceUSD <= 0.005);
      const k = order.kitchenStatus || (isPaid ? 'DELIVERED' : 'PENDING');
      if (k === 'PENDING') return 1;          // 1. En Espera (Prioridad máxima arriba)
      if (k === 'IN_PREPARATION') return 2;  // 2. En Cocina (Punto medio)
      return 3;                               // 3. Entregados / Listos
    };

    const priorityA = getOrderPriority(a);
    const priorityB = getOrderPriority(b);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    const dateA = a.orderDate?.seconds || 0;
    const dateB = b.orderDate?.seconds || 0;
    
    // Para pedidos en espera y cocina, los que llevan más tiempo esperando salen primero (FIFO)
    if (priorityA === 1 || priorityA === 2) {
      return dateA - dateB;
    }
    // Para entregados y cancelados, los más recientes primero
    return dateB - dateA;
  });

  const productsQuery = useMemoFirebase(() => collection(firestore, 'products'), [firestore]);
  const { data: products } = useCollection(productsQuery);

  const inventoryQuery = useMemoFirebase(() => {
    if (!activeLocationId) return null;
    return collection(firestore, 'locations', activeLocationId, 'inventory');
  }, [firestore, activeLocationId]);
  const { data: currentInventory } = useCollection(inventoryQuery);
  const ingredientsQuery = useMemoFirebase(() => collection(firestore, 'ingredients'), [firestore]);
  const { data: allIngredients } = useCollection(ingredientsQuery);

  const [isOrderFormOpen, setIsOrderFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("Error de digitación / Comanda duplicada");
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [isUnblockingOrder, setIsUnblockingOrder] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [mobileOrderTab, setMobileOrderTab] = useState<'menu' | 'cart'>('menu');
  const [kitchenFilter, setKitchenFilter] = useState<'ALL' | KitchenStatus>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [customerName, setCustomerName] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<'ALL' | 'COMBOS' | 'FOOD' | 'DRINKS'>('ALL');
  
  // Estado para Producto Individual
  const [configuringProduct, setConfiguringProduct] = useState<any>(null);
  const [configQuantity, setConfigQuantity] = useState(1);
  const [configNotes, setConfigNotes] = useState("");
  const [configIngredients, setConfigIngredients] = useState<IngredientCustomization[]>([]);

  // Estado para Wizard de Combo
  const [configuringCombo, setConfiguringCombo] = useState<any>(null);
  const [comboSlotsDraft, setComboSlotsDraft] = useState<ComboSlotConfig[]>([]);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [comboNotes, setComboNotes] = useState("");
  const [editingDraftIndex, setEditingDraftIndex] = useState<number | null>(null);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const selectedOrderRef = useMemoFirebase(() => {
    if (!selectedOrderId || !activeLocationId) return null;
    return doc(firestore, 'locations', activeLocationId, 'orders', selectedOrderId);
  }, [firestore, selectedOrderId, activeLocationId]);
  const { data: selectedOrder } = useDoc(selectedOrderRef);

  const selectedOrderItemsQuery = useMemoFirebase(() => {
    if (!selectedOrderId || !activeLocationId) return null;
    return collection(firestore, 'locations', activeLocationId, 'orders', selectedOrderId, 'items');
  }, [firestore, selectedOrderId, activeLocationId]);
  const { data: selectedOrderItems } = useCollection(selectedOrderItemsQuery);

  const selectedOrderPaymentsQuery = useMemoFirebase(() => {
    if (!selectedOrderId || !activeLocationId) return null;
    return collection(firestore, 'locations', activeLocationId, 'orders', selectedOrderId, 'payments');
  }, [firestore, selectedOrderId, activeLocationId]);
  const { data: selectedOrderPayments } = useCollection(selectedOrderPaymentsQuery);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState<"USD" | "BS">("USD");
  const [paymentMethod, setPaymentMethod] = useState("DIVISAS");
  const [paymentPhone, setPaymentPhone] = useState("");
  const [paymentReference, setPaymentReference] = useState("");

  const [isExchangeRateDialogOpen, setIsExchangeRateDialogOpen] = useState(false);
  const [newExchangeRate, setNewExchangeRate] = useState(currentExchangeRate.toString());
  const [isSyncingBcv, setIsSyncingBcv] = useState(false);

  useEffect(() => {
    if (exchangeData?.exchangeRate !== undefined) {
      setNewExchangeRate(exchangeData.exchangeRate.toString());
    }
  }, [exchangeData?.exchangeRate]);

  const handleUpdateKitchenStatus = (orderId: string, newKitchenStatus: KitchenStatus) => {
    if (!orderId || !activeLocationId) return;
    const orderRef = doc(firestore, 'locations', activeLocationId, 'orders', orderId);
    updateDocumentNonBlocking(orderRef, {
      kitchenStatus: newKitchenStatus,
      lastUpdatedAt: serverTimestamp()
    });

    const labels: Record<KitchenStatus, string> = {
      PENDING: "Comanda en espera ⏳",
      IN_PREPARATION: "Comanda dictada a cocina 🔥",
      DELIVERED: "Comanda entregada al cliente 🍽️"
    };
    toast({
      title: "Estado del Pedido",
      description: labels[newKitchenStatus] || "Estado actualizado"
    });
  };

  const handleFetchBcvQuick = async () => {
    setIsSyncingBcv(true);
    try {
      const { usd } = await fetchOfficialRates();
      if (usd && usd.promedio) {
        setNewExchangeRate(usd.promedio.toFixed(2));
        toast({
          title: "Tasa BCV Obtenida",
          description: `Cotización oficial del ${usd.fechaActualizacion?.slice(0, 10)}: ${usd.promedio.toFixed(2)} BS`
        });
      } else {
        toast({ variant: "destructive", title: "Sin respuesta", description: "No se pudo obtener la tasa en este momento." });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Fallo al conectar con la API de tasas." });
    } finally {
      setIsSyncingBcv(false);
    }
  };

  const handleUpdateExchangeRate = () => {
    const rate = parseFloat(newExchangeRate);
    if (isNaN(rate) || rate <= 0) {
      toast({ variant: "destructive", title: "Tasa inválida", description: "Ingresa un número válido." });
      return;
    }
    setDocumentNonBlocking(configRef, {
      exchangeRate: rate,
      currencySymbol: 'USD',
      currencyName: 'Dólar Operativo',
      rateSource: 'MANUAL',
      lastUpdated: serverTimestamp()
    }, { merge: true });
    setIsExchangeRateDialogOpen(false);
    toast({ title: "Tasa Actualizada", description: `Nueva tasa operativa: ${rate.toFixed(2)} BS/$` });
  };

  const resetForm = () => {
    setCustomerName("");
    setTableNumber("");
    setDraftItems([]);
    setSearchTerm("");
    setConfiguringProduct(null);
    setEditingOrderId(null);
    setMobileOrderTab('menu');
  };

  const handleOpenNewOrder = () => {
    resetForm();
    setIsOrderFormOpen(true);
  };

  const handleOpenDetail = (orderId: string) => {
    setSelectedOrderId(orderId);
    setIsDetailOpen(true);
  };

  const handleEditOrder = () => {
    if (!selectedOrder || !selectedOrderItems || selectedOrder.status === 'PAID') return;
    setEditingOrderId(selectedOrderId);
    setCustomerName(selectedOrder.customerNotes || "");
    setTableNumber(selectedOrder.tableNumber || "");
    setDraftItems(selectedOrderItems.map((item: any) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPriceUSD: item.unitPriceUSD,
      subtotalUSD: item.subtotalUSD,
      notes: item.notes || "",
      customizations: item.customizations || [],
      isCombo: item.isCombo || false,
      comboItems: item.comboItems || [],
      comboSlots: item.comboSlots || []
    })));
    setIsOrderFormOpen(true);
    setIsDetailOpen(false);
  };

  const planchaSummary = useMemo(() => {
    return calculatePlanchaSummary(draftItems, products || []);
  }, [draftItems, products]);

  const selectedOrderPlanchaSummary = useMemo(() => {
    return calculatePlanchaSummary(selectedOrderItems || [], products || []);
  }, [selectedOrderItems, products]);

  const isDrinkOrSimpleProduct = (p: any): boolean => {
    if (!p || p.isCombo) return false;
    const name = (p.name || '').toLowerCase();
    const desc = (p.description || '').toLowerCase();
    const isDrinkName = name.includes('refresco') ||
      name.includes('bebida') ||
      name.includes('cerveza') ||
      name.includes('polar') ||
      name.includes('coca') ||
      name.includes('pepsi') ||
      name.includes('jugo') ||
      name.includes('agua') ||
      name.includes('malta') ||
      name.includes('nestea') ||
      name.includes('gatorade') ||
      desc.includes('bebida') ||
      desc.includes('refresco');
    
    if (isDrinkName) return true;
    if (!p.recipe || p.recipe.length === 0) return true;
    return false;
  };

  const filteredProducts = products?.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));
    if (!matchesSearch) return false;
    if (catalogFilter === 'COMBOS') return !!p.isCombo;
    if (catalogFilter === 'FOOD') return !p.isCombo && !isDrinkOrSimpleProduct(p);
    if (catalogFilter === 'DRINKS') return !p.isCombo && isDrinkOrSimpleProduct(p);
    return true;
  });

  // 1. INSERCIÓN DIRECTA DESDE EL CATÁLOGO (1-CLICK POS RÁPIDO)
  const handleAddProductDirectly = (product: any) => {
    const unitPrice = round2(product.masterPriceUSD);

    // Si es Combo -> Añadir con ranuras estándar (Con Todo y bebida default)
    if (product.isCombo) {
      const slots: ComboSlotConfig[] = [];
      let slotCounter = 1;

      if (product.comboItems && product.comboItems.length > 0) {
        product.comboItems.forEach((cItem: any) => {
          const compProduct = products?.find(p => p.id === cItem.productId);
          const count = cItem.quantity || 1;
          const isDrink = cItem.productName?.toLowerCase().includes('refresco') ||
                          cItem.productName?.toLowerCase().includes('bebida') ||
                          cItem.productName?.toLowerCase().includes('jugo') ||
                          cItem.productName?.toLowerCase().includes('cerveza') ||
                          cItem.productName?.toLowerCase().includes('coca');

          for (let i = 1; i <= count; i++) {
            let slotIngredients: IngredientCustomization[] = [];
            if (compProduct?.recipe && compProduct.recipe.length > 0) {
              slotIngredients = compProduct.recipe.map((r: any) => ({
                ingredientId: r.ingredientId,
                ingredientName: r.ingredientName,
                intensity: 'normal' as const
              }));
            }

            slots.push({
              slotId: `slot-${cItem.productId}-${i}-${Date.now()}`,
              slotIndex: slotCounter++,
              productId: cItem.productId,
              productName: count > 1 ? `${cItem.productName} #${i}` : cItem.productName,
              customizations: slotIngredients,
              selectedOption: isDrink ? 'Coca-Cola 1.5L' : undefined,
              notes: ''
            });
          }
        });
      }

      setDraftItems(prev => [...prev, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPriceUSD: unitPrice,
        subtotalUSD: unitPrice,
        notes: "",
        isCombo: true,
        comboItems: product.comboItems || [],
        comboSlots: slots
      }]);

      toast({
        title: "Combo en Pedido",
        description: `${product.name} (+1 estándar). Puedes personalizar sus ranuras desde el pedido.`
      });
      return;
    }

    // Si es Producto Suelto (Bebida o Comida)
    let initialIngredients: IngredientCustomization[] = [];
    if (product.recipe && product.recipe.length > 0) {
      initialIngredients = product.recipe.map((r: any) => ({
        ingredientId: r.ingredientId,
        ingredientName: r.ingredientName,
        intensity: 'normal' as const
      }));
    }

    setDraftItems(prev => {
      // Si ya existe en el carrito sin notas y con personalización estándar ("normal" o sin receta)
      const existingIdx = prev.findIndex(item => 
        item.productId === product.id && 
        !item.isCombo && 
        !item.notes && 
        (!item.customizations || item.customizations.length === 0 || item.customizations.every(c => c.intensity === 'normal'))
      );

      if (existingIdx >= 0) {
        const up = [...prev];
        const item = { ...up[existingIdx] };
        item.quantity += 1;
        item.subtotalUSD = round2(item.quantity * item.unitPriceUSD);
        up[existingIdx] = item;
        return up;
      }

      return [...prev, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPriceUSD: unitPrice,
        subtotalUSD: unitPrice,
        notes: "",
        customizations: initialIngredients,
        isCombo: false
      }];
    });

    toast({
      title: "Agregado al Pedido",
      description: `${product.name} (+1)`
    });
  };

  // 2. ABRIR PERSONALIZACIÓN DESDE UN ITEM DEL CARRITO
  const handleOpenCustomizeCartItem = (index: number) => {
    const item = draftItems[index];
    if (!item) return;
    setEditingDraftIndex(index);

    if (item.isCombo) {
      const p = products?.find(prod => prod.id === item.productId) || {
        id: item.productId,
        name: item.productName,
        masterPriceUSD: item.unitPriceUSD,
        isCombo: true,
        comboItems: item.comboItems
      };
      setConfiguringCombo(p);
      setComboSlotsDraft(JSON.parse(JSON.stringify(item.comboSlots || [])));
      setComboNotes(item.notes || "");
      setActiveSlotIndex(0);
    } else {
      const p = products?.find(prod => prod.id === item.productId) || {
        id: item.productId,
        name: item.productName,
        masterPriceUSD: item.unitPriceUSD,
        recipe: item.customizations
      };
      setConfiguringProduct(p);
      setConfigQuantity(item.quantity);
      setConfigNotes(item.notes || "");
      
      if (item.customizations && item.customizations.length > 0) {
        setConfigIngredients(JSON.parse(JSON.stringify(item.customizations)));
      } else if (p.recipe && p.recipe.length > 0) {
        setConfigIngredients(p.recipe.map((r: any) => ({
          ingredientId: r.ingredientId,
          ingredientName: r.ingredientName,
          intensity: 'normal' as const
        })));
      } else {
        setConfigIngredients([]);
      }
    }
  };

  // 3. GUARDAR CAMBIOS DE PERSONALIZACIÓN
  const saveCustomizedCartItem = () => {
    if (editingDraftIndex !== null) {
      if (configuringCombo) {
        setDraftItems(prev => {
          const up = [...prev];
          if (up[editingDraftIndex]) {
            up[editingDraftIndex] = {
              ...up[editingDraftIndex],
              notes: comboNotes.trim(),
              comboSlots: comboSlotsDraft
            };
          }
          return up;
        });

        setConfiguringCombo(null);
        setEditingDraftIndex(null);
        setComboSlotsDraft([]);
        setComboNotes("");
        toast({
          title: "Combo Actualizado",
          description: "Ranuras y preparación guardadas."
        });
        return;
      }

      if (configuringProduct) {
        const unitPrice = round2(configuringProduct.masterPriceUSD);
        const subtotal = round2(unitPrice * configQuantity);

        setDraftItems(prev => {
          const up = [...prev];
          if (up[editingDraftIndex]) {
            up[editingDraftIndex] = {
              ...up[editingDraftIndex],
              quantity: configQuantity,
              unitPriceUSD: unitPrice,
              subtotalUSD: subtotal,
              notes: configNotes.trim(),
              customizations: configIngredients
            };
          }
          return up;
        });

        setConfiguringProduct(null);
        setEditingDraftIndex(null);
        setConfigQuantity(1);
        setConfigNotes("");
        setConfigIngredients([]);
        toast({
          title: "Producto Actualizado",
          description: "Personalización guardada con éxito."
        });
        return;
      }
    }

    // Si por alguna razón se llama fuera de edición de carrito
    if (configuringCombo) {
      const unitPrice = round2(configuringCombo.masterPriceUSD);
      setDraftItems(prev => [...prev, {
        productId: configuringCombo.id,
        productName: configuringCombo.name,
        quantity: 1,
        unitPriceUSD: unitPrice,
        subtotalUSD: unitPrice,
        notes: comboNotes.trim(),
        isCombo: true,
        comboItems: configuringCombo.comboItems || [],
        comboSlots: comboSlotsDraft
      }]);
      setConfiguringCombo(null);
      setComboSlotsDraft([]);
      setComboNotes("");
    } else if (configuringProduct) {
      const unitPrice = round2(configuringProduct.masterPriceUSD);
      const subtotal = round2(unitPrice * configQuantity);
      const activeCustomizations = configIngredients.filter(ci => ci.intensity !== 'normal');
      setDraftItems(prev => [...prev, {
        productId: configuringProduct.id,
        productName: configuringProduct.name,
        quantity: configQuantity,
        unitPriceUSD: unitPrice,
        subtotalUSD: subtotal,
        notes: configNotes.trim(),
        customizations: activeCustomizations,
        isCombo: configuringProduct.isCombo || false,
        comboItems: configuringProduct.comboItems || []
      }]);
      setConfiguringProduct(null);
      setConfigQuantity(1);
      setConfigNotes("");
      setConfigIngredients([]);
    }
  };

  const updateSlotIngredientIntensity = (slotIdx: number, ingIdx: number, intensity: IngredientIntensity) => {
    setComboSlotsDraft(prev => {
      const updated = [...prev];
      const slot = { ...updated[slotIdx] };
      const customs = [...(slot.customizations || [])];
      customs[ingIdx] = { ...customs[ingIdx], intensity };
      slot.customizations = customs;
      updated[slotIdx] = slot;
      return updated;
    });
  };

  const setAllSlotIngredients = (slotIdx: number, intensity: IngredientIntensity) => {
    setComboSlotsDraft(prev => {
      const updated = [...prev];
      const slot = { ...updated[slotIdx] };
      slot.customizations = (slot.customizations || []).map(ing => ({ ...ing, intensity }));
      updated[slotIdx] = slot;
      return updated;
    });
  };

  const copyCustomizationFromSlot = (targetSlotIdx: number, sourceSlotIdx: number) => {
    if (!comboSlotsDraft[sourceSlotIdx] || !comboSlotsDraft[targetSlotIdx]) return;
    setComboSlotsDraft(prev => {
      const updated = [...prev];
      const sourceSlot = prev[sourceSlotIdx];
      const targetSlot = { ...prev[targetSlotIdx] };
      targetSlot.customizations = JSON.parse(JSON.stringify(sourceSlot.customizations || []));
      targetSlot.notes = sourceSlot.notes || "";
      targetSlot.selectedOption = sourceSlot.selectedOption;
      updated[targetSlotIdx] = targetSlot;
      return updated;
    });
    toast({
      title: "Personalización Copiada",
      description: `Se copió la configuración del ${comboSlotsDraft[sourceSlotIdx].productName}.`
    });
  };

  const setIngredientIntensity = (index: number, intensity: IngredientIntensity) => {
    setConfigIngredients(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], intensity };
      return updated;
    });
  };

  const setAllIngredientsIntensity = (intensity: IngredientIntensity) => {
    setConfigIngredients(prev => prev.map(ing => ({ ...ing, intensity })));
  };

  const removeFromDraft = (index: number) => {
    setDraftItems(draftItems.filter((_, i) => i !== index));
  };

  const updateDraftQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      removeFromDraft(index);
      return;
    }
    const updated = [...draftItems];
    const item = updated[index];
    item.quantity = newQty;
    item.subtotalUSD = round2(item.unitPriceUSD * newQty);
    setDraftItems(updated);
  };

  const calculateDraftTotal = () => {
    return round2(draftItems.reduce((acc, item) => acc + item.subtotalUSD, 0));
  };

  const handleSaveOrder = async () => {
    if (isSavingOrder) return;
    if (!user || draftItems.length === 0 || !customerName.trim() || !activeLocationId) {
      toast({ variant: "destructive", title: "Faltan datos", description: "El nombre y al menos un producto son requeridos." });
      return;
    }

    // Verificación de comanda duplicada para la misma mesa
    if (!editingOrderId && tableNumber.trim() && tableNumber.trim().toUpperCase() !== "N/A" && tableNumber.trim().toLowerCase() !== "para llevar") {
      const existingSameTable = rawOrders?.find(o => 
        o.tableNumber?.toLowerCase().trim() === tableNumber.toLowerCase().trim() && 
        o.status !== 'PAID' && 
        !o.archived
      );
      if (existingSameTable) {
        const proceed = confirm(`⚠️ Atención: La mesa "${tableNumber}" ya tiene una comanda activa (${existingSameTable.customerNotes}, Ticket: ${existingSameTable.orderNumber}).\n\n¿Estás seguro de que deseas crear OTRA comanda adicional para esta misma mesa?`);
        if (!proceed) return;
      }
    }

    setIsSavingOrder(true);
    try {
      const orderTotal = round2(calculateDraftTotal());
      
      if (editingOrderId) {
        const currentPaid = round2(selectedOrder?.totalPaidUSD || 0);
        const pendingBal = Math.max(0, round2(orderTotal - currentPaid));
        const orderRef = doc(firestore, 'locations', activeLocationId, 'orders', editingOrderId);
        updateDocumentNonBlocking(orderRef, {
          customerNotes: customerName.trim(),
          tableNumber: tableNumber.trim() || "N/A",
          totalUSD: orderTotal,
          pendingBalanceUSD: pendingBal,
          status: pendingBal <= 0.005 ? 'PAID' : (selectedOrder?.status || 'OPEN'),
          lastUpdatedAt: serverTimestamp()
        });

        const itemsRef = collection(firestore, 'locations', activeLocationId, 'orders', editingOrderId, 'items');
        const oldItems = await getDocs(itemsRef);
        const oldItemsList = oldItems.docs.map(d => ({
          productId: d.data().productId,
          quantity: d.data().quantity,
          isCombo: d.data().isCombo,
          comboItems: d.data().comboItems,
          comboSlots: d.data().comboSlots,
          customizations: d.data().customizations
        }));

        const batch = writeBatch(firestore);
        oldItems.forEach(doc => batch.delete(doc.ref));
        draftItems.forEach(item => {
          const newDoc = doc(itemsRef);
          batch.set(newDoc, {
            ...item,
            orderId: editingOrderId,
            status: 'Pending',
            addedAt: serverTimestamp(),
            orderWaiterId: user.uid,
            orderLocationId: activeLocationId
          });
        });
        await batch.commit();

        // Ajuste automático de stock (diferencial)
        const newItemsList = draftItems.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          isCombo: i.isCombo,
          comboItems: i.comboItems,
          comboSlots: i.comboSlots,
          customizations: i.customizations
        }));
        await applyStockDeduction(firestore, activeLocationId, oldItemsList, newItemsList, products || []);

        toast({ title: "Comanda actualizada", description: `El pedido de ${customerName} ha sido modificado y el inventario ajustado.` });
      } else {
        const ordersRef = collection(firestore, 'locations', activeLocationId, 'orders');
        const newOrderData = {
          orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
          locationId: activeLocationId,
          orderDate: serverTimestamp(),
          status: 'OPEN',
          kitchenStatus: 'PENDING',
          paymentStatus: 'UNPAID',
          totalUSD: orderTotal,
          totalPaidUSD: 0,
          pendingBalanceUSD: orderTotal,
          waiterId: user.uid,
          waiterName: profile?.firstName || user?.email?.split('@')[0] || 'Operador',
          tableNumber: tableNumber.trim() || "N/A",
          customerNotes: customerName.trim(),
          lastUpdatedAt: serverTimestamp(),
          archived: false
        };

        const orderRef = await addDocumentNonBlocking(ordersRef, newOrderData);
        if (orderRef) {
          const itemsRef = collection(firestore, 'locations', activeLocationId, 'orders', orderRef.id, 'items');
          draftItems.forEach(item => {
            addDocumentNonBlocking(itemsRef, {
              ...item,
              orderId: orderRef.id,
              status: 'Pending',
              addedAt: serverTimestamp(),
              orderWaiterId: user.uid,
              orderLocationId: activeLocationId
            });
          });

          // Deducción automática de stock en cascada
          const newItemsList = draftItems.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            isCombo: i.isCombo,
            comboItems: i.comboItems,
            comboSlots: i.comboSlots,
            customizations: i.customizations
          }));
          await applyStockDeduction(firestore, activeLocationId, [], newItemsList, products || []);
        }
        toast({ title: "Comanda creada", description: `Pedido para ${customerName} registrado e inventario descontado.` });
      }

      setIsOrderFormOpen(false);
      setEditingOrderId(null);
      setCustomerName("");
      setTableNumber("");
      setDraftItems([]);
      setConfiguringProduct(null);
      setConfiguringCombo(null);
      setComboSlotsDraft([]);
      setConfigIngredients([]);
    } catch (err: any) {
      console.error("Error saving order:", err);
      toast({ variant: "destructive", title: "Error al guardar", description: err.message || "No se pudo guardar la comanda." });
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleConfirmCancelOrder = async () => {
    if (!selectedOrderId || !activeLocationId || !selectedOrder) return;
    setIsCancellingOrder(true);
    try {
      // 1. Obtener items de la orden para restaurar inventario
      const itemsRef = collection(firestore, 'locations', activeLocationId, 'orders', selectedOrderId, 'items');
      const itemsSnap = await getDocs(itemsRef);
      const oldItemsList = itemsSnap.docs.map(d => ({
        productId: d.data().productId,
        quantity: d.data().quantity,
        isCombo: d.data().isCombo,
        comboItems: d.data().comboItems,
        comboSlots: d.data().comboSlots,
        customizations: d.data().customizations
      }));

      // 2. Reintegrar stock al inventario (newItems = [])
      if (oldItemsList.length > 0) {
        await applyStockDeduction(firestore, activeLocationId, oldItemsList, [], products || []);
      }

      // 3. Actualizar la orden a CANCELLED y archived = false (permanece visible al final)
      const orderRef = doc(firestore, 'locations', activeLocationId, 'orders', selectedOrderId);
      updateDocumentNonBlocking(orderRef, {
        status: 'CANCELLED',
        archived: false,
        pendingBalanceUSD: 0,
        cancelReason: cancelReason,
        cancelledAt: serverTimestamp(),
        cancelledBy: user?.uid || 'anonymous',
        cancelledByName: profile?.firstName || user?.email?.split('@')[0] || 'Operador',
        lastUpdatedAt: serverTimestamp()
      });

      toast({
        title: "Comanda Bloqueada / Anulada",
        description: `La comanda ${selectedOrder.orderNumber} ha sido bloqueada, bajó al final de la lista y los insumos fueron reintegrados.`
      });

      setIsCancelDialogOpen(false);
      setIsDetailOpen(false);
      setSelectedOrderId(null);
    } catch (error: any) {
      console.error("Error cancelling order:", error);
      toast({ variant: "destructive", title: "Error al anular", description: error.message });
    } finally {
      setIsCancellingOrder(false);
    }
  };

  const handleUnblockOrder = async () => {
    if (!selectedOrderId || !activeLocationId || !selectedOrder) return;
    setIsUnblockingOrder(true);
    try {
      // 1. Obtener items de la orden para volver a descontar inventario
      const itemsRef = collection(firestore, 'locations', activeLocationId, 'orders', selectedOrderId, 'items');
      const itemsSnap = await getDocs(itemsRef);
      const itemsList = itemsSnap.docs.map(d => ({
        productId: d.data().productId,
        quantity: d.data().quantity,
        isCombo: d.data().isCombo,
        comboItems: d.data().comboItems,
        comboSlots: d.data().comboSlots,
        customizations: d.data().customizations
      }));

      // 2. Volver a descontar insumos del inventario
      if (itemsList.length > 0) {
        await applyStockDeduction(firestore, activeLocationId, [], itemsList, products || []);
      }

      // 3. Recalcular saldos
      const totalUSD = round2(selectedOrder.totalUSD || 0);
      const totalPaidUSD = round2(selectedOrder.totalPaidUSD || 0);
      const pendingUSD = Math.max(0, round2(totalUSD - totalPaidUSD));
      const newStatus: OrderStatus = pendingUSD <= 0.005 ? 'PAID' : 'OPEN';
      const paymentStatus: PaymentStatus = newStatus === 'PAID' ? 'PAID' : (totalPaidUSD > 0.005 ? 'PARTIAL' : 'UNPAID');

      // 4. Actualizar documento en Firestore
      const orderRef = doc(firestore, 'locations', activeLocationId, 'orders', selectedOrderId);
      updateDocumentNonBlocking(orderRef, {
        status: newStatus,
        paymentStatus: paymentStatus,
        pendingBalanceUSD: pendingUSD,
        archived: false,
        cancelReason: null,
        unblockedAt: serverTimestamp(),
        unblockedBy: user?.uid || 'anonymous',
        unblockedByName: profile?.firstName || user?.email?.split('@')[0] || 'Operador',
        lastUpdatedAt: serverTimestamp()
      });

      toast({
        title: "🔓 Comanda Desbloqueada",
        description: `La comanda ${selectedOrder.orderNumber} ha sido reactivada exitosamente y volvió a su posición en el tablero.`
      });

      setIsDetailOpen(false);
      setSelectedOrderId(null);
    } catch (error: any) {
      console.error("Error unblocking order:", error);
      toast({ variant: "destructive", title: "Error al desbloquear", description: error.message });
    } finally {
      setIsUnblockingOrder(false);
    }
  };

  const handleOpenPayment = () => {
    if (!selectedOrder) return;
    const pendingUSD = round2(selectedOrder.pendingBalanceUSD || 0);
    setPaymentCurrency("USD");
    setPaymentAmount(pendingUSD.toFixed(2));
    setPaymentMethod("DIVISAS");
    setPaymentPhone("");
    setPaymentReference("");
    setIsPaymentDialogOpen(true);
  };

  const handleSelectPaymentMethod = (methodId: string) => {
    setPaymentMethod(methodId);
    const method = PAYMENT_METHODS.find(m => m.id === methodId);
    if (!selectedOrder) return;
    const pendingUSD = round2(selectedOrder.pendingBalanceUSD || 0);

    if (method?.defaultCurrency === 'BS' && paymentCurrency !== 'BS') {
      setPaymentCurrency('BS');
      setPaymentAmount(convertUsdToBs(pendingUSD, currentExchangeRate).toFixed(2));
    } else if (method?.defaultCurrency === 'USD' && paymentCurrency !== 'USD') {
      setPaymentCurrency('USD');
      setPaymentAmount(pendingUSD.toFixed(2));
    }
  };

  const handleChangePaymentCurrency = (newCurr: 'USD' | 'BS') => {
    setPaymentCurrency(newCurr);
    if (!selectedOrder) return;
    const pendingUSD = round2(selectedOrder.pendingBalanceUSD || 0);

    if (newCurr === 'BS') {
      setPaymentAmount(convertUsdToBs(pendingUSD, currentExchangeRate).toFixed(2));
      if (paymentMethod === 'DIVISAS') {
        setPaymentMethod('PAGO_MOVIL');
      }
    } else {
      setPaymentAmount(pendingUSD.toFixed(2));
      if (['PAGO_MOVIL', 'PUNTO', 'EFECTIVO_BS', 'TRANSFERENCIA'].includes(paymentMethod)) {
        setPaymentMethod('DIVISAS');
      }
    }
  };

  const processPayment = async () => {
    if (!selectedOrderId || !selectedOrder || !user || !activeLocationId) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Monto inválido" });
      return;
    }

    const pendingUSD = round2(selectedOrder.pendingBalanceUSD || 0);
    let amountUSD = round2(amount);
    let amountBS = convertUsdToBs(amountUSD, currentExchangeRate);

    if (paymentCurrency === "BS") {
      amountBS = round2(amount);
      amountUSD = convertBsToUsd(amountBS, currentExchangeRate, pendingUSD);
    }

    const paymentsRef = collection(firestore, 'locations', activeLocationId, 'orders', selectedOrderId, 'payments');
    addDocumentNonBlocking(paymentsRef, {
      orderId: selectedOrderId,
      amountUSD: amountUSD,
      amountBS: amountBS,
      exchangeRateAtPayment: currentExchangeRate,
      paymentDate: serverTimestamp(),
      paymentMethod: paymentMethod,
      cashierId: user.uid,
      orderLocationId: activeLocationId,
      phone: (paymentMethod === 'PAGO_MOVIL' || paymentMethod === 'TRANSFERENCIA') ? paymentPhone : null,
      reference: (paymentMethod === 'PAGO_MOVIL' || paymentMethod === 'TRANSFERENCIA') ? paymentReference : null
    });

    const currentPaidTotal = round2(selectedOrder.totalPaidUSD || 0);
    const newPaidTotal = round2(currentPaidTotal + amountUSD);
    const orderTotal = round2(selectedOrder.totalUSD || 0);
    const newPending = Math.max(0, round2(orderTotal - newPaidTotal));
    const newStatus = newPending <= 0.005 ? 'PAID' : 'OPEN';
    const paymentStatus: PaymentStatus = newStatus === 'PAID' ? 'PAID' : (newPaidTotal > 0.005 ? 'PARTIAL' : 'UNPAID');

    updateDocumentNonBlocking(selectedOrderRef!, {
      totalPaidUSD: newStatus === 'PAID' ? orderTotal : newPaidTotal,
      pendingBalanceUSD: newStatus === 'PAID' ? 0 : newPending,
      status: newStatus,
      paymentStatus: paymentStatus,
      lastUpdatedAt: serverTimestamp()
    });

    setIsPaymentDialogOpen(false);
    if (newStatus === 'PAID') {
      toast({ title: "Orden Pagada", description: "El pedido se ha cerrado exitosamente (Saldo 0.00)." });
      setIsDetailOpen(false);
    } else {
      toast({ title: "Abono registrado", description: `Saldo restante: $${newPending.toFixed(2)} USD` });
    }
  };

  const handleArchiveDaily = async () => {
    if (!orders || orders.length === 0 || !activeLocationId) return;
    
    const paidOrders = orders.filter(o => o.status === 'PAID');
    if (paidOrders.length === 0) {
      toast({ title: "Sin novedades", description: "No hay comandas pagadas para archivar." });
      return;
    }

    if (!confirm(`¿Deseas archivar ${paidOrders.length} comandas pagadas?`)) {
      return;
    }

    setIsArchiving(true);
    try {
      const batch = writeBatch(firestore);
      paidOrders.forEach(o => {
        const ref = doc(firestore, 'locations', activeLocationId, 'orders', o.id);
        batch.update(ref, { archived: true, lastUpdatedAt: serverTimestamp() });
      });
      await batch.commit();
      toast({ title: "Histórico guardado", description: "Las comandas pagadas han sido archivadas." });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron archivar las comandas." });
    } finally {
      setIsArchiving(false);
    }
  };

  const currentLocationName = MOCK_LOCATIONS.find(l => l.id === activeLocationId)?.name || "Sucursal";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar role={role} />
      
      <main className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-8 pt-16 pb-24 lg:pt-8 lg:pb-8">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-headline font-bold text-foreground">Gestión de Comandas</h1>
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" /> <span className="font-bold text-primary">{currentLocationName}</span>
                </p>
                <button 
                  onClick={() => setIsExchangeRateDialogOpen(true)}
                  className="bg-accent/10 hover:bg-accent/20 border border-accent/20 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full flex items-center gap-1.5 sm:gap-2 transition-all group"
                >
                  <TrendingUp className="h-3.5 w-3.5 text-accent" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-accent-foreground">Tasa: </span>
                  <span className="text-xs font-headline font-bold text-accent">{currentExchangeRate.toFixed(2)} BS</span>
                  <RefreshCw className="h-3 w-3 text-accent/50 group-hover:rotate-180 transition-transform duration-500" />
                </button>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3">
              {isAdmin && (
                <div className="flex items-center gap-2 bg-card p-1 rounded-lg border border-border shadow-sm w-full sm:w-auto">
                  <Select value={activeLocationId || "br-1"} onValueChange={(val) => { if(val) setActiveLocationId(val) }}>
                    <SelectTrigger className="h-9 w-full sm:w-[180px] border-none bg-transparent focus:ring-0 text-xs font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MOCK_LOCATIONS.filter(l => l.type === 'BRANCH').map(loc => (
                        <SelectItem key={loc.id} value={loc.id} className="text-xs">
                          📍 {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
                <Button 
                  variant="outline" 
                  onClick={handleArchiveDaily} 
                  disabled={isArchiving || orders?.filter(o => o.status === 'PAID').length === 0}
                  className="gap-1.5 sm:gap-2 border-accent/50 text-accent hover:bg-accent/10 flex-1 sm:flex-none h-11 sm:h-10 text-xs sm:text-sm"
                >
                  <Archive className="h-4 w-4" /> Archivar
        </Button>
                <Button onClick={handleOpenNewOrder} className="gap-2 shadow-lg h-11 sm:h-12 px-4 sm:px-6 text-sm sm:text-base font-bold bg-primary hover:bg-primary/90 flex-[2] sm:flex-none">
                  <Plus className="h-5 w-5" /> Nueva Comanda
                </Button>
              </div>
            </div>
          </header>

          {/* BARRA DE HERRAMIENTAS: FILTROS DE COCINA + ALTERNADOR DE VISTA */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            {/* Filtros por estado de cocina */}
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-none flex-1">
              <button
                onClick={() => setKitchenFilter('ALL')}
                className={cn(
                  "px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border",
                  kitchenFilter === 'ALL'
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <span>Todas</span>
                <span className="text-[10px] opacity-75 font-normal">({orders?.length || 0})</span>
              </button>

              <button
                onClick={() => setKitchenFilter('PENDING')}
                className={cn(
                  "px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border",
                  kitchenFilter === 'PENDING'
                    ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                    : "bg-card border-border text-amber-400 hover:bg-amber-500/10"
                )}
              >
                <Hourglass className="h-3.5 w-3.5" />
                <span>En Espera</span>
                <span className="text-[10px] opacity-75 font-normal">
                  ({orders?.filter(o => (o.kitchenStatus || 'PENDING') === 'PENDING' && o.status !== 'PAID').length || 0})
                </span>
              </button>

              <button
                onClick={() => setKitchenFilter('IN_PREPARATION')}
                className={cn(
                  "px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border",
                  kitchenFilter === 'IN_PREPARATION'
                    ? "bg-blue-500 text-white border-blue-500 shadow-sm"
                    : "bg-card border-border text-blue-400 hover:bg-blue-500/10"
                )}
              >
                <Flame className="h-3.5 w-3.5" />
                <span>En Cocina</span>
                <span className="text-[10px] opacity-75 font-normal">
                  ({orders?.filter(o => o.kitchenStatus === 'IN_PREPARATION').length || 0})
                </span>
              </button>

              <button
                onClick={() => setKitchenFilter('DELIVERED')}
                className={cn(
                  "px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border",
                  kitchenFilter === 'DELIVERED'
                    ? "bg-purple-500 text-white border-purple-500 shadow-sm"
                    : "bg-card border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Entregados</span>
                <span className="text-[10px] opacity-75 font-normal">
                  ({orders?.filter(o => o.kitchenStatus === 'DELIVERED').length || 0})
                </span>
              </button>
            </div>

            {/* Alternador de Vista (Cuadrícula vs Lista) */}
            <div className="flex items-center bg-card border border-border p-1 rounded-xl shrink-0 self-end sm:self-auto shadow-sm">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                  viewMode === 'grid' 
                    ? "bg-primary text-primary-foreground shadow" 
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Vista en Tarjetas"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="text-[11px]">Tarjetas</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                  viewMode === 'list' 
                    ? "bg-primary text-primary-foreground shadow" 
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Vista en Lista"
              >
                <List className="h-3.5 w-3.5" />
                <span className="text-[11px]">Lista</span>
              </button>
            </div>
          </div>

          {/* CONTENEDOR DE COMANDAS: MODO CUADRÍCULA O MODO LISTA */}
          {!user || ordersLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-44 rounded-xl bg-card animate-pulse border border-border" />
              ))}
            </div>
          ) : orders?.length === 0 ? (
            <div className="py-12 md:py-20 text-center space-y-4 bg-muted/10 rounded-3xl border border-dashed border-border p-4">
              <div className="p-4 bg-primary/10 rounded-full w-fit mx-auto">
                <UtensilsCrossed className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-headline font-bold">Sin comandas en {currentLocationName}</h3>
                <p className="text-sm text-muted-foreground">Toca el botón superior para tomar un pedido.</p>
              </div>
            </div>
          ) : (() => {
            const displayedOrders = orders?.filter(o => {
              if (kitchenFilter === 'ALL') return true;
              const currentK = o.kitchenStatus || (o.status === 'PAID' ? 'DELIVERED' : 'PENDING');
              return currentK === kitchenFilter;
            }) || [];

            if (displayedOrders.length === 0) {
              return (
                <div className="py-10 text-center text-xs text-muted-foreground bg-card rounded-2xl border border-border">
                  No hay comandas en este estado de preparación.
                </div>
              );
            }

            if (viewMode === 'grid') {
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
                  {displayedOrders.map(order => (
                    <OrderCard 
                      key={order.id} 
                      order={{
                        ...order,
                        createdAt: order.orderDate?.seconds ? new Date(order.orderDate.seconds * 1000).toISOString() : new Date().toISOString(),
                        totalUSD: order.totalUSD || 0,
                        paidUSD: order.totalPaidUSD || 0,
                        pendingBalanceUSD: order.pendingBalanceUSD || 0,
                        status: (order.status || 'OPEN') as any,
                        kitchenStatus: order.kitchenStatus || (order.status === 'PAID' ? 'DELIVERED' : 'PENDING'),
                        paymentStatus: order.paymentStatus || (order.status === 'PAID' ? 'PAID' : ((order.totalPaidUSD || 0) > 0.005 ? 'PARTIAL' : 'UNPAID')),
                        items: [] 
                      }} 
                      onClick={() => handleOpenDetail(order.id)} 
                    />
                  ))}
                </div>
              );
            }

            // VISTA EN MODO LISTA / TABLA CON FILAS 100% SÓLIDAS DE COLOR
            return (
              <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-2xl overflow-x-auto">
                <Table className="border-collapse">
                  <TableHeader className="bg-slate-900 border-b border-border">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-black text-slate-200 uppercase tracking-wider py-4 whitespace-nowrap">Cliente</TableHead>
                      <TableHead className="text-xs font-black text-slate-200 uppercase tracking-wider text-center py-4 whitespace-nowrap">Estado Cocina</TableHead>
                      <TableHead className="text-xs font-black text-slate-200 uppercase tracking-wider text-center py-4 whitespace-nowrap">Estado Cobro</TableHead>
                      <TableHead className="text-xs font-black text-slate-200 uppercase tracking-wider text-right py-4 whitespace-nowrap">Total Pedido</TableHead>
                      <TableHead className="text-xs font-black text-slate-200 uppercase tracking-wider text-right py-4 whitespace-nowrap">Saldo Pendiente</TableHead>
                      <TableHead className="text-xs font-black text-slate-200 uppercase tracking-wider py-4 whitespace-nowrap">Mesa</TableHead>
                      <TableHead className="text-xs font-black text-slate-200 uppercase tracking-wider py-4 whitespace-nowrap">Ticket / Hora</TableHead>
                      <TableHead className="text-xs font-black text-slate-200 uppercase tracking-wider text-center py-4 whitespace-nowrap">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedOrders.map(order => {
                      const isCancelled = order.status === 'CANCELLED';
                      const isPaid = !isCancelled && (order.status === 'PAID' || (order.pendingBalanceUSD !== undefined && order.pendingBalanceUSD <= 0.005));
                      const isPartial = !isCancelled && !isPaid && (order.totalPaidUSD || 0) > 0.005;
                      const k = order.kitchenStatus || (isPaid ? 'DELIVERED' : 'PENDING');
                      const isDeliveredUnpaid = k === 'DELIVERED' && !isPaid && !isCancelled;
                      const timeStr = order.orderDate?.seconds ? format(new Date(order.orderDate.seconds * 1000), 'hh:mm a') : '--:--';
                      
                      // Clases y colores 100% sólidos para la fila completa
                      const rowStyle = 
                        isCancelled
                          ? {
                              tr: "bg-zinc-900/90 text-zinc-400 hover:bg-zinc-850 border-b border-zinc-800 opacity-80 hover:opacity-100",
                              ticketBg: "bg-black/40 text-zinc-400 border border-zinc-700",
                              timeColor: "text-zinc-500 font-bold",
                              mesaBg: "bg-black/40 text-zinc-400 border border-zinc-700",
                              clientColor: "text-zinc-300 font-bold",
                              badgeCocina: "bg-zinc-800 text-zinc-300 border border-zinc-700",
                              totalColor: "text-zinc-500 line-through",
                              totalBsColor: "text-zinc-600 font-bold",
                              btnAction: "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700",
                              label: "BLOQUEADA"
                            }
                          : isDeliveredUnpaid
                          ? {
                              tr: "bg-red-600 text-white hover:bg-red-500 border-b border-red-700 ring-2 ring-inset ring-red-300 font-bold shadow-xl animate-pulse",
                              ticketBg: "bg-black/30 text-white border border-red-400",
                              timeColor: "text-red-100 font-bold",
                              mesaBg: "bg-black text-white",
                              clientColor: "text-white font-black",
                              badgeCocina: "bg-black text-red-400 font-black border border-red-400 shadow-md",
                              totalColor: "text-white font-black",
                              totalBsColor: "text-red-100 font-bold",
                              btnAction: "bg-black text-red-400 hover:bg-zinc-900 font-black shadow-lg",
                              label: "3. ENTREGADO - DEBE"
                            }
                          : k === 'PENDING' 
                          ? {
                              tr: "bg-amber-400 text-slate-950 hover:bg-amber-300 border-b border-amber-500",
                              ticketBg: "bg-black/20 text-slate-950",
                              timeColor: "text-slate-900 font-bold",
                              mesaBg: "bg-black text-white",
                              clientColor: "text-slate-950",
                              badgeCocina: "bg-black text-amber-300",
                              totalColor: "text-slate-950",
                              totalBsColor: "text-slate-900 font-bold",
                              btnAction: "bg-black text-amber-400 hover:bg-slate-900",
                              label: "1. EN ESPERA"
                            }
                          : k === 'IN_PREPARATION' 
                          ? {
                              tr: "bg-cyan-400 text-slate-950 hover:bg-cyan-300 border-b border-cyan-500 ring-1 ring-inset ring-cyan-200/60",
                              ticketBg: "bg-black/20 text-slate-950",
                              timeColor: "text-slate-900 font-bold",
                              mesaBg: "bg-black text-white",
                              clientColor: "text-slate-950",
                              badgeCocina: "bg-black text-cyan-300 animate-pulse",
                              totalColor: "text-slate-950",
                              totalBsColor: "text-slate-900 font-bold",
                              btnAction: "bg-black text-cyan-300 hover:bg-slate-900",
                              label: "2. EN COCINA"
                            }
                          : {
                              tr: "bg-purple-600 text-white hover:bg-purple-500 border-b border-purple-700",
                              ticketBg: "bg-black/25 text-white",
                              timeColor: "text-purple-100 font-bold",
                              mesaBg: "bg-white text-purple-950",
                              clientColor: "text-white",
                              badgeCocina: "bg-black/30 text-white",
                              totalColor: "text-white",
                              totalBsColor: "text-purple-100 font-bold",
                              btnAction: "bg-white text-purple-900 hover:bg-slate-100",
                              label: "3. ENTREGADO"
                            };

                      return (
                        <TableRow 
                          key={order.id} 
                          className={cn("cursor-pointer transition-all duration-200 font-medium", rowStyle.tr)}
                          onClick={() => handleOpenDetail(order.id)}
                        >
                          {/* 1. Cliente */}
                          <TableCell className={cn("py-4 font-headline font-black text-base whitespace-nowrap truncate max-w-[200px]", rowStyle.clientColor)}>
                            {order.customerNotes || "Cliente"}
                          </TableCell>

                          {/* 2. Estado Cocina (Badge Sólido) */}
                          <TableCell className="text-center py-4 whitespace-nowrap">
                            <span className={cn("px-3 py-1.5 text-xs font-black rounded-xl shadow-md inline-block whitespace-nowrap text-center", rowStyle.badgeCocina)}>
                              {rowStyle.label}
                            </span>
                          </TableCell>

                          {/* 3. Estado Cobro */}
                          <TableCell className="text-center py-4 whitespace-nowrap">
                            {isCancelled ? (
                              <span className="px-3 py-1 text-[11px] font-black bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg shadow-sm inline-block whitespace-nowrap">
                                BLOQUEADA
                              </span>
                            ) : isPaid ? (
                              <span className="px-3 py-1 text-[11px] font-black bg-emerald-950 text-emerald-300 border border-emerald-400 rounded-lg shadow-sm inline-block whitespace-nowrap">
                                PAGADO
                              </span>
                            ) : isPartial ? (
                              <span className="px-3 py-1 text-[11px] font-black bg-black text-amber-300 rounded-lg shadow-sm inline-block whitespace-nowrap">
                                ABONADO
                              </span>
                            ) : (
                              <span className="px-3 py-1 text-[11px] font-black bg-rose-950 text-white border border-rose-400 rounded-lg shadow-sm inline-block whitespace-nowrap">
                                SIN PAGAR
                              </span>
                            )}
                          </TableCell>

                          {/* 4. Total Facturado */}
                          <TableCell className="text-right py-4 whitespace-nowrap">
                            <div className={cn("font-headline font-black text-lg whitespace-nowrap", rowStyle.totalColor)}>
                              ${(order.totalUSD || 0).toFixed(2)}
                            </div>
                            <div className={cn("text-[11px] whitespace-nowrap", rowStyle.totalBsColor)}>
                              {((order.totalUSD || 0) * currentExchangeRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })} BS
                            </div>
                          </TableCell>

                          {/* 5. Saldo Pendiente */}
                          <TableCell className="text-right py-4 whitespace-nowrap">
                            {isCancelled ? (
                              <span className="text-xs font-bold text-zinc-500 bg-black/25 px-2.5 py-1 rounded-lg inline-block whitespace-nowrap">
                                Bloqueada
                              </span>
                            ) : (order.pendingBalanceUSD || 0) > 0.005 ? (
                              <span className="p-1 px-2.5 rounded-xl bg-black text-rose-400 font-headline font-black text-sm inline-block whitespace-nowrap shadow-md">
                                ${(order.pendingBalanceUSD || 0).toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-xs font-black bg-black/15 px-2.5 py-1 rounded-lg inline-block whitespace-nowrap">
                                Al día
                              </span>
                            )}
                          </TableCell>

                          {/* 6. Mesa */}
                          <TableCell className="py-4 whitespace-nowrap">
                            {order.tableNumber !== 'N/A' && order.tableNumber ? (
                              <span className={cn("px-3 py-1.5 rounded-xl text-xs font-black shadow-md inline-block whitespace-nowrap", rowStyle.mesaBg)}>
                                Mesa {order.tableNumber}
                              </span>
                            ) : (
                              <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg inline-block whitespace-nowrap", rowStyle.ticketBg)}>Directo</span>
                            )}
                          </TableCell>

                          {/* 7. Ticket y Hora */}
                          <TableCell className="py-4 whitespace-nowrap">
                            <div className="font-mono font-black text-sm flex items-center gap-1.5 whitespace-nowrap">
                              <span className={cn("px-2 py-0.5 rounded-lg font-black", rowStyle.ticketBg)}>
                                {order.orderNumber}
                              </span>
                            </div>
                            <div className={cn("text-[11px] flex items-center gap-1 mt-1 whitespace-nowrap", rowStyle.timeColor)}>
                              <Clock className="h-3 w-3" /> {timeStr}
                            </div>
                          </TableCell>

                          {/* 8. Botón Acción */}
                          <TableCell className="text-center py-4 whitespace-nowrap">
                            <Button size="sm" className={cn("h-8 px-3.5 text-xs font-black shadow-md rounded-xl transition-all whitespace-nowrap", rowStyle.btnAction)}>
                              Ver &rarr;
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            );
          })()}
        </div>
      </main>

      <Dialog open={isExchangeRateDialogOpen} onOpenChange={setIsExchangeRateDialogOpen}>
        <DialogContent className="max-w-sm bg-card border-border shadow-2xl w-[92vw] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-accent" /> Ajustar Tasa BS/$</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFetchBcvQuick}
              disabled={isSyncingBcv}
              className="w-full gap-2 h-10 border-primary/40 text-primary hover:bg-primary/10 text-xs font-bold"
            >
              <Landmark className={cn("h-4 w-4", isSyncingBcv && "animate-spin")} />
              {isSyncingBcv ? "Consultando BCV..." : "⚡ Traer Tasa Oficial BCV Hoy"}
            </Button>

            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-muted-foreground">Valor a Aplicar (Bolívares)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  className="h-12 text-2xl font-headline pl-4 font-bold text-foreground"
                  value={newExchangeRate}
                  onChange={(e) => setNewExchangeRate(e.target.value)}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">BS</span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setIsExchangeRateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateExchangeRate} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">Guardar Tasa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO PRINCIPAL: TOMA DE PEDIDO CON PANTALLA DIVIDIDA */}
      <Dialog open={isOrderFormOpen} onOpenChange={setIsOrderFormOpen}>
        <DialogContent className="max-w-7xl w-full h-[100dvh] lg:h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-card border-none lg:border lg:border-border lg:rounded-2xl shadow-2xl">
          <div className="p-3 lg:p-5 border-b border-border bg-muted/20 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-base sm:text-lg lg:text-2xl font-headline font-bold text-primary">
                {editingOrderId ? 'Editar Comanda' : 'Toma de Pedido'}
              </DialogTitle>
              {tableNumber && (
                <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-bold">
                  Mesa: {tableNumber}
                </span>
              )}
            </div>

            {/* SWITCHER PARA PANTALLAS MÓVILES */}
            <div className="flex lg:hidden bg-muted p-1 rounded-xl border border-border gap-1 text-xs">
              <button
                type="button"
                onClick={() => setMobileOrderTab('menu')}
                className={cn("px-3 py-1 rounded-lg font-bold transition-all", mobileOrderTab === 'menu' ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground")}
              >
                📋 Menú
              </button>
              <button
                type="button"
                onClick={() => setMobileOrderTab('cart')}
                className={cn("px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5", mobileOrderTab === 'cart' ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground")}
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                <span>Pedido ({draftItems.length})</span>
                <span className="font-black">${calculateDraftTotal().toFixed(2)}</span>
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
            {/* COLUMNA IZQUIERDA: CATÁLOGO PURO Y ESTABLE (NUNCA SE DEFORMA) */}
            <div className={cn(
              "flex-1 lg:w-[56%] flex flex-col p-3 lg:p-5 space-y-3 min-h-0 bg-background/50",
              mobileOrderTab === 'cart' && "hidden lg:flex"
            )}>
              {/* Filtros de Categoría */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Menú de Productos</span>
                
                <div className="flex bg-muted/60 p-1 rounded-xl border border-border/60 gap-1 text-xs overflow-x-auto max-w-full">
                  <button
                    type="button"
                    onClick={() => setCatalogFilter('ALL')}
                    className={cn("px-2.5 py-1 rounded-lg font-black transition-all whitespace-nowrap text-xs", catalogFilter === 'ALL' ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground")}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogFilter('COMBOS')}
                    className={cn("px-2.5 py-1 rounded-lg font-black transition-all whitespace-nowrap text-xs", catalogFilter === 'COMBOS' ? "bg-cyan-600 text-white shadow" : "text-muted-foreground hover:text-foreground")}
                  >
                    📦 Combos
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogFilter('FOOD')}
                    className={cn("px-2.5 py-1 rounded-lg font-black transition-all whitespace-nowrap text-xs", catalogFilter === 'FOOD' ? "bg-emerald-600 text-white shadow" : "text-muted-foreground hover:text-foreground")}
                  >
                    🌭 Comida
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogFilter('DRINKS')}
                    className={cn("px-2.5 py-1 rounded-lg font-black transition-all whitespace-nowrap text-xs", catalogFilter === 'DRINKS' ? "bg-amber-600 text-white shadow" : "text-muted-foreground hover:text-foreground")}
                  >
                    🥤 Bebidas / Otros
                  </button>
                </div>
              </div>

              <div className="relative shrink-0">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Buscar producto o combo..." 
                  className="h-10 pl-9 text-xs sm:text-sm rounded-xl bg-background font-medium" 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                />
              </div>
              
              {/* Grid de productos con scroll fluido */}
              <ScrollArea className="flex-1 pr-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 pb-4">
                  {filteredProducts?.map(p => {
                    const isCombo = !!p.isCombo;
                    const isDrink = isDrinkOrSimpleProduct(p);
                    return (
                      <button 
                        key={p.id} 
                        type="button"
                        className={cn(
                          "p-3 rounded-2xl border text-left transition-all hover:scale-[1.01] active:scale-[0.99] shadow-sm relative flex flex-col justify-between group min-h-[90px]",
                          isCombo 
                            ? "bg-card border-cyan-500/40 hover:border-cyan-400 hover:bg-cyan-500/5 shadow-cyan-500/5" 
                            : isDrink
                              ? "bg-card border-amber-500/30 hover:border-amber-400 hover:bg-amber-500/5 shadow-amber-500/5"
                              : "bg-card border-border hover:border-emerald-500/60 hover:bg-emerald-500/5 shadow-emerald-500/5"
                        )} 
                        onClick={() => handleAddProductDirectly(p)}
                      >
                        <div className="w-full">
                          <div className="flex justify-between items-start gap-1 mb-1.5">
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                              isCombo 
                                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40" 
                                : isDrink
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            )}>
                              {isCombo ? '📦 COMBO' : isDrink ? '🥤 DIRECTO' : '🌭 COMIDA'}
                            </span>
                            <span className="font-headline font-black text-sm text-primary shrink-0">${p.masterPriceUSD.toFixed(2)}</span>
                          </div>
                          <p className="text-xs font-headline font-black text-foreground line-clamp-2 leading-snug">{p.name}</p>
                          {p.description && <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{p.description}</p>}
                        </div>
                        <div className="pt-2 flex items-center justify-between text-[10px] font-bold text-muted-foreground group-hover:text-primary transition-colors border-t border-border/30 mt-2">
                          <span>{isCombo ? '+ Añadir Combo (Con Todo)' : '+ Añadir (+1)'}</span>
                          <Plus className="h-3 w-3" />
                        </div>
                      </button>
                    );
                  })}
                  {filteredProducts?.length === 0 && (
                    <div className="col-span-full py-12 text-center text-muted-foreground text-xs">
                      No se encontraron productos que coincidan con la búsqueda.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* COLUMNA DERECHA: CARRITO, TOTAL PLANCHA Y CONFIRMACIÓN */}
            <div className={cn(
              "flex-1 lg:w-[44%] flex flex-col p-3 lg:p-5 border-t lg:border-t-0 lg:border-l border-border bg-muted/10 min-h-0",
              mobileOrderTab === 'menu' && "hidden lg:flex"
            )}>
              <div className="grid grid-cols-2 gap-2 shrink-0 mb-3">
                <Input placeholder="Cliente (Nombre / Apodo)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-9 text-xs rounded-xl bg-background font-medium" />
                <Input placeholder="Mesa / Ubicación" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} className="h-9 text-xs rounded-xl bg-background font-medium" />
              </div>

              {/* 🔥 BANNER MAESTRO DE PRODUCCIÓN PLANCHA EN VIVO */}
              {planchaSummary.length > 0 && (
                <div className="p-3 bg-amber-500/15 border-2 border-amber-500/50 rounded-2xl mb-3 space-y-1.5 shadow-md shrink-0 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Flame className="h-4 w-4" /> TOTAL PRODUCCIÓN PLANCHA:
                    </span>
                    <span className="text-[10px] font-bold text-amber-300">Cocina</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {planchaSummary.map(ps => (
                      <span key={ps.key} className="px-2.5 py-1 rounded-xl bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-black">
                        {ps.totalQuantity}x {ps.foodName} {ps.fromCombosQuantity > 0 && ps.fromSinglesQuantity > 0 ? `(${ps.fromCombosQuantity} en Combo + ${ps.fromSinglesQuantity} Sueltos)` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <ScrollArea className="flex-1 pr-2">
                <div className="space-y-2.5 pb-2">
                  {draftItems.map((item, idx) => (
                    <div key={idx} className={cn(
                      "p-3 rounded-2xl bg-card border shadow-sm space-y-2.5",
                      item.isCombo ? "border-cyan-500/40" : "border-border/70"
                    )}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className={cn(
                            "font-headline font-black text-xs shrink-0",
                            item.isCombo ? "text-cyan-400" : "text-emerald-400"
                          )}>
                            [{item.quantity}x]
                          </span>
                          <span className="text-xs font-bold text-foreground truncate">{item.productName}</span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* CONTROLES DE CANTIDAD */}
                          <div className="flex items-center border border-border rounded-lg bg-background overflow-hidden">
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 rounded-none hover:bg-muted" onClick={() => updateDraftQuantity(idx, item.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                            <span className="w-7 text-center font-bold text-xs font-headline">{item.quantity}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 rounded-none hover:bg-muted" onClick={() => updateDraftQuantity(idx, item.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                          </div>

                          <span className="font-headline font-black text-xs min-w-[50px] text-right text-foreground">${item.subtotalUSD.toFixed(2)}</span>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10 rounded-lg" onClick={() => removeFromDraft(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>

                      {/* DESGLOSE SI ES COMBO CON RANURAS */}
                      {item.isCombo && item.comboSlots && item.comboSlots.length > 0 && (
                        <div className="pl-2 border-l-2 border-cyan-500/40 space-y-1 text-xs pt-1 bg-muted/20 p-2 rounded-xl">
                          {item.comboSlots.map((slot, sIdx) => {
                            const activeCustoms = slot.customizations?.filter(c => c.intensity !== 'normal') || [];
                            return (
                              <div key={sIdx} className="space-y-0.5">
                                <div className="font-bold text-slate-200 flex items-center gap-1.5 flex-wrap">
                                  <span className="text-cyan-400 font-extrabold">• {slot.productName}:</span>
                                  {slot.selectedOption && (
                                    <span className="text-cyan-300 font-black">({slot.selectedOption})</span>
                                  )}
                                  {activeCustoms.length === 0 && !slot.selectedOption && (
                                    <span className="text-emerald-400 font-bold text-[10px]">Con Todo</span>
                                  )}
                                </div>
                                {activeCustoms.length > 0 && (
                                  <div className="flex flex-wrap gap-1 pl-2">
                                    {activeCustoms.map((c, cIdx) => (
                                      <span key={cIdx} className={cn(
                                        "px-1.5 py-0.5 text-[9px] font-black rounded whitespace-nowrap",
                                        c.intensity === 'sin' && "bg-rose-950 text-rose-300 border border-rose-700",
                                        c.intensity === 'poco' && "bg-amber-950 text-amber-300 border border-amber-700",
                                        c.intensity === 'extra' && "bg-emerald-950 text-emerald-300 border border-emerald-600"
                                      )}>
                                        {c.intensity === 'sin' ? `❌ SIN ${c.ingredientName.toUpperCase()}` : c.intensity === 'poco' ? `🤏 POCA ${c.ingredientName.toUpperCase()}` : `➕ EXTRA ${c.ingredientName.toUpperCase()}`}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* ETIQUETAS DE PERSONALIZACIÓN SI ES PRODUCTO SUELTO */}
                      {!item.isCombo && item.customizations && item.customizations.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5 pl-1">
                          {item.customizations.map((c, cIdx) => {
                            if (c.intensity === 'sin') {
                              return (
                                <span key={cIdx} className="px-2 py-0.5 rounded-lg bg-rose-950 text-rose-300 border border-rose-600 text-[10px] font-black whitespace-nowrap">
                                  ❌ SIN {c.ingredientName.toUpperCase()}
                                </span>
                              );
                            }
                            if (c.intensity === 'poco') {
                              return (
                                <span key={cIdx} className="px-2 py-0.5 rounded-lg bg-amber-950 text-amber-300 border border-amber-600 text-[10px] font-black whitespace-nowrap">
                                  🤏 POCA {c.ingredientName.toUpperCase()}
                                </span>
                              );
                            }
                            if (c.intensity === 'extra') {
                              return (
                                <span key={cIdx} className="px-2 py-0.5 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-500 text-[10px] font-black whitespace-nowrap">
                                  ➕ EXTRA {c.ingredientName.toUpperCase()}
                                </span>
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}

                      {item.notes && <p className="text-[10px] text-muted-foreground italic pl-1">📝 {item.notes}</p>}

                      {/* BOTÓN DE PERSONALIZACIÓN DESDE EL CARRITO */}
                      {(item.isCombo || (item.customizations && item.customizations.length > 0)) && (
                        <div className="pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn(
                              "h-7 px-3 rounded-xl text-xs font-bold w-full justify-center transition-all",
                              item.isCombo 
                                ? "border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/15" 
                                : "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15"
                            )}
                            onClick={() => handleOpenCustomizeCartItem(idx)}
                          >
                            <Pencil className="h-3 w-3 mr-1.5" />
                            {item.isCombo ? "Personalizar Ranuras / Sabores" : "Personalizar Ingredientes"}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {draftItems.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground text-xs">
                      Selecciona combos o productos del menú para armar la comanda.
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="pt-3 border-t mt-auto space-y-2 shrink-0">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Total Comanda</span>
                    <span className="text-xs font-bold text-muted-foreground">
                      {formatBS(convertUsdToBs(calculateDraftTotal(), currentExchangeRate))}
                    </span>
                  </div>
                  <span className="text-2xl font-black text-primary font-headline">${calculateDraftTotal().toFixed(2)}</span>
                </div>
                <Button 
                  className="w-full h-11 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg text-sm" 
                  onClick={handleSaveOrder}
                  disabled={draftItems.length === 0}
                >
                  Confirmar Pedido &rarr;
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* SUB-MODAL ENFOCADO: WIZARD DE COMBO */}
      <Dialog open={!!configuringCombo} onOpenChange={(open) => { if (!open) { setConfiguringCombo(null); setEditingDraftIndex(null); setComboSlotsDraft([]); setComboNotes(""); } }}>
        <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-card border border-cyan-500/50 rounded-2xl shadow-2xl z-50">
          <DialogHeader className="p-4 border-b border-border bg-muted/20 flex flex-row items-center justify-between shrink-0">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-black uppercase">
                  📦 PERSONALIZAR COMBO
                </span>
              </div>
              <DialogTitle className="text-base sm:text-lg font-headline font-black text-foreground">
                {configuringCombo?.name}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">Personaliza cada una de las ranuras incluidas</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Precio Fijo</span>
              <span className="text-xl font-headline font-black text-cyan-400">
                ${configuringCombo?.masterPriceUSD.toFixed(2)}
              </span>
            </div>
          </DialogHeader>

          <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
            {/* Botones de Navegación por Ranura */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-foreground block">Ranuras incluidas ({comboSlotsDraft.length}):</span>
              <div className="flex flex-wrap gap-1.5">
                {comboSlotsDraft.map((slot, sIdx) => {
                  const isSelected = activeSlotIndex === sIdx;
                  const hasCustomizations = slot.customizations?.some(c => c.intensity !== 'normal');
                  return (
                    <button
                      key={slot.slotId}
                      type="button"
                      onClick={() => setActiveSlotIndex(sIdx)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 border",
                        isSelected 
                          ? "bg-cyan-600 text-white border-cyan-500 shadow-md scale-[1.02]" 
                          : "bg-muted text-muted-foreground border-border hover:bg-muted/80 hover:text-foreground"
                      )}
                    >
                      <span>#{sIdx + 1} {slot.productName.split('(')[0].trim()}</span>
                      {hasCustomizations && (
                        <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Contenido de la Ranura Activa */}
            {comboSlotsDraft[activeSlotIndex] && (() => {
              const activeSlot = comboSlotsDraft[activeSlotIndex];
              const isDrink = !!activeSlot.selectedOption || 
                activeSlot.productName.toLowerCase().includes('refresco') || 
                activeSlot.productName.toLowerCase().includes('bebida') || 
                activeSlot.productName.toLowerCase().includes('jugo') ||
                activeSlot.productName.toLowerCase().includes('cerveza') ||
                activeSlot.productName.toLowerCase().includes('coca');

              return (
                <div className="p-3.5 bg-muted/20 border border-border/60 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center border-b border-border/40 pb-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-cyan-400">Ranura Activa #{activeSlotIndex + 1}</span>
                      <h5 className="text-sm font-black text-foreground">{activeSlot.productName}</h5>
                    </div>

                    {/* Botones rápidos */}
                    {!isDrink && (
                      <div className="flex items-center gap-1.5">
                        {activeSlotIndex > 0 && (
                          <button
                            type="button"
                            onClick={() => copyCustomizationFromSlot(activeSlotIndex, 0)}
                            className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-black hover:bg-cyan-500/30 border border-cyan-500/40"
                          >
                            = Igual al #{activeSlotIndex}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setAllSlotIngredients(activeSlotIndex, 'normal')}
                          className="px-2.5 py-1 rounded-lg bg-muted text-xs font-black text-foreground hover:bg-muted/80 border border-border"
                        >
                          Con Todo
                        </button>
                        <button
                          type="button"
                          onClick={() => setAllSlotIngredients(activeSlotIndex, 'sin')}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-black hover:bg-rose-500/30 border border-rose-500/40"
                        >
                          Sin Nada
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Si es bebida */}
                  {isDrink ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground">Sabor / Presentación de Bebida:</Label>
                      <select
                        value={activeSlot.selectedOption || 'Coca-Cola 1.5L'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setComboSlotsDraft(prev => {
                            const up = [...prev];
                            up[activeSlotIndex] = { ...up[activeSlotIndex], selectedOption: val };
                            return up;
                          });
                        }}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-bold text-foreground focus:outline-none focus:border-cyan-500"
                      >
                        <option value="Coca-Cola 1.5L">Coca-Cola 1.5L</option>
                        <option value="Frescolita 1.5L">Frescolita 1.5L</option>
                        <option value="Chinotto 1.5L">Chinotto 1.5L</option>
                        <option value="Hit Naranja 1.5L">Hit Naranja 1.5L</option>
                        <option value="Té Frío Limón">Té Frío Limón</option>
                        <option value="Agua Mineral">Agua Mineral</option>
                      </select>
                    </div>
                  ) : (
                    /* Si es comida */
                    activeSlot.customizations && activeSlot.customizations.length > 0 && (
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1.5 border border-border/40 rounded-xl p-1 bg-background/50">
                        {activeSlot.customizations.map((ing, ingIdx) => (
                          <div key={ingIdx} className="flex items-center justify-between p-2 rounded-xl bg-muted/20 border border-border/60 text-xs">
                            <span className={cn(
                              "font-bold truncate max-w-[140px] sm:max-w-[200px]",
                              ing.intensity === 'sin' && "line-through text-rose-400",
                              ing.intensity === 'poco' && "text-amber-300",
                              ing.intensity === 'extra' && "text-emerald-400 font-black",
                              ing.intensity === 'normal' && "text-foreground"
                            )}>
                              {ing.ingredientName}
                            </span>
                            <div className="flex items-center gap-1 bg-background p-0.5 rounded-lg border border-border shadow-inner">
                              <button
                                type="button"
                                onClick={() => updateSlotIngredientIntensity(activeSlotIndex, ingIdx, 'sin')}
                                className={cn(
                                  "px-2 py-1 rounded text-[10px] font-black transition-all",
                                  ing.intensity === 'sin' ? "bg-rose-600 text-white shadow" : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                Sin
                              </button>
                              <button
                                type="button"
                                onClick={() => updateSlotIngredientIntensity(activeSlotIndex, ingIdx, 'poco')}
                                className={cn(
                                  "px-2 py-1 rounded text-[10px] font-black transition-all",
                                  ing.intensity === 'poco' ? "bg-amber-600 text-white shadow" : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                Poco
                              </button>
                              <button
                                type="button"
                                onClick={() => updateSlotIngredientIntensity(activeSlotIndex, ingIdx, 'normal')}
                                className={cn(
                                  "px-2 py-1 rounded text-[10px] font-black transition-all",
                                  ing.intensity === 'normal' ? "bg-slate-700 text-white shadow" : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                Normal
                              </button>
                              <button
                                type="button"
                                onClick={() => updateSlotIngredientIntensity(activeSlotIndex, ingIdx, 'extra')}
                                className={cn(
                                  "px-2 py-1 rounded text-[10px] font-black transition-all",
                                  ing.intensity === 'extra' ? "bg-emerald-600 text-white shadow" : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                +Extra
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              );
            })()}

            <Input
              className="h-9 text-xs rounded-xl bg-background"
              value={comboNotes}
              onChange={(e) => setComboNotes(e.target.value)}
              placeholder="Nota general del combo (ej: para llevar, salsas aparte)..."
            />
          </div>

          <DialogFooter className="p-4 border-t border-border bg-muted/20 flex flex-row items-center justify-between gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 text-xs font-bold text-muted-foreground"
              onClick={() => { setConfiguringCombo(null); setEditingDraftIndex(null); setComboSlotsDraft([]); setComboNotes(""); }}
            >
              Cancelar
            </Button>

            <Button
              type="button"
              size="sm"
              className="h-10 px-5 text-xs font-black rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg"
              onClick={saveCustomizedCartItem}
            >
              ✓ Guardar Personalización
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SUB-MODAL ENFOCADO: PERSONALIZACIÓN DE PRODUCTO INDIVIDUAL */}
      <Dialog open={!!configuringProduct} onOpenChange={(open) => { if (!open) { setConfiguringProduct(null); setEditingDraftIndex(null); setConfigQuantity(1); setConfigNotes(""); setConfigIngredients([]); } }}>
        <DialogContent className="max-w-lg w-full max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-card border border-emerald-500/50 rounded-2xl shadow-2xl z-50">
          <DialogHeader className="p-4 border-b border-border bg-muted/20 flex flex-row items-center justify-between shrink-0">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase">
                  🌭 PERSONALIZAR COMIDA
                </span>
              </div>
              <DialogTitle className="text-base sm:text-lg font-headline font-black text-foreground">
                {configuringProduct?.name}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">${configuringProduct?.masterPriceUSD.toFixed(2)} c/u</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Subtotal</span>
              <span className="text-xl font-headline font-black text-emerald-400">
                ${((configuringProduct?.masterPriceUSD || 0) * configQuantity).toFixed(2)}
              </span>
            </div>
          </DialogHeader>

          <div className="p-4 space-y-3.5 overflow-y-auto flex-1 min-h-0">
            {/* Selector de Cantidad */}
            <div className="flex items-center justify-between bg-muted/40 p-3 rounded-2xl border border-border/60">
              <span className="text-xs font-bold text-foreground">Cantidad de este lote:</span>
              <div className="flex items-center border border-border rounded-xl bg-background overflow-hidden shadow-sm">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-none hover:bg-muted"
                  onClick={() => setConfigQuantity(prev => Math.max(1, prev - 1))}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="w-10 text-center font-bold text-sm font-headline">
                  {configQuantity}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-none hover:bg-muted"
                  onClick={() => setConfigQuantity(prev => prev + 1)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Ingredientes de la Receta */}
            {configIngredients.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground">Ingredientes de la Receta:</Label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAllIngredientsIntensity('normal')}
                      className="px-2.5 py-1 rounded-lg bg-muted text-xs font-black text-foreground hover:bg-muted/80 border border-border"
                    >
                      Con Todo
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllIngredientsIntensity('sin')}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-black hover:bg-rose-500/30 border border-rose-500/40"
                    >
                      Sin Nada
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1.5 border border-border/40 rounded-2xl p-1.5 bg-background/50">
                  {configIngredients.map((ing, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-muted/20 border border-border/60 text-xs">
                      <span className={cn(
                        "font-bold truncate max-w-[130px] sm:max-w-[160px]",
                        ing.intensity === 'sin' && "line-through text-rose-400",
                        ing.intensity === 'poco' && "text-amber-300",
                        ing.intensity === 'extra' && "text-emerald-400 font-black",
                        ing.intensity === 'normal' && "text-foreground"
                      )}>
                        {ing.ingredientName}
                      </span>
                      <div className="flex items-center gap-1 bg-background p-0.5 rounded-lg border border-border shadow-inner">
                        <button
                          type="button"
                          onClick={() => setIngredientIntensity(idx, 'sin')}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] font-black transition-all",
                            ing.intensity === 'sin' ? "bg-rose-600 text-white shadow" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Sin
                        </button>
                        <button
                          type="button"
                          onClick={() => setIngredientIntensity(idx, 'poco')}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] font-black transition-all",
                            ing.intensity === 'poco' ? "bg-amber-600 text-white shadow" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Poco
                        </button>
                        <button
                          type="button"
                          onClick={() => setIngredientIntensity(idx, 'normal')}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] font-black transition-all",
                            ing.intensity === 'normal' ? "bg-slate-700 text-white shadow" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Normal
                        </button>
                        <button
                          type="button"
                          onClick={() => setIngredientIntensity(idx, 'extra')}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] font-black transition-all",
                            ing.intensity === 'extra' ? "bg-emerald-600 text-white shadow" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          +Extra
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Input
              className="h-9 text-xs rounded-xl bg-background"
              value={configNotes}
              onChange={(e) => setConfigNotes(e.target.value)}
              placeholder="Comentario o nota especial (ej: salsa aparte, pan bien tostado)..."
            />
          </div>

          <DialogFooter className="p-4 border-t border-border bg-muted/20 flex flex-row items-center justify-between gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 text-xs font-bold text-muted-foreground"
              onClick={() => { setConfiguringProduct(null); setEditingDraftIndex(null); setConfigQuantity(1); setConfigNotes(""); setConfigIngredients([]); }}
            >
              Cancelar
            </Button>

            <Button
              type="button"
              size="sm"
              className="h-10 px-5 text-xs font-black rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md"
              onClick={saveCustomizedCartItem}
            >
              ✓ Guardar Personalización
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl bg-card border-border shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="sr-only"><DialogTitle>Detalle de Comanda</DialogTitle></DialogHeader>
          {selectedOrder ? (
            (() => {
              const isCancelled = selectedOrder.status === 'CANCELLED';
              const isPaid = !isCancelled && (selectedOrder.status === 'PAID' || (selectedOrder.pendingBalanceUSD !== undefined && selectedOrder.pendingBalanceUSD <= 0.005));
              const isPartial = !isCancelled && !isPaid && (selectedOrder.totalPaidUSD || 0) > 0.005;

              return (
                <div className="flex flex-col h-[100dvh] lg:h-auto">
                  <div className="p-3 lg:p-6 border-b border-border bg-muted/20 flex justify-between items-center shrink-0">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isCancelled ? (
                          <Badge className="px-2.5 py-1 text-xs font-black bg-destructive/20 text-destructive border border-destructive/40 whitespace-nowrap">
                            COMANDA BLOQUEADA / ANULADA
                          </Badge>
                        ) : (
                          <>
                            {/* Badge de Cocina */}
                            {(() => {
                              const k = selectedOrder.kitchenStatus || (isPaid ? 'DELIVERED' : 'PENDING');
                              if (k === 'IN_PREPARATION') {
                                return <Badge className="px-2 py-0.5 text-[9px] font-bold bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse whitespace-nowrap">2. EN COCINA</Badge>;
                              }
                              if (k === 'DELIVERED') {
                                return <Badge className="px-2 py-0.5 text-[9px] font-bold bg-purple-500/20 text-purple-400 border-purple-500/30 whitespace-nowrap">3. ENTREGADO</Badge>;
                              }
                              return <Badge className="px-2 py-0.5 text-[9px] font-bold bg-amber-500/20 text-amber-400 border-amber-500/30 whitespace-nowrap">1. EN ESPERA</Badge>;
                            })()}

                            {/* Badge de Cobro */}
                            <Badge className={cn("px-2 py-0.5 text-[9px] font-bold whitespace-nowrap", isPaid ? 'bg-green-500/20 text-green-400' : isPartial ? 'bg-amber-500/20 text-amber-300' : 'bg-destructive/20 text-destructive')}>
                              {isPaid ? 'PAGADA' : isPartial ? 'ABONO PARCIAL' : 'SIN PAGAR'}
                            </Badge>
                          </>
                        )}
                      </div>
                      <div className={cn("text-lg lg:text-2xl font-headline font-bold", isCancelled && "line-through text-muted-foreground")}>
                        {selectedOrder.customerNotes}
                      </div>
                      <p className="text-[10px] lg:text-xs text-muted-foreground">Mesa: {selectedOrder.tableNumber} | Ticket: {selectedOrder.orderNumber}</p>
                    </div>
                    <div className="flex gap-2">
                      {!isPaid && !isCancelled && (
                        <Button variant="outline" size="icon" className="h-7 w-7 lg:h-9 lg:w-9" onClick={handleEditOrder}>
                          <Pencil className="h-3 w-3 lg:h-4 lg:w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                    <div className="flex-1 lg:w-2/3 p-2 lg:p-6 border-b lg:border-b-0 lg:border-r border-border flex flex-col overflow-hidden space-y-3">
                      
                      {/* BANNER DE MOTIVO DE BLOQUEO (SI ESTÁ CANCELADA) */}
                      {isCancelled && (
                        <div className="p-3.5 rounded-2xl bg-destructive/15 border-2 border-destructive/40 text-destructive space-y-1.5 shrink-0 shadow-sm">
                          <div className="flex items-center gap-2 font-black text-sm text-destructive">
                            <Ban className="h-4 w-4" />
                            <span>INFORMACIÓN DE BLOQUEO</span>
                          </div>
                          <div className="text-xs text-foreground font-semibold">
                            <span className="text-muted-foreground font-normal">Motivo: </span>
                            {selectedOrder.cancelReason || "Sin motivo especificado"}
                          </div>
                          {selectedOrder.cancelledByName && (
                            <div className="text-[11px] text-muted-foreground">
                              Bloqueada por: <span className="font-bold text-foreground">{selectedOrder.cancelledByName}</span>
                              {selectedOrder.cancelledAt?.seconds && ` · ${format(new Date(selectedOrder.cancelledAt.seconds * 1000), 'dd/MM/yyyy hh:mm a')}`}
                            </div>
                          )}
                        </div>
                      )}

                      {/* CONTROL DE ESTADO DE COCINA (3 PASOS REALES) */}
                      {!isCancelled && (
                        <div className="bg-muted/40 p-3 rounded-2xl border border-border/80 space-y-2 shrink-0">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <ChefHat className="h-3.5 w-3.5 text-primary" /> Estado del Pedido
                            </span>
                            <span className="text-xs font-bold text-primary">
                              {(selectedOrder.kitchenStatus || 'PENDING') === 'IN_PREPARATION' ? '🔥 En Cocina (Dictado)' :
                               selectedOrder.kitchenStatus === 'DELIVERED' ? '🍽️ Entregado al Cliente' :
                               '⏳ En Espera (Por Dictar)'}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdateKitchenStatus(selectedOrder.id, 'PENDING')}
                              className={cn(
                                "py-2.5 px-1 text-xs font-bold rounded-xl border transition-all text-center flex flex-col items-center gap-1",
                                (selectedOrder.kitchenStatus || 'PENDING') === 'PENDING' 
                                  ? "bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-sm font-extrabold" 
                                  : "bg-card text-muted-foreground border-border hover:bg-muted"
                              )}
                            >
                              <Hourglass className="h-4 w-4" />
                              <span>1. En Espera</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateKitchenStatus(selectedOrder.id, 'IN_PREPARATION')}
                              className={cn(
                                "py-2.5 px-1 text-xs font-bold rounded-xl border transition-all text-center flex flex-col items-center gap-1",
                                selectedOrder.kitchenStatus === 'IN_PREPARATION' 
                                  ? "bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-sm animate-pulse font-extrabold" 
                                  : "bg-card text-muted-foreground border-border hover:bg-muted"
                              )}
                            >
                              <Flame className="h-4 w-4" />
                              <span>2. En Cocina</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateKitchenStatus(selectedOrder.id, 'DELIVERED')}
                              className={cn(
                                "py-2.5 px-1 text-xs font-bold rounded-xl border transition-all text-center flex flex-col items-center gap-1",
                                selectedOrder.kitchenStatus === 'DELIVERED' 
                                  ? "bg-purple-500/20 text-purple-400 border-purple-500/50 shadow-sm font-extrabold" 
                                  : "bg-card text-muted-foreground border-border hover:bg-muted"
                              )}
                            >
                              <CheckCheck className="h-4 w-4" />
                              <span>3. Entregado</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 🔥 BANNER MAESTRO DE PRODUCCIÓN PLANCHA EN VIVO PARA COCINA */}
                      {selectedOrderPlanchaSummary && selectedOrderPlanchaSummary.length > 0 && (
                        <div className="p-3 bg-amber-500/15 border-2 border-amber-500/50 rounded-2xl mb-2 space-y-1.5 shadow-sm shrink-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                              <Flame className="h-4 w-4" /> TOTAL PRODUCCIÓN PLANCHA:
                            </span>
                            <span className="text-[10px] font-bold text-amber-300">Cocina</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedOrderPlanchaSummary.map(ps => (
                              <span key={ps.key} className="px-2.5 py-1 rounded-xl bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-black">
                                {ps.totalQuantity}x {ps.foodName} {ps.fromCombosQuantity > 0 && ps.fromSinglesQuantity > 0 ? `(${ps.fromCombosQuantity} en Combo + ${ps.fromSinglesQuantity} Sueltos)` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <h4 className="text-[10px] lg:text-xs font-bold text-muted-foreground uppercase shrink-0">Consumo</h4>
                      <ScrollArea className="flex-1 pr-2 lg:pr-4">
                        <div className="space-y-2 pb-2">
                          {selectedOrderItems?.map((item: any) => (
                            <div key={item.id} className={cn(
                              "p-2.5 lg:p-3 rounded-xl border bg-card space-y-1.5 shadow-sm",
                              item.isCombo ? "border-cyan-500/40" : "border-border/70"
                            )}>
                              <div className="flex items-center justify-between">
                                <div className="font-bold text-xs lg:text-sm flex items-center gap-1.5 lg:gap-2">
                                  <Badge variant="secondary" className={cn(
                                    "h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px] font-black",
                                    item.isCombo && "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                                  )}>
                                    {item.quantity}
                                  </Badge>
                                  <span className={cn("font-headline font-black", isCancelled && "line-through text-muted-foreground")}>{item.productName}</span>
                                </div>
                                <span className={cn("font-headline font-black text-xs lg:text-sm", isCancelled && "line-through text-muted-foreground")}>${item.subtotalUSD?.toFixed(2)}</span>
                              </div>

                              {/* DESGLOSE DE RANURAS SI ES COMBO */}
                              {item.isCombo && item.comboSlots && item.comboSlots.length > 0 && (
                                <div className="pl-2 border-l-2 border-cyan-500/40 space-y-1.5 text-xs pt-1 mt-1 bg-muted/20 p-2 rounded-xl">
                                  {item.comboSlots.map((slot: any, sIdx: number) => {
                                    const activeCustoms = slot.customizations?.filter((c: any) => c.intensity !== 'normal') || [];
                                    return (
                                      <div key={sIdx} className="space-y-0.5">
                                        <div className="font-bold text-slate-200 flex items-center gap-1.5 flex-wrap">
                                          <span className="text-cyan-400 font-extrabold">• {slot.productName}:</span>
                                          {slot.selectedOption && (
                                            <span className="text-cyan-300 font-black">({slot.selectedOption})</span>
                                          )}
                                          {activeCustoms.length === 0 && !slot.selectedOption && (
                                            <span className="text-emerald-400 font-bold text-[10px]">Con Todo</span>
                                          )}
                                        </div>
                                        {activeCustoms.length > 0 && (
                                          <div className="flex flex-wrap gap-1 pl-2">
                                            {activeCustoms.map((c: any, cIdx: number) => (
                                              <span key={cIdx} className={cn(
                                                "px-1.5 py-0.5 text-[9px] font-black rounded whitespace-nowrap",
                                                c.intensity === 'sin' && "bg-rose-950 text-rose-300 border border-rose-700",
                                                c.intensity === 'poco' && "bg-amber-950 text-amber-300 border border-amber-700",
                                                c.intensity === 'extra' && "bg-emerald-950 text-emerald-300 border border-emerald-600"
                                              )}>
                                                {c.intensity === 'sin' ? `❌ SIN ${c.ingredientName.toUpperCase()}` : c.intensity === 'poco' ? `🤏 POCA ${c.ingredientName.toUpperCase()}` : `➕ EXTRA ${c.ingredientName.toUpperCase()}`}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* ETIQUETAS DE PERSONALIZACIÓN PARA PRODUCTO SUELTO */}
                              {!item.isCombo && item.customizations && item.customizations.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {item.customizations.map((c: any, cIdx: number) => {
                                    if (c.intensity === 'sin') {
                                      return (
                                        <span key={cIdx} className="px-2 py-0.5 rounded-lg bg-rose-950 text-rose-300 border border-rose-600 text-[10px] font-black whitespace-nowrap">
                                          ❌ SIN {c.ingredientName.toUpperCase()}
                                        </span>
                                      );
                                    }
                                    if (c.intensity === 'poco') {
                                      return (
                                        <span key={cIdx} className="px-2 py-0.5 rounded-lg bg-amber-950 text-amber-300 border border-amber-600 text-[10px] font-black whitespace-nowrap">
                                          🤏 POCA {c.ingredientName.toUpperCase()}
                                        </span>
                                      );
                                    }
                                    if (c.intensity === 'extra') {
                                      return (
                                        <span key={cIdx} className="px-2 py-0.5 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-500 text-[10px] font-black whitespace-nowrap">
                                          ➕ EXTRA {c.ingredientName.toUpperCase()}
                                        </span>
                                      );
                                    }
                                    return null;
                                  })}
                                </div>
                              )}

                              {item.notes && (
                                <p className="text-[10px] text-muted-foreground italic pl-1">
                                  📝 {item.notes}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>

                    <div className="flex-1 lg:w-1/3 bg-muted/5 p-2 lg:p-6 flex flex-col gap-2 lg:gap-6 overflow-hidden">
                      <div className="space-y-2 lg:space-y-4 shrink-0">
                        <h4 className="text-[10px] lg:text-xs font-bold text-muted-foreground uppercase">Resumen Financiero</h4>
                        <div className="space-y-1 lg:space-y-2">
                          <div className="flex justify-between text-[10px] lg:text-xs">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span className={cn("font-bold", isCancelled ? "line-through text-muted-foreground" : "")}>${selectedOrder.totalUSD?.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-[10px] lg:text-xs">
                            <span className="text-green-400">Total Pagado</span>
                            <span className="font-bold text-green-400">${selectedOrder.totalPaidUSD?.toFixed(2) || '0.00'}</span>
                          </div>
                          <div className="flex justify-between items-center pt-1 lg:pt-2 border-t border-border">
                            <span className="text-xs lg:text-sm font-bold">Pnd. por Cobrar</span>
                            <span className="text-lg lg:text-2xl font-headline font-bold text-primary">${isCancelled ? '0.00' : selectedOrder.pendingBalanceUSD?.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      {selectedOrderPayments && selectedOrderPayments.length > 0 && (
                        <div className="flex-1 flex flex-col space-y-1 lg:space-y-2 overflow-hidden">
                          <h4 className="text-[9px] lg:text-[10px] font-bold text-muted-foreground uppercase shrink-0">Abonos Realizados</h4>
                          <ScrollArea className="flex-1">
                            <div className="space-y-1 lg:space-y-1.5 pr-2">
                              {selectedOrderPayments.map((p: any) => {
                                const isBsMethod = ['PAGO_MOVIL', 'TRANSFERENCIA', 'PUNTO', 'EFECTIVO_BS'].includes(p.paymentMethod);
                                return (
                                  <div key={p.id} className="p-1.5 lg:p-2 rounded bg-card border border-border text-[9px] lg:text-[10px] flex justify-between items-center">
                                    <div className="flex flex-col">
                                      <span className="font-bold text-muted-foreground">{p.paymentMethod}</span>
                                      {p.reference && <span className="text-[8px] text-accent">Ref: {p.reference}</span>}
                                    </div>
                                    <div className="text-right">
                                      {isBsMethod ? (
                                        <>
                                          <p className="font-bold text-foreground">{p.amountBS ? p.amountBS.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"} BS</p>
                                          <p className="text-[8px] text-muted-foreground font-bold">~ ${p.amountUSD ? p.amountUSD.toFixed(2) : "0.00"}</p>
                                        </>
                                      ) : (
                                        <p className="font-bold text-foreground">${p.amountUSD ? p.amountUSD.toFixed(2) : "0.00"}</p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </ScrollArea>
                        </div>
                      )}

                      <div className="space-y-2 mt-auto shrink-0 pt-2">
                        {isCancelled ? (
                          <div className="space-y-2">
                            <Button
                              className="w-full h-11 lg:h-12 gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-headline text-xs lg:text-sm font-black shadow-lg rounded-xl"
                              onClick={handleUnblockOrder}
                              disabled={isUnblockingOrder}
                            >
                              <Unlock className="h-4 w-4 lg:h-5 lg:w-5" />
                              {isUnblockingOrder ? "Desbloqueando..." : "🔓 Desbloquear y Reactivar Comanda"}
                            </Button>
                            <p className="text-[10px] text-center text-muted-foreground">
                              Al reactivar, los insumos volverán a descontarse del inventario y la comanda subirá al tablero activo.
                            </p>
                          </div>
                        ) : (
                          <>
                            <Button 
                              className="w-full h-9 lg:h-12 gap-1 lg:gap-2 font-headline text-xs lg:text-sm" 
                              onClick={handleOpenPayment}
                              disabled={isPaid}
                            >
                              <CircleDollarSign className="h-4 w-4 lg:h-5 lg:w-5" /> Registrar Cobro
                            </Button>

                            <Button
                              variant="outline"
                              className="w-full h-8 lg:h-10 gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30 hover:border-destructive/60 text-xs font-bold"
                              onClick={() => setIsCancelDialogOpen(true)}
                            >
                              <Ban className="h-4 w-4" /> Bloquear / Anular Comanda
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="p-12 text-center text-muted-foreground animate-pulse">Cargando detalle...</div>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOGO DE CONFIRMACIÓN: ANULAR / CANCELAR COMANDA */}
      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent className="bg-card border-border max-w-md w-[92vw] rounded-2xl shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive text-lg font-headline">
              <AlertTriangle className="h-5 w-5 text-destructive" /> ¿Anular Comanda Definitivamente?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Estás a punto de anular la comanda <b>{selectedOrder?.orderNumber}</b> ({selectedOrder?.customerNotes} - Mesa {selectedOrder?.tableNumber}).
              <br /><br />
              <span className="text-foreground font-semibold">🔄 Reintegro Automático:</span> Todos los insumos descontados en cocina serán <b>devueltos al inventario</b> de la sucursal de forma inmediata.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Motivo de Anulación</Label>
            <Select value={cancelReason} onValueChange={setCancelReason}>
              <SelectTrigger className="h-10 text-xs bg-background border-border rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Error de digitación / Comanda duplicada">Error de digitación / Comanda duplicada</SelectItem>
                <SelectItem value="Cliente se retiró del local">Cliente se retiró del local</SelectItem>
                <SelectItem value="Insumos no disponibles / Problema en cocina">Insumos no disponibles / Problema en cocina</SelectItem>
                <SelectItem value="Cambio de mesa o pedido">Cambio de mesa o pedido</SelectItem>
                <SelectItem value="Otro motivo">Otro motivo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={isCancellingOrder}>No, mantener comanda</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold text-xs" 
              onClick={handleConfirmCancelOrder}
              disabled={isCancellingOrder}
            >
              {isCancellingOrder ? "Anulando..." : "Sí, Anular y Devolver Stock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DIALOGO: PROCESAR PAGO / ABONO */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="max-w-md bg-card border-border shadow-2xl p-4 lg:p-6 w-[92vw] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg lg:text-xl">
              <DollarSign className="h-5 w-5 text-primary" /> Registrar Pago / Abono
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (() => {
            const pendingUSD = round2(selectedOrder.pendingBalanceUSD || 0);
            const pendingBS = convertUsdToBs(pendingUSD, currentExchangeRate);
            const inputVal = parseFloat(paymentAmount) || 0;

            return (
              <div className="space-y-4 lg:space-y-5 py-2">
                {/* Tarjeta de Saldo Pendiente Adaptativa a la Moneda */}
                <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-center space-y-1 shadow-sm">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      {paymentCurrency === "BS" ? "Saldo Pendiente en Bolívares" : "Saldo Pendiente en Divisas"}
                    </span>
                    <Badge variant="outline" className="text-[9px] font-bold border-primary/30 text-primary">
                      Tasa: {currentExchangeRate.toFixed(2)} BS/$
                    </Badge>
                  </div>

                  {paymentCurrency === "BS" ? (
                    <div>
                      <p className="text-2xl sm:text-3xl lg:text-4xl font-headline font-bold text-primary">
                        {formatBS(pendingBS)}
                      </p>
                      <p className="text-xs text-muted-foreground font-bold mt-0.5">
                        Equivalente exacto a {formatUSD(pendingUSD)}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-2xl sm:text-3xl lg:text-4xl font-headline font-bold text-primary">
                        {formatUSD(pendingUSD)}
                      </p>
                      <p className="text-xs text-muted-foreground font-bold mt-0.5">
                        Equivalente a {formatBS(pendingBS)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Selector de Moneda y Monto */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] lg:text-xs font-bold uppercase text-muted-foreground">Monto a Cobrar</Label>
                    {/* Botones de Montos Rápidos */}
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentAmount(paymentCurrency === 'BS' ? pendingBS.toFixed(2) : pendingUSD.toFixed(2));
                        }}
                        className="px-2 py-0.5 rounded-md bg-muted hover:bg-primary/20 hover:text-primary text-[10px] font-bold text-muted-foreground transition-all"
                      >
                        100% Total
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentAmount(paymentCurrency === 'BS' ? round2(pendingBS / 2).toFixed(2) : round2(pendingUSD / 2).toFixed(2));
                        }}
                        className="px-2 py-0.5 rounded-md bg-muted hover:bg-primary/20 hover:text-primary text-[10px] font-bold text-muted-foreground transition-all"
                      >
                        50% Mitad
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Select value={paymentCurrency} onValueChange={(v: any) => handleChangePaymentCurrency(v)}>
                      <SelectTrigger className="w-24 lg:w-28 h-12 text-sm lg:text-base font-bold bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BS" className="font-bold">🇻🇪 BS</SelectItem>
                        <SelectItem value="USD" className="font-bold">💵 $ USD</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="relative flex-1">
                      <Input 
                        type="number"
                        step="any"
                        inputMode="decimal"
                        className="h-12 text-xl lg:text-2xl font-headline pl-3 pr-12 font-bold bg-background"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground uppercase">
                        {paymentCurrency}
                      </span>
                    </div>
                  </div>

                  {/* Subtexto Informativo en Vivo para el Cajero */}
                  <div className="p-2 rounded-lg bg-muted/30 border border-border text-[11px] font-bold flex justify-between items-center text-muted-foreground">
                    <span>
                      {paymentCurrency === "BS" ? "Descontará de la deuda:" : "Cobrará en Bolívares:"}
                    </span>
                    <span className="text-foreground font-headline text-xs font-bold">
                      {paymentCurrency === "BS" 
                        ? formatUSD(convertBsToUsd(inputVal, currentExchangeRate, pendingUSD))
                        : formatBS(convertUsdToBs(inputVal, currentExchangeRate))
                      }
                    </span>
                  </div>
                </div>

                {/* Selector de Método de Cobro */}
                <div className="space-y-1.5 lg:space-y-2">
                  <Label className="text-[10px] lg:text-xs font-bold uppercase text-muted-foreground">Método de Pago</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 lg:gap-2">
                    {PAYMENT_METHODS.map(method => (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => handleSelectPaymentMethod(method.id)}
                        className={cn(
                          "flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all text-left",
                          paymentMethod === method.id 
                            ? "bg-primary/20 border-primary text-primary shadow-sm" 
                            : "bg-card border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <method.icon className="h-4 w-4 shrink-0" />
                        <span className="line-clamp-1">{method.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Campos Opcionales para Pago Móvil / Transferencia */}
                {(paymentMethod === 'PAGO_MOVIL' || paymentMethod === 'TRANSFERENCIA') && (
                  <div className="grid grid-cols-2 gap-2 animate-in slide-in-from-top-2 pt-1 bg-muted/20 p-2.5 rounded-xl border border-border">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Teléfono Emisor</Label>
                      <Input 
                        placeholder="Ej. 04141234567" 
                        className="h-9 text-xs bg-background font-bold" 
                        value={paymentPhone} 
                        onChange={(e) => setPaymentPhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Referencia / Comprobante</Label>
                      <Input 
                        placeholder="Últimos 4 o 6 dígitos" 
                        className="h-9 text-xs bg-background font-bold" 
                        value={paymentReference} 
                        onChange={(e) => setPaymentReference(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="ghost" onClick={() => setIsPaymentDialogOpen(false)} className="flex-1 h-11 text-xs font-bold">
              Cancelar
            </Button>
            <Button 
              onClick={processPayment} 
              className="flex-[2] h-11 text-xs font-bold font-headline bg-primary hover:bg-primary/90 shadow-lg" 
              disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
            >
              Confirmar Abono
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
