
"use client";

import { useState, useMemo, useEffect } from 'react';
import { AppSidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  useCollection, 
  useFirestore, 
  useMemoFirebase, 
  useUser,
  useDoc
} from '@/firebase';
import { collection, query, where, getDocs, doc } from 'firebase/firestore';
import { 
  Scale, 
  TrendingUp, 
  Package, 
  Store,
  Wallet,
  Smartphone,
  CreditCard,
  Banknote,
  Filter,
  Info,
  MapPin,
  CircleDollarSign,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { MOCK_CONFIG, MOCK_LOCATIONS } from '@/lib/mock-data';
import { cn, round2, round4 } from '@/lib/utils';
import { fetchHistoricalRates, findRateByDate } from '@/lib/dolar-api';
import { calculateOrderIngredientUsage } from '@/lib/stock-deduction';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function CuadrePage() {
  const firestore = useFirestore();
  const { user, role, profile } = useUser();
  const isAdmin = role === 'ADMIN';

  const [activeLocationId, setActiveLocationId] = useState<string>("br-1");

  // Tasa cambiaria en tiempo real
  const configRef = useMemoFirebase(() => doc(firestore, 'config', 'exchangeRate'), [firestore]);
  const { data: exchangeData } = useDoc(configRef);
  const currentExchangeRate = exchangeData?.exchangeRate || MOCK_CONFIG.exchangeRate;

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const [historyList, setHistoryList] = useState<any[]>([]);

  useEffect(() => {
    // Cargar histórico de tasas BCV
    fetchHistoricalRates('USD').then(data => {
      setHistoryList(data);
    }).catch(err => console.error("Error fetching history in cuadre:", err));
  }, []);

  useEffect(() => {
    if (profile?.locationId) {
      const isBranch = MOCK_LOCATIONS.find(l => l.id === profile.locationId)?.type === 'BRANCH';
      setActiveLocationId(isBranch ? profile.locationId : "br-1");
    }
  }, [profile]);

  // Consulta de órdenes del día
  const ordersQuery = useMemoFirebase(() => {
    if (!user || !activeLocationId) return null;
    return collection(firestore, 'locations', activeLocationId, 'orders');
  }, [firestore, activeLocationId, user]);
  const { data: rawOrders } = useCollection(ordersQuery);

  // Consulta de todos los abonos del día (para el cuadre de dinero real)
  const [paymentsOfDay, setPaymentsOfDay] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  const rawOrdersKey = useMemo(() => {
    return (rawOrders || []).map(o => `${o.id}_${o.status}`).join('|');
  }, [rawOrders]);

  useEffect(() => {
    let active = true;
    async function fetchPayments() {
      if (!activeLocationId) return;
      setLoadingPayments(true);
      try {
        const q = query(
          collection(firestore, 'locations', activeLocationId, 'orders')
        );
        const ordersSnap = await getDocs(q);
        let allPayments: any[] = [];
        
        for (const orderDoc of ordersSnap.docs) {
          const paymentsSnap = await getDocs(collection(firestore, 'locations', activeLocationId, 'orders', orderDoc.id, 'payments'));
          paymentsSnap.forEach(p => {
            const data = p.data();
            const pDate = data.paymentDate?.seconds ? format(new Date(data.paymentDate.seconds * 1000), 'yyyy-MM-dd') : '';
            if (pDate === selectedDate) {
              allPayments.push({ ...data, id: p.id });
            }
          });
        }
        if (active) {
          setPaymentsOfDay(allPayments);
        }
      } catch (e) {
        console.error("Error fetching payments", e);
      } finally {
        if (active) setLoadingPayments(false);
      }
    }
    fetchPayments();
    return () => { active = false; };
  }, [firestore, activeLocationId, selectedDate, rawOrdersKey]);

  // Determinar la tasa efectiva para la fecha seleccionada con cálculo puro
  const { effectiveRate, rateSourceLabel } = useMemo(() => {
    if (selectedDate === todayStr) {
      return {
        effectiveRate: currentExchangeRate,
        rateSourceLabel: 'Tasa Activa Hoy'
      };
    }

    // 1. Si hubo pagos ese día, tomar la tasa exacta de los pagos
    const paymentWithRate = paymentsOfDay.find(p => p.exchangeRateAtPayment && p.exchangeRateAtPayment > 0);
    if (paymentWithRate) {
      return {
        effectiveRate: paymentWithRate.exchangeRateAtPayment,
        rateSourceLabel: 'Tasa en Comandas'
      };
    }

    // 2. Si no hay pagos, buscar en el histórico oficial BCV
    if (historyList.length > 0) {
      const match = findRateByDate(historyList, selectedDate);
      if (match && match.promedio > 0) {
        return {
          effectiveRate: match.promedio,
          rateSourceLabel: `BCV Oficial (${match.fecha})`
        };
      }
    }

    // 3. Fallback a la tasa configurada
    return {
      effectiveRate: currentExchangeRate,
      rateSourceLabel: 'Tasa Referencial'
    };
  }, [selectedDate, todayStr, paymentsOfDay, historyList, currentExchangeRate]);

  const ingredientsQuery = useMemoFirebase(() => collection(firestore, 'ingredients'), [firestore]);
  const { data: ingredients } = useCollection(ingredientsQuery);

  const inventoryQuery = useMemoFirebase(() => {
    if (!activeLocationId) return null;
    return collection(firestore, 'locations', activeLocationId, 'inventory');
  }, [firestore, activeLocationId]);
  const { data: currentInventory } = useCollection(inventoryQuery);

  const productsQuery = useMemoFirebase(() => collection(firestore, 'products'), [firestore]);
  const { data: products } = useCollection(productsQuery);

  const transfersQuery = useMemoFirebase(() => {
    if (!activeLocationId) return null;
    return query(collection(firestore, 'transfers'), where('destId', '==', activeLocationId));
  }, [firestore, activeLocationId]);
  const { data: rawTransfers } = useCollection(transfersQuery);

  const wasteQuery = useMemoFirebase(() => {
    if (!activeLocationId) return null;
    return query(collection(firestore, 'waste_logs'), where('locationId', '==', activeLocationId));
  }, [firestore, activeLocationId]);
  const { data: rawWasteLogs } = useCollection(wasteQuery);

  const filteredOrders = useMemo(() => {
    return rawOrders?.filter(o => {
      const d = o.orderDate?.seconds ? format(new Date(o.orderDate.seconds * 1000), 'yyyy-MM-dd') : '';
      return d === selectedDate;
    }) || [];
  }, [rawOrders, selectedDate]);

  // Consulta de los items de comanda vendidos en la fecha seleccionada para calcular consumo
  const [orderItemsOfDay, setOrderItemsOfDay] = useState<any[]>([]);

  const filteredOrderIds = useMemo(() => {
    return filteredOrders.map(o => `${o.id}_${o.status}`).join('|');
  }, [filteredOrders]);

  useEffect(() => {
    let active = true;
    async function fetchOrderItems() {
      if (!activeLocationId || filteredOrders.length === 0) {
        setOrderItemsOfDay([]);
        return;
      }
      try {
        let allItems: any[] = [];
        for (const order of filteredOrders) {
          if (order.status === 'CANCELLED') continue;
          const snap = await getDocs(collection(firestore, 'locations', activeLocationId, 'orders', order.id, 'items'));
          snap.forEach(d => allItems.push(d.data()));
        }
        if (active) {
          setOrderItemsOfDay(allItems);
        }
      } catch (e) {
        console.error("Error fetching order items in cuadre:", e);
      }
    }
    fetchOrderItems();
    return () => { active = false; };
  }, [firestore, activeLocationId, filteredOrderIds]);

  // Auditoría unificada de inventario del día
  const inventoryAudit = useMemo(() => {
    if (!ingredients) return [];

    // 1. Entradas (Transfers del día a esta sede)
    const transfersOfDay = rawTransfers?.filter(t => {
      const d = t.date?.seconds ? format(new Date(t.date.seconds * 1000), 'yyyy-MM-dd') : '';
      return d === selectedDate;
    }) || [];

    const transferMap: Record<string, number> = {};
    transfersOfDay.forEach(t => {
      if (t.ingredientId) {
        transferMap[t.ingredientId] = round4((transferMap[t.ingredientId] || 0) + (t.quantity || 0));
      }
    });

    // 2. Consumo en Ventas (recetas de las comandas facturadas hoy)
    const usageMap = calculateOrderIngredientUsage(orderItemsOfDay, products || []);

    // 3. Mermas reportadas hoy
    const wasteOfDay = rawWasteLogs?.filter(w => {
      const d = w.timestamp?.seconds ? format(new Date(w.timestamp.seconds * 1000), 'yyyy-MM-dd') : '';
      return d === selectedDate;
    }) || [];

    const wasteMap: Record<string, number> = {};
    wasteOfDay.forEach(w => {
      if (w.ingredientId) {
        wasteMap[w.ingredientId] = round4((wasteMap[w.ingredientId] || 0) + (w.quantity || 0));
      }
    });

    // 4. Mapear cada ingrediente con su balance completo
    return ingredients.map(ing => {
      const myStock = currentInventory?.find(i => i.ingredientId === ing.id)?.quantity || 0;
      const entered = transferMap[ing.id] || 0;
      const consumed = usageMap[ing.id]?.quantity || 0;
      const wasted = wasteMap[ing.id] || 0;
      const isCritical = myStock <= 8;
      const isLow = myStock < 20;

      return {
        id: ing.id,
        name: ing.name,
        unit: ing.unit,
        stock: myStock,
        entered,
        consumed,
        wasted,
        isLow,
        isCritical
      };
    });
  }, [ingredients, rawTransfers, rawWasteLogs, orderItemsOfDay, products, currentInventory, selectedDate]);

  const totals = useMemo(() => {
    // Ventas Teóricas (Lo que se facturó)
    const salesTotalUSD = round2(filteredOrders.reduce((acc, o) => acc + (o.totalUSD || 0), 0));
    
    // Créditos Generados (Lo que quedó debiéndose de las ventas de hoy)
    const pendingUSD = round2(filteredOrders.reduce((acc, o) => acc + (o.pendingBalanceUSD || 0), 0));
    
    // Dinero Real Entrado (Abonos realizados hoy de cualquier orden activa)
    const collectedUSD = round2(paymentsOfDay.reduce((acc, p) => acc + (p.amountUSD || 0), 0));
    
    // Desglose por método de pago (del dinero real)
    const methodBreakdown = paymentsOfDay.reduce((acc, p) => {
      const method = p.paymentMethod || 'OTROS';
      if (!acc[method]) acc[method] = { usd: 0, bs: 0 };
      acc[method].usd = round2(acc[method].usd + (p.amountUSD || 0));
      acc[method].bs = round2(acc[method].bs + (p.amountBS || 0));
      return acc;
    }, {} as Record<string, { usd: number, bs: number }>);

    return { 
      salesTotalUSD, 
      collectedUSD, 
      pendingUSD,
      methodBreakdown,
      count: filteredOrders.length 
    };
  }, [filteredOrders, paymentsOfDay]);

  const currentLocationName = MOCK_LOCATIONS.find(l => l.id === activeLocationId)?.name || "Sucursal";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar role={role} />
      
      <main className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-8 pt-16 pb-24 lg:pt-8 lg:pb-8">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-headline font-bold text-foreground">Cuadre de Caja</h1>
              <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                <MapPin className="h-4 w-4" /> <span className="text-primary font-bold">{currentLocationName}</span>
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3">
              {isAdmin && (
                <Select value={activeLocationId || "br-1"} onValueChange={(val) => { if(val) setActiveLocationId(val) }}>
                  <SelectTrigger className="h-10 w-full sm:w-48 bg-card border-border text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOCK_LOCATIONS.filter(l => l.type === 'BRANCH').map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>📍 {loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="relative w-full sm:w-auto">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                <Input 
                  type="date" 
                  value={selectedDate} 
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="pl-10 h-10 bg-card border-border w-full sm:w-44 text-xs font-bold"
                />
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">
            <Card className="bg-primary/5 border-primary/20 shadow-lg relative overflow-hidden">
              <div className="absolute top-2 right-2 p-1 bg-primary/10 rounded-full"><ArrowUpRight className="h-4 w-4 text-primary" /></div>
              <CardHeader className="pb-2">
                <CardDescription className="uppercase font-bold text-[10px] tracking-widest text-primary">Ventas Totales</CardDescription>
                <CardTitle className="text-2xl font-headline font-bold">${totals.salesTotalUSD.toFixed(2)}</CardTitle>
              </CardHeader>
              <CardContent><p className="text-[10px] text-muted-foreground">{totals.count} pedidos realizados hoy</p></CardContent>
            </Card>

            <Card className="bg-green-500/5 border-green-500/20 shadow-lg relative overflow-hidden">
              <div className="absolute top-2 right-2 p-1 bg-green-500/10 rounded-full"><CircleDollarSign className="h-4 w-4 text-green-400" /></div>
              <CardHeader className="pb-2">
                <CardDescription className="uppercase font-bold text-[10px] tracking-widest text-green-400">Cobrado (Efectivo)</CardDescription>
                <CardTitle className="text-2xl font-headline font-bold text-green-400">${totals.collectedUSD.toFixed(2)}</CardTitle>
              </CardHeader>
              <CardContent><p className="text-[10px] text-muted-foreground">Dinero real ingresado hoy</p></CardContent>
            </Card>

            <Card className="bg-destructive/5 border-destructive/20 shadow-lg relative overflow-hidden">
              <div className="absolute top-2 right-2 p-1 bg-destructive/10 rounded-full"><ArrowDownRight className="h-4 w-4 text-destructive" /></div>
              <CardHeader className="pb-2">
                <CardDescription className="uppercase font-bold text-[10px] tracking-widest text-destructive">Créditos Generados</CardDescription>
                <CardTitle className="text-2xl font-headline font-bold text-destructive">${totals.pendingUSD.toFixed(2)}</CardTitle>
              </CardHeader>
              <CardContent><p className="text-[10px] text-muted-foreground">Monto pendiente por cobrar</p></CardContent>
            </Card>

            <Card className="bg-accent/5 border-accent/20 shadow-lg relative overflow-hidden">
              <div className="absolute top-2 right-2 p-1 bg-accent/10 rounded-full"><TrendingUp className="h-4 w-4 text-accent" /></div>
              <CardHeader className="pb-2">
                <CardDescription className="uppercase font-bold text-[10px] tracking-widest text-accent">Tasa de la Fecha</CardDescription>
                <CardTitle className="text-2xl font-headline font-bold text-accent">{effectiveRate.toFixed(2)} BS</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[10px] text-accent/80 font-bold uppercase tracking-wider">{rateSourceLabel}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="bg-card border-border shadow-xl h-fit">
              <CardHeader className="border-b border-border bg-muted/20">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary" />
                  Desglose de Cobros del Día
                </CardTitle>
                <CardDescription>Dinero real recibido según método de pago.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <PaymentRow 
                  icon={Wallet} 
                  label="Divisas ($)" 
                  amountUSD={totals.methodBreakdown['DIVISAS']?.usd || 0} 
                  color="text-green-400" 
                  isBsMethod={false}
                />
                <PaymentRow 
                  icon={Smartphone} 
                  label="Pago Móvil / Transf." 
                  amountUSD={(totals.methodBreakdown['PAGO_MOVIL']?.usd || 0) + (totals.methodBreakdown['TRANSFERENCIA']?.usd || 0)} 
                  amountBS={(totals.methodBreakdown['PAGO_MOVIL']?.bs || 0) + (totals.methodBreakdown['TRANSFERENCIA']?.bs || 0)} 
                  color="text-primary" 
                  isBsMethod={true}
                />
                <PaymentRow 
                  icon={CreditCard} 
                  label="Punto de Venta" 
                  amountUSD={totals.methodBreakdown['PUNTO']?.usd || 0} 
                  amountBS={totals.methodBreakdown['PUNTO']?.bs || 0} 
                  color="text-accent" 
                  isBsMethod={true}
                />
                <PaymentRow 
                  icon={Banknote} 
                  label="Efectivo BS" 
                  amountUSD={totals.methodBreakdown['EFECTIVO_BS']?.usd || 0} 
                  amountBS={totals.methodBreakdown['EFECTIVO_BS']?.bs || 0} 
                  color="text-muted-foreground" 
                  isBsMethod={true}
                />
                
                <div className="pt-4 border-t border-border flex justify-between items-center px-2">
                  <span className="text-sm font-bold uppercase text-muted-foreground">Equivalente Real BS</span>
                  <span className="text-xl font-headline font-bold text-accent">{(totals.collectedUSD * effectiveRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BS</span>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="bg-card border-border shadow-xl h-fit overflow-hidden">
                <CardHeader className="border-b border-border bg-muted/20 pb-3">
                  <div className="flex justify-between items-center">
                    <div className="space-y-0.5">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Package className="h-5 w-5 text-primary" />
                        Balance Diario de Insumos ({currentLocationName})
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Entradas, consumo en comandas, mermas y stock disponible del día.
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold">
                      {inventoryAudit.length} Insumos
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/10">
                        <TableHead className="font-bold text-xs">Insumo</TableHead>
                        <TableHead className="text-center font-bold text-xs text-green-400">Llegó</TableHead>
                        <TableHead className="text-center font-bold text-xs text-blue-400">Vendido</TableHead>
                        <TableHead className="text-center font-bold text-xs text-destructive">Merma</TableHead>
                        <TableHead className="text-center font-bold text-xs">Queda</TableHead>
                        <TableHead className="text-center font-bold text-xs">Estatus</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryAudit.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                            No hay insumos registrados en esta sucursal.
                          </TableCell>
                        </TableRow>
                      ) : (
                        inventoryAudit.map(item => (
                          <TableRow key={item.id} className="hover:bg-muted/10">
                            <TableCell className="font-bold text-xs py-3">{item.name}</TableCell>
                            
                            {/* 1. Llegó (Entradas / Traslados recibidos hoy) */}
                            <TableCell className="text-center py-3">
                              {item.entered > 0 ? (
                                <span className="font-bold text-xs text-green-400">{item.entered} {item.unit}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground/40">—</span>
                              )}
                            </TableCell>

                            {/* 2. Vendido (Consumo en cocina por comandas) */}
                            <TableCell className="text-center py-3">
                              {item.consumed > 0 ? (
                                <span className="font-bold text-xs text-blue-400">{item.consumed} {item.unit}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground/40">—</span>
                              )}
                            </TableCell>

                            {/* 3. Merma reportada */}
                            <TableCell className="text-center py-3">
                              {item.wasted > 0 ? (
                                <span className="font-bold text-xs text-destructive">{item.wasted} {item.unit}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground/40">—</span>
                              )}
                            </TableCell>

                            {/* 4. Queda (Stock actual en sede) */}
                            <TableCell className="text-center py-3">
                              <Badge variant={item.isLow ? "destructive" : "outline"} className={cn("text-[10px]", !item.isLow && "text-green-400 border-green-500/30")}>
                                {item.stock} {item.unit}
                              </Badge>
                            </TableCell>

                            {/* 5. Estatus */}
                            <TableCell className="text-center py-3">
                              {item.isCritical ? (
                                <Badge variant="destructive" className="text-[8px]">CRÍTICO</Badge>
                              ) : item.isLow ? (
                                <Badge variant="destructive" className="text-[8px]">BAJO</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[8px] bg-green-500/10 text-green-400">ÓPTIMO</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <div className="p-6 bg-primary/5 border border-primary/10 rounded-2xl flex items-start gap-4">
                <div className="p-2 bg-primary/20 rounded-lg shrink-0"><Info className="h-5 w-5 text-primary" /></div>
                <div className="space-y-1">
                  <h4 className="font-bold text-primary text-sm">Conciliación Ética & Operativa</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    El balance compara los insumos que <b>ingresaron</b> vs lo que se <b>gastó en ventas</b> y <b>mermas</b>. Si el saldo físico en nevera no coincide con lo que queda, revisa si hay comandas pendientes de cobro o mermas sin registrar.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function PaymentRow({ icon: Icon, label, amountUSD, amountBS, color, isBsMethod }: any) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/10 transition-colors">
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded bg-muted", color)}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="text-right">
        {isBsMethod ? (
          <>
            <p className="font-bold text-sm">{amountBS ? amountBS.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"} BS</p>
            <p className="text-[10px] text-muted-foreground font-bold">~ ${amountUSD ? amountUSD.toFixed(2) : "0.00"}</p>
          </>
        ) : (
          <p className="font-bold text-sm">${amountUSD ? amountUSD.toFixed(2) : "0.00"}</p>
        )}
      </div>
    </div>
  );
}
