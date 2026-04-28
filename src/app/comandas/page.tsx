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
  RefreshCw
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter
} from '@/components/ui/dialog';
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
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { MOCK_CONFIG, MOCK_LOCATIONS } from '@/lib/mock-data';

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
  { id: 'DIVISAS', label: 'Divisas ($)', icon: Wallet },
  { id: 'EFECTIVO_BS', label: 'Efectivo BS', icon: Banknote },
  { id: 'PAGO_MOVIL', label: 'Pago Móvil', icon: Smartphone },
  { id: 'TRANSFERENCIA', label: 'Transferencia', icon: History },
  { id: 'PUNTO', label: 'Punto de Venta', icon: CreditCard },
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

  const [isOrderFormOpen, setIsOrderFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  
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

  const resetForm = () => {
    setCustomerName("");
    setTableNumber("");
    setDraftItems([]);
    setSearchTerm("");
    setConfiguringProduct(null);
    setEditingOrderId(null);
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

  const addToDraft = () => {
    if (!configuringProduct) return;
    const newItem: DraftItem = {
      productId: configuringProduct.id,
      productName: configuringProduct.name,
      quantity: configQuantity,
      unitPriceUSD: configuringProduct.masterPriceUSD,
      subtotalUSD: configuringProduct.masterPriceUSD * configQuantity,
      notes: configNotes,
      isCombo: configuringProduct.isCombo || false,
      comboItems: configuringProduct.comboItems || []
    };
    setDraftItems([...draftItems, newItem]);
    setConfiguringProduct(null);
    setConfigQuantity(1);
    setConfigNotes("");
  };

  const removeFromDraft = (index: number) => {
    setDraftItems(draftItems.filter((_, i) => i !== index));
  };

  const calculateDraftTotal = () => {
    return draftItems.reduce((acc, item) => acc + item.subtotalUSD, 0);
  };

  const handleSaveOrder = async () => {
    if (!user || draftItems.length === 0 || !customerName || !activeLocationId) {
      toast({ variant: "destructive", title: "Faltan datos", description: "El nombre y al menos un producto son requeridos." });
      return;
    }

    const orderTotal = calculateDraftTotal();
    
    if (editingOrderId) {
      const orderRef = doc(firestore, 'locations', activeLocationId, 'orders', editingOrderId);
      updateDocumentNonBlocking(orderRef, {
        customerNotes: customerName,
        tableNumber: tableNumber || "N/A",
        totalUSD: orderTotal,
        pendingBalanceUSD: Math.max(0, orderTotal - (selectedOrder?.totalPaidUSD || 0)),
        lastUpdatedAt: serverTimestamp()
      });

      const itemsRef = collection(firestore, 'locations', activeLocationId, 'orders', editingOrderId, 'items');
      const oldItems = await getDocs(itemsRef);
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

      toast({ title: "Comanda actualizada", description: `El pedido de ${customerName} ha sido modificado.` });
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
        tableNumber: tableNumber || "N/A",
        customerNotes: customerName,
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
      }
      toast({ title: "Comanda creada", description: `Pedido para ${customerName} registrado.` });
    }

    setIsOrderFormOpen(false);
    resetForm();
  };

  const handleOpenPayment = () => {
    setPaymentAmount(selectedOrder?.pendingBalanceUSD.toFixed(2) || "0");
    setPaymentCurrency("USD");
    setPaymentMethod("DIVISAS");
    setPaymentPhone("");
    setPaymentReference("");
    setIsPaymentDialogOpen(true);
  };

  const processPayment = async () => {
    if (!selectedOrderId || !selectedOrder || !user || !activeLocationId) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Monto inválido" });
      return;
    }

    let amountUSD = amount;
    let amountBS = amount * currentExchangeRate;

    if (paymentCurrency === "BS") {
      amountUSD = amount / currentExchangeRate;
      amountBS = amount;
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

    const newPaidTotal = (selectedOrder.totalPaidUSD || 0) + amountUSD;
    const newPending = Math.max(0, selectedOrder.totalUSD - newPaidTotal);
    const newStatus = newPending <= 0.01 ? 'PAID' : 'OPEN';

    updateDocumentNonBlocking(selectedOrderRef!, {
      totalPaidUSD: newPaidTotal,
      pendingBalanceUSD: newPending,
      status: newStatus,
      lastUpdatedAt: serverTimestamp()
    });

    setIsPaymentDialogOpen(false);
    if (newStatus === 'PAID') {
      toast({ title: "Orden Pagada", description: "El pedido se ha cerrado exitosamente." });
      setIsDetailOpen(false);
    } else {
      toast({ title: "Abono registrado", description: `Pendiente: $${newPending.toFixed(2)}` });
    }
  };

  const handleUpdateExchangeRate = () => {
    const rateNum = parseFloat(newExchangeRate);
    if (isNaN(rateNum) || rateNum <= 0) {
      toast({ variant: "destructive", title: "Tasa inválida" });
      return;
    }

    setDocumentNonBlocking(configRef, {
      exchangeRate: rateNum,
      lastUpdated: serverTimestamp()
    }, { merge: true });

    setIsExchangeRateDialogOpen(false);
    toast({ title: "Tasa actualizada", description: `Nuevo factor: ${rateNum} BS/$` });
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

  const filteredProducts = products?.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentLocationName = MOCK_LOCATIONS.find(l => l.id === activeLocationId)?.name || "Sucursal";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar role={role} />
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-16 lg:pt-8">
        <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl md:text-4xl font-headline font-bold text-foreground">Gestión de Comandas</h1>
              <div className="flex flex-wrap items-center gap-4">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" /> <span className="font-bold text-primary">{currentLocationName}</span>
                </p>
                <button 
                  onClick={() => setIsExchangeRateDialogOpen(true)}
                  className="bg-accent/10 hover:bg-accent/20 border border-accent/20 px-3 py-1 rounded-full flex items-center gap-2 transition-all group"
                >
                  <TrendingUp className="h-3.5 w-3.5 text-accent" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-accent-foreground">Tasa: </span>
                  <span className="text-xs font-headline font-bold text-accent">{currentExchangeRate.toFixed(2)} BS</span>
                  <RefreshCw className="h-3 w-3 text-accent/50 group-hover:rotate-180 transition-transform duration-500" />
                </button>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-3">
              {isAdmin && (
                <div className="flex items-center gap-2 bg-card p-1 rounded-lg border border-border shadow-sm w-full sm:w-auto">
                  <Select value={activeLocationId || "br-1"} onValueChange={(val) => { if(val) setActiveLocationId(val) }}>
                    <SelectTrigger className="h-9 w-[180px] border-none bg-transparent focus:ring-0 text-xs font-bold">
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
              <div className="flex gap-3 w-full sm:w-auto">
                <Button 
                  variant="outline" 
                  onClick={handleArchiveDaily} 
                  disabled={isArchiving || orders?.filter(o => o.status === 'PAID').length === 0}
                  className="gap-2 border-accent/50 text-accent hover:bg-accent/10 flex-1 sm:flex-none"
                >
                  <Archive className="h-4 w-4" /> Archivar
                </Button>
                <Button onClick={handleOpenNewOrder} className="gap-2 shadow-lg h-12 px-6 text-lg bg-primary hover:bg-primary/90 flex-[2] sm:flex-none">
                  <Plus className="h-5 w-5" /> Nueva Comanda
                </Button>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {!user || ordersLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-48 rounded-xl bg-card animate-pulse border border-border" />
              ))
            ) : orders?.length === 0 ? (
              <div className="col-span-full py-12 md:py-20 text-center space-y-4 bg-muted/10 rounded-3xl border border-dashed border-border">
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
        <DialogContent className="max-w-sm bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-accent" /> Ajustar Tasa BS/$</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-muted-foreground">Nuevo Valor (Bolívares)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  className="h-12 text-2xl font-headline pl-4"
                  value={newExchangeRate}
                  onChange={(e) => setNewExchangeRate(e.target.value)}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">BS</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground italic leading-relaxed">
              Este valor afectará a todos los cálculos de conversión en tiempo real para el personal de caja.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsExchangeRateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateExchangeRate} className="bg-accent hover:bg-accent/90 text-accent-foreground">Guardar Tasa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOGO: TOMA DE PEDIDO / EDICION */}
      <Dialog open={isOrderFormOpen} onOpenChange={setIsOrderFormOpen}>
        <DialogContent className="max-w-6xl w-full h-[100dvh] lg:h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-card border-none lg:border lg:border-border lg:rounded-xl shadow-2xl">
          <div className="p-2 lg:p-6 border-b border-border bg-muted/20 flex justify-between items-center shrink-0">
            <div className="flex flex-col">
              <DialogTitle className="text-lg lg:text-2xl font-headline font-bold text-primary">
                {editingOrderId ? 'Editar Comanda' : 'Toma de Pedido'}
              </DialogTitle>
              <p className="text-[9px] lg:text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{currentLocationName}</p>
            </div>
          </div>

          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            <div className="flex-1 w-full lg:w-1/2 flex flex-col border-b lg:border-b-0 lg:border-r border-border bg-background/30 p-2 lg:p-6 space-y-2 lg:space-y-4 overflow-hidden">
              <div className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 lg:h-4 lg:w-4 text-muted-foreground" />
                <Input placeholder="Buscar producto..." className="pl-9 h-8 lg:h-10 text-xs lg:text-sm bg-background" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
              </div>

              <ScrollArea className="flex-1">
                <div className="flex flex-col gap-2 lg:gap-4 pr-2 pb-2">
                  <div className="grid grid-cols-2 gap-2 lg:gap-4 shrink-0 bg-muted/5 p-2 rounded-lg border border-border/50">
                    <div className="space-y-1">
                      <Label className="text-[9px] lg:text-[10px] uppercase font-bold text-muted-foreground">Cliente</Label>
                      <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nombre" className="h-7 lg:h-9 text-xs"/>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[9px] lg:text-[10px] uppercase font-bold text-muted-foreground">Mesa</Label>
                      <Input value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="N°" className="h-7 lg:h-9 text-xs"/>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 lg:gap-2">
                    {filteredProducts?.map(p => (
                      <button key={p.id} className={cn("flex items-center justify-between p-2 lg:p-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-all text-left", configuringProduct?.id === p.id && "border-primary bg-primary/5")}
                        onClick={() => { setConfiguringProduct(p); setConfigQuantity(1); }}>
                        <div className="space-y-0.5">
                          <p className="text-xs lg:text-sm font-bold text-foreground">{p.name}</p>
                          <p className="text-[9px] lg:text-[10px] text-muted-foreground line-clamp-1">{p.description || (p.isCombo ? 'Pack de productos' : '')}</p>
                        </div>
                        <span className="font-bold text-xs lg:text-sm text-primary">${p.masterPriceUSD.toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </ScrollArea>

              {configuringProduct && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-2 lg:p-3 animate-in slide-in-from-bottom-2 shrink-0">
                  <div className="flex justify-between items-center mb-1.5 lg:mb-2">
                    <h4 className="text-[10px] lg:text-xs font-bold text-primary flex items-center gap-1">
                      {configuringProduct.name}
                    </h4>
                    <span className="text-[10px] lg:text-xs font-bold text-primary">${(configuringProduct.masterPriceUSD * configQuantity).toFixed(2)}</span>
                  </div>
                  <div className="flex gap-1.5 lg:gap-2 items-center">
                    <div className="flex items-center gap-1 lg:gap-2 bg-background border border-border rounded-lg px-1 lg:px-2 h-7 lg:h-9">
                      <Button size="icon" variant="ghost" className="h-5 w-5 lg:h-7 lg:w-7" onClick={() => setConfigQuantity(Math.max(1, configQuantity - 1))}><Minus className="h-3 w-3" /></Button>
                      <span className="text-xs lg:text-sm font-bold w-4 lg:w-6 text-center">{configQuantity}</span>
                      <Button size="icon" variant="ghost" className="h-5 w-5 lg:h-7 lg:w-7" onClick={() => setConfigQuantity(configQuantity + 1)}><Plus className="h-3 w-3" /></Button>
                    </div>
                    <Input placeholder="Notas..." className="h-7 lg:h-9 text-[10px] lg:text-xs flex-1" value={configNotes} onChange={(e) => setConfigNotes(e.target.value)}/>
                    <Button size="sm" className="h-7 lg:h-9 px-2 lg:px-3" onClick={addToDraft}><Plus className="h-3 w-3 lg:h-4 lg:w-4" /></Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 w-full lg:w-1/2 flex flex-col bg-muted/5 p-2 lg:p-6 overflow-hidden">
              <div className="flex-1 flex flex-col space-y-2 lg:space-y-4 overflow-hidden">
                <div className="text-center shrink-0">
                  <h3 className="font-headline font-bold text-[10px] lg:text-sm text-muted-foreground uppercase flex items-center justify-center gap-1 lg:gap-2"><ShoppingCart className="h-3.5 w-3.5 lg:h-4 lg:w-4" /> Ticket Actual</h3>
                </div>
                <ScrollArea className="flex-1">
                  <div className="space-y-1.5 lg:space-y-2 pr-2">
                    {draftItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 lg:p-3 rounded-lg bg-card border border-border/50">
                        <div className="space-y-0.5">
                          <div className="text-[10px] lg:text-xs font-bold flex items-center gap-1">
                            <Badge variant="secondary" className="h-3 w-3 lg:h-4 lg:w-4 p-0 flex items-center justify-center rounded-full text-[8px] lg:text-[9px]">{item.quantity}</Badge>
                            {item.productName}
                          </div>
                          {item.notes && <p className="text-[8px] lg:text-[9px] text-accent italic">{item.notes}</p>}
                        </div>
                        <div className="flex items-center gap-2 lg:gap-3">
                          <span className="font-bold text-[10px] lg:text-xs">${item.subtotalUSD.toFixed(2)}</span>
                          <Button variant="ghost" size="icon" className="h-5 w-5 lg:h-7 lg:w-7 text-destructive" onClick={() => removeFromDraft(idx)}><X className="h-3 w-3 lg:h-4 lg:w-4" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <div className="pt-2 lg:pt-4 border-t border-border mt-auto space-y-2 lg:space-y-3 shrink-0">
                <div className="flex justify-between items-center px-1 lg:px-2">
                  <span className="text-[10px] lg:text-sm font-bold text-muted-foreground uppercase">TOTAL USD</span>
                  <span className="text-xl lg:text-3xl font-headline font-bold text-primary">${calculateDraftTotal().toFixed(2)}</span>
                </div>
                <div className="flex gap-1.5 lg:gap-2">
                  <Button variant="outline" className="flex-1 h-9 lg:h-11 text-xs lg:text-sm" onClick={() => setIsOrderFormOpen(false)}>Cancelar</Button>
                  <Button className="flex-[2] h-9 lg:h-11 gap-1 lg:gap-2 font-headline text-xs lg:text-sm" disabled={draftItems.length === 0 || !customerName} onClick={handleSaveOrder}>
                    <Check className="h-3 w-3 lg:h-4 lg:w-4" /> {editingOrderId ? 'Actualizar' : 'Confirmar'}
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

                  <Button 
                    className="w-full h-9 lg:h-12 gap-1 lg:gap-2 font-headline text-xs lg:text-sm mt-auto shrink-0" 
                    onClick={handleOpenPayment}
                    disabled={selectedOrder.status === 'PAID'}
                  >
                    <CircleDollarSign className="h-4 w-4 lg:h-5 lg:w-5" /> Registrar Cobro
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground animate-pulse">Cargando detalle...</div>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOGO: PROCESAR PAGO / ABONO */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="max-w-md bg-card border-border shadow-2xl p-4 lg:p-6 w-[90vw] rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg lg:text-xl"><DollarSign className="h-4 w-4 lg:h-5 lg:w-5 text-primary" /> Procesar Abono</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 lg:space-y-6 py-2 lg:py-4">
            <div className="p-3 lg:p-4 bg-primary/5 rounded-xl border border-primary/10 text-center">
              <span className="text-[9px] lg:text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Saldo Pendiente Actual</span>
              <p className="text-2xl lg:text-3xl font-headline font-bold text-primary">${selectedOrder?.pendingBalanceUSD.toFixed(2)}</p>
            </div>

            <div className="space-y-3 lg:space-y-4">
              <div className="space-y-1.5 lg:space-y-2">
                <Label className="text-[10px] lg:text-xs font-bold uppercase">Monto a Abonar</Label>
                <div className="flex gap-2">
                  <Select value={paymentCurrency} onValueChange={(v: any) => setPaymentCurrency(v)}>
                    <SelectTrigger className="w-20 lg:w-24 h-10 lg:h-12 text-sm lg:text-lg font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">$ USD</SelectItem>
                      <SelectItem value="BS">BS</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1">
                    <Input 
                      type="number" 
                      className="h-10 lg:h-12 text-lg lg:text-2xl font-headline pl-3 lg:pl-4"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] lg:text-[10px] font-bold text-muted-foreground">
                      {paymentCurrency === "BS" 
                        ? `~$${(parseFloat(paymentAmount) / currentExchangeRate || 0).toFixed(2)}`
                        : `~BS ${(parseFloat(paymentAmount) * currentExchangeRate || 0).toLocaleString()}`
                      }
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 lg:space-y-2">
                <Label className="text-[10px] lg:text-xs font-bold uppercase">Método de Cobro</Label>
                <div className="grid grid-cols-2 gap-1.5 lg:gap-2">
                  {PAYMENT_METHODS.map(method => (
                    <button
                      key={method.id}
                      onClick={() => setPaymentMethod(method.id)}
                      className={cn(
                        "flex items-center gap-1.5 lg:gap-2 p-2 lg:p-3 rounded-lg border text-[10px] lg:text-xs font-medium transition-all",
                        paymentMethod === method.id 
                          ? "bg-primary/20 border-primary text-primary" 
                          : "bg-card border-border hover:border-primary/50"
                      )}
                    >
                      <method.icon className="h-3 w-3 lg:h-4 lg:w-4" />
                      <span className="line-clamp-1 text-left">{method.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {(paymentMethod === 'PAGO_MOVIL' || paymentMethod === 'TRANSFERENCIA') && (
                <div className="grid grid-cols-2 gap-2 animate-in slide-in-from-top-2 pt-1 lg:pt-2">
                  <div className="space-y-1">
                    <Label className="text-[9px] lg:text-[10px] uppercase font-bold text-muted-foreground">Teléfono (Opcional)</Label>
                    <Input 
                      placeholder="Ej. 04141234567" 
                      className="h-8 lg:h-10 text-xs" 
                      value={paymentPhone} 
                      onChange={(e) => setPaymentPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] lg:text-[10px] uppercase font-bold text-muted-foreground">Referencia</Label>
                    <Input 
                      placeholder="Últimos dígitos" 
                      className="h-8 lg:h-10 text-xs" 
                      value={paymentReference} 
                      onChange={(e) => setPaymentReference(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-2 lg:mt-0">
            <Button variant="ghost" onClick={() => setIsPaymentDialogOpen(false)} className="flex-1 h-9 lg:h-11 text-xs lg:text-sm">Cancelar</Button>
            <Button onClick={processPayment} className="flex-[2] h-9 lg:h-11 text-xs lg:text-sm font-headline" disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}>
              Confirmar Abono
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
