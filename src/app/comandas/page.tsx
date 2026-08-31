"use client";

import { useState, useEffect } from 'react';
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
  Loader2
} from 'lucide-react';
import { fetchOfficialRates } from '@/lib/dolar-api';
import { Input } from '@/components/ui/input';
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
  isCombo?: boolean;
  comboItems?: any[];
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
    const dateA = a.orderDate?.seconds || 0;
    const dateB = b.orderDate?.seconds || 0;
    return dateB - dateA;
  });

  const productsQuery = useMemoFirebase(() => collection(firestore, 'products'), [firestore]);
  const { data: products } = useCollection(productsQuery);

  const inventoryQuery = useMemoFirebase(() => {
    if (!activeLocationId) return null;
    return collection(firestore, 'locations', activeLocationId, 'inventory');
  }, [firestore, activeLocationId]);
  const { data: currentInventory } = useCollection(inventoryQuery);
  const [isOrderFormOpen, setIsOrderFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("Error de digitación / Comanda duplicada");
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [mobileOrderTab, setMobileOrderTab] = useState<'menu' | 'cart'>('menu');
  
  const [customerName, setCustomerName] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [configuringProduct, setConfiguringProduct] = useState<any>(null);
  const [configQuantity, setConfigQuantity] = useState(1);
  const [configNotes, setConfigNotes] = useState("");

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
    setDraftItems(selectedOrderItems.map(item => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPriceUSD: item.unitPriceUSD,
      subtotalUSD: item.subtotalUSD,
      notes: item.notes || "",
      isCombo: item.isCombo || false,
      comboItems: item.comboItems || []
    })));
    setIsOrderFormOpen(true);
    setIsDetailOpen(false);
  };

  const filteredProducts = products?.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const addToDraft = () => {
    if (!configuringProduct) return;
    const unitPrice = round2(configuringProduct.masterPriceUSD);
    const subtotal = round2(unitPrice * configQuantity);
    
    setDraftItems([...draftItems, {
      productId: configuringProduct.id,
      productName: configuringProduct.name,
      quantity: configQuantity,
      unitPriceUSD: unitPrice,
      subtotalUSD: subtotal,
      notes: configNotes,
      isCombo: configuringProduct.isCombo || false,
      comboItems: configuringProduct.comboItems || []
    }]);

    setConfiguringProduct(null);
    setConfigQuantity(1);
    setConfigNotes("");
  };

  const removeFromDraft = (index: number) => {
    setDraftItems(draftItems.filter((_, i) => i !== index));
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
          comboItems: d.data().comboItems
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
          comboItems: i.comboItems
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
            comboItems: i.comboItems
          }));
          await applyStockDeduction(firestore, activeLocationId, [], newItemsList, products || []);
        }
        toast({ title: "Comanda creada", description: `Pedido para ${customerName} registrado e inventario descontado.` });
      }

      setIsOrderFormOpen(false);
      resetForm();
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
        comboItems: d.data().comboItems
      }));

      // 2. Reintegrar stock al inventario (newItems = [])
      if (oldItemsList.length > 0) {
        await applyStockDeduction(firestore, activeLocationId, oldItemsList, [], products || []);
      }

      // 3. Actualizar la orden a CANCELLED y archived = true
      const orderRef = doc(firestore, 'locations', activeLocationId, 'orders', selectedOrderId);
      updateDocumentNonBlocking(orderRef, {
        status: 'CANCELLED',
        archived: true,
        pendingBalanceUSD: 0,
        cancelReason: cancelReason,
        cancelledAt: serverTimestamp(),
        cancelledBy: user?.uid || 'anonymous',
        cancelledByName: profile?.firstName || user?.email?.split('@')[0] || 'Operador',
        lastUpdatedAt: serverTimestamp()
      });

      toast({
        title: "Comanda Anulada",
        description: `La comanda ${selectedOrder.orderNumber} fue anulada y los insumos fueron reintegrados al inventario.`
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

    updateDocumentNonBlocking(selectedOrderRef!, {
      totalPaidUSD: newStatus === 'PAID' ? orderTotal : newPaidTotal,
      pendingBalanceUSD: newStatus === 'PAID' ? 0 : newPending,
      status: newStatus,
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {!user || ordersLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-44 rounded-xl bg-card animate-pulse border border-border" />
              ))
            ) : orders?.length === 0 ? (
              <div className="col-span-full py-12 md:py-20 text-center space-y-4 bg-muted/10 rounded-3xl border border-dashed border-border p-4">
                <div className="p-4 bg-primary/10 rounded-full w-fit mx-auto">
                  <UtensilsCrossed className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-headline font-bold">Sin comandas en {currentLocationName}</h3>
                  <p className="text-sm text-muted-foreground">Toca el botón superior para tomar un pedido.</p>
                </div>
              </div>
            ) : orders?.map(order => (
              <OrderCard 
                key={order.id} 
                order={{
                  ...order,
                  createdAt: order.orderDate?.seconds ? new Date(order.orderDate.seconds * 1000).toISOString() : new Date().toISOString(),
                  totalUSD: order.totalUSD || 0,
                  paidUSD: order.totalPaidUSD || 0,
                  pendingUSD: order.pendingBalanceUSD || 0,
                  status: (order.status || 'OPEN') as any,
                  items: [] 
                }} 
                onClick={() => handleOpenDetail(order.id)} 
              />
            ))}
          </div>
        </div>
      </main>

      {/* DIALOGO: AJUSTAR TASA CAMBIARIA */}
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
            <p className="text-[10px] text-muted-foreground italic leading-relaxed">
              Este valor se guardará en la nube y actualizará todos los cálculos de conversión en tiempo real.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setIsExchangeRateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateExchangeRate} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">Guardar Tasa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOGO: TOMA DE PEDIDO / EDICION */}
      <Dialog open={isOrderFormOpen} onOpenChange={setIsOrderFormOpen}>
        <DialogContent className="max-w-6xl w-full h-[100dvh] lg:h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-card border-none lg:border lg:border-border lg:rounded-xl shadow-2xl">
          
          {/* HEADER DEL DIALOGO CON SEGMENTED CONTROL PARA MÓVILES */}
          <div className="p-3 lg:p-6 border-b border-border bg-muted/20 flex justify-between items-center shrink-0">
            <div className="flex flex-col">
              <DialogTitle className="text-base sm:text-lg lg:text-2xl font-headline font-bold text-primary">
                {editingOrderId ? 'Editar Comanda' : 'Toma de Pedido'}
              </DialogTitle>
              <p className="text-[9px] lg:text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{currentLocationName}</p>
            </div>

            {/* Selector de pestañas para teléfono móvil */}
            <div className="flex lg:hidden bg-background/80 rounded-lg p-1 border border-border">
              <button 
                type="button" 
                onClick={() => setMobileOrderTab('menu')}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-md transition-all",
                  mobileOrderTab === 'menu' ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
                )}
              >
                Catálogo
              </button>
              <button 
                type="button" 
                onClick={() => setMobileOrderTab('cart')}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5",
                  mobileOrderTab === 'cart' ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
                )}
              >
                <span>Ticket</span>
                {draftItems.length > 0 && (
                  <span className="h-4 min-w-4 px-1 rounded-full text-[9px] bg-primary-foreground text-primary font-bold flex items-center justify-center">
                    {draftItems.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            
            {/* COLUMNA 1: CATÁLOGO Y BÚSQUEDA */}
            <div className={cn(
              "flex-1 w-full lg:w-1/2 flex flex-col border-b lg:border-b-0 lg:border-r border-border bg-background/30 p-3 lg:p-6 space-y-3 lg:space-y-4 overflow-hidden",
              mobileOrderTab === 'cart' && "hidden lg:flex"
            )}>
              <div className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar hamburguesa, bebida, combo..." 
                  className="pl-9 h-10 text-sm bg-background rounded-xl" 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <ScrollArea className="flex-1">
                <div className="flex flex-col gap-2.5 lg:gap-4 pr-2 pb-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {filteredProducts?.map(p => (
                      <button 
                        key={p.id} 
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border border-border bg-card hover:border-primary/50 transition-all text-left active:scale-[0.98]", 
                          configuringProduct?.id === p.id && "border-primary bg-primary/10 shadow-sm"
                        )}
                        onClick={() => { setConfiguringProduct(p); setConfigQuantity(1); }}
                      >
                        <div className="space-y-0.5 flex-1 pr-2">
                          <p className="text-sm font-bold text-foreground line-clamp-1">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground line-clamp-1">{p.description || (p.isCombo ? 'Pack de productos' : '')}</p>
                        </div>
                        <span className="font-bold text-sm text-primary shrink-0">${p.masterPriceUSD.toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </ScrollArea>

              {/* PANEL CONFIGURADOR DE ITEM SELECCIONADO */}
              {configuringProduct && (
                <div className="bg-card border-2 border-primary/40 rounded-2xl p-3 sm:p-4 animate-in slide-in-from-bottom-2 shrink-0 shadow-lg space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs sm:text-sm font-bold text-primary truncate max-w-[200px]">
                      {configuringProduct.name}
                    </h4>
                    <span className="text-sm sm:text-base font-headline font-bold text-primary">
                      ${(configuringProduct.masterPriceUSD * configQuantity).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="flex items-center gap-1 bg-background border border-border rounded-xl px-1.5 h-10">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setConfigQuantity(Math.max(1, configQuantity - 1))}>
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-bold w-6 text-center">{configQuantity}</span>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setConfigQuantity(configQuantity + 1)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <Input 
                      placeholder="Notas (sin cebolla, salsa extra...)" 
                      className="h-10 text-xs flex-1 rounded-xl" 
                      value={configNotes} 
                      onChange={(e) => setConfigNotes(e.target.value)}
                    />
                    <Button className="h-10 px-4 text-xs font-bold gap-1 rounded-xl" onClick={addToDraft}>
                      <Plus className="h-4 w-4" /> Añadir
                    </Button>
                  </div>
                </div>
              )}

              {/* BOTÓN FLOTANTE MÓVIL PARA VER TICKET */}
              {draftItems.length > 0 && !configuringProduct && (
                <button 
                  type="button"
                  onClick={() => setMobileOrderTab('cart')}
                  className="lg:hidden w-full bg-primary text-primary-foreground p-3.5 rounded-xl font-bold flex justify-between items-center shadow-lg active:scale-[0.98] transition-all"
                >
                  <span className="flex items-center gap-2 text-xs">
                    <ShoppingCart className="h-4 w-4" /> {draftItems.length} item{draftItems.length > 1 ? 's' : ''} en comanda
                  </span>
                  <span className="font-headline text-sm font-bold">${calculateDraftTotal().toFixed(2)} &rarr;</span>
                </button>
              )}
            </div>

            {/* COLUMNA 2: TICKET Y CONFIRMACIÓN */}
            <div className={cn(
              "flex-1 w-full lg:w-1/2 flex flex-col bg-muted/5 p-3 lg:p-6 overflow-hidden",
              mobileOrderTab === 'menu' && "hidden lg:flex"
            )}>
              <div className="flex-1 flex flex-col space-y-3 lg:space-y-4 overflow-hidden">
                
                {/* DATOS DE CLIENTE Y MESA */}
                <div className="grid grid-cols-2 gap-2 shrink-0 bg-card p-2.5 rounded-xl border border-border/60">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Cliente / Referencia</Label>
                    <Input 
                      value={customerName} 
                      onChange={(e) => setCustomerName(e.target.value)} 
                      placeholder="Ej. Carlos G." 
                      className="h-9 text-xs rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Mesa / Ubicación</Label>
                    <Input 
                      value={tableNumber} 
                      onChange={(e) => setTableNumber(e.target.value)} 
                      placeholder="Ej. 4 o Barra" 
                      className="h-9 text-xs rounded-lg"
                    />
                  </div>
                </div>

                <div className="text-left shrink-0">
                  <h3 className="font-headline font-bold text-xs text-muted-foreground uppercase flex items-center gap-1.5">
                    <ShoppingCart className="h-3.5 w-3.5" /> Items en la comanda ({draftItems.length})
                  </h3>
                </div>

                <ScrollArea className="flex-1">
                  {draftItems.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-xs space-y-2">
                      <p>No has agregado ningún producto al ticket.</p>
                      <Button variant="outline" size="sm" onClick={() => setMobileOrderTab('menu')} className="lg:hidden text-xs">
                        Ir al catálogo &rarr;
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 pr-2 pb-2">
                      {draftItems.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/50">
                          <div className="space-y-0.5 flex-1 pr-2">
                            <div className="text-xs font-bold flex items-center gap-1.5">
                              <Badge variant="secondary" className="h-4 w-4 p-0 flex items-center justify-center rounded-full text-[9px]">
                                {item.quantity}
                              </Badge>
                              <span className="truncate">{item.productName}</span>
                            </div>
                            {item.notes && <p className="text-[10px] text-accent italic">{item.notes}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs">${item.subtotalUSD.toFixed(2)}</span>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-destructive hover:bg-destructive/10 rounded-lg" 
                              onClick={() => removeFromDraft(idx)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* FOOTER TOTAL Y BOTÓN DE CONFIRMACIÓN */}
              <div className="pt-3 border-t border-border mt-auto space-y-2.5 shrink-0">
                <div className="flex justify-between items-center px-1">
                  <span className="text-xs font-bold text-muted-foreground uppercase">TOTAL A FACTURAR</span>
                  <div className="text-right">
                    <span className="text-2xl lg:text-3xl font-headline font-bold text-primary">
                      ${calculateDraftTotal().toFixed(2)}
                    </span>
                    <p className="text-[10px] text-muted-foreground">
                      ~ {(calculateDraftTotal() * currentExchangeRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })} BS
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 h-11 text-xs" onClick={() => setIsOrderFormOpen(false)} disabled={isSavingOrder}>
                    Cancelar
                  </Button>
                  <Button 
                    className="flex-[2] h-11 gap-1.5 font-headline text-xs sm:text-sm font-bold rounded-xl" 
                    disabled={isSavingOrder || draftItems.length === 0 || !customerName.trim()} 
                    onClick={handleSaveOrder}
                  >
                    {isSavingOrder ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Guardando...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" /> {editingOrderId ? 'Actualizar Comanda' : 'Confirmar Pedido'}
                      </>
                    )}
                  </Button>
                </div>
              </div>

            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOGO: DETALLE DE COMANDA ACTIVA */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl bg-card border-border shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Detalle de Comanda</DialogTitle>
          </DialogHeader>
          {selectedOrder ? (
            <div className="flex flex-col h-[100dvh] lg:h-auto">
              <div className="p-3 lg:p-6 border-b border-border bg-muted/20 flex justify-between items-center shrink-0">
                <div className="space-y-0.5 lg:space-y-1">
                  <Badge className={cn("px-1.5 py-0 lg:px-2 lg:py-0.5 text-[8px] lg:text-[10px]", selectedOrder.status === 'PAID' ? 'bg-green-500/20 text-green-400' : 'bg-primary/20 text-primary')}>
                    {selectedOrder.status === 'PAID' ? 'PAGADA' : 'ABIERTA / CRÉDITO'}
                  </Badge>
                  <div className="text-lg lg:text-2xl font-headline font-bold">{selectedOrder.customerNotes}</div>
                  <p className="text-[10px] lg:text-xs text-muted-foreground">Mesa: {selectedOrder.tableNumber} | Ticket: {selectedOrder.orderNumber}</p>
                </div>
                <div className="flex gap-2">
                  {selectedOrder.status !== 'PAID' && (
                    <Button variant="outline" size="icon" className="h-7 w-7 lg:h-9 lg:w-9" onClick={handleEditOrder}><Pencil className="h-3 w-3 lg:h-4 lg:w-4" /></Button>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                <div className="flex-1 lg:w-2/3 p-2 lg:p-6 border-b lg:border-b-0 lg:border-r border-border flex flex-col overflow-hidden">
                  <h4 className="text-[10px] lg:text-xs font-bold text-muted-foreground uppercase mb-2 lg:mb-4 shrink-0">Consumo</h4>
                  <ScrollArea className="flex-1 pr-2 lg:pr-4">
                    <div className="space-y-1.5 lg:space-y-2 pb-2">
                      {selectedOrderItems?.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-2 lg:p-3 rounded-lg border border-border/50 bg-background/50">
                          <div className="space-y-0.5">
                            <div className="font-bold text-xs lg:text-sm flex items-center gap-1 lg:gap-2">
                              <Badge variant="secondary" className="h-4 w-4 lg:h-5 lg:w-5 p-0 flex items-center justify-center rounded-full text-[9px] lg:text-[10px]">{item.quantity}</Badge>
                              {item.productName}
                            </div>
                            {item.notes && <p className="text-[9px] lg:text-[10px] text-accent">{item.notes}</p>}
                          </div>
                          <span className="font-bold text-xs lg:text-sm">${item.subtotalUSD?.toFixed(2)}</span>
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
                        <span className="font-bold">${selectedOrder.totalUSD?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] lg:text-xs">
                        <span className="text-green-400">Total Pagado</span>
                        <span className="font-bold text-green-400">${selectedOrder.totalPaidUSD?.toFixed(2) || '0.00'}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1 lg:pt-2 border-t border-border">
                        <span className="text-xs lg:text-sm font-bold">Pnd. por Cobrar</span>
                        <span className="text-lg lg:text-2xl font-headline font-bold text-primary">${selectedOrder.pendingBalanceUSD?.toFixed(2)}</span>
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
                    <Button 
                      className="w-full h-9 lg:h-12 gap-1 lg:gap-2 font-headline text-xs lg:text-sm" 
                      onClick={handleOpenPayment}
                      disabled={selectedOrder.status === 'PAID'}
                    >
                      <CircleDollarSign className="h-4 w-4 lg:h-5 lg:w-5" /> Registrar Cobro
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full h-8 lg:h-10 gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30 hover:border-destructive/60 text-xs font-bold"
                      onClick={() => setIsCancelDialogOpen(true)}
                    >
                      <Ban className="h-4 w-4" /> Anular / Cancelar Comanda
                    </Button>
                  </div>
                </div>
              </div>
            </div>
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
