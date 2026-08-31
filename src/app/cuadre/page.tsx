
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
import { cn, round2 } from '@/lib/utils';
import { fetchHistoricalRates, findRateByDate } from '@/lib/dolar-api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

  // Tasa histórica calculada para la fecha seleccionada
  const [historicalRate, setHistoricalRate] = useState<number | null>(null);
  const [rateSourceLabel, setRateSourceLabel] = useState<string>('Tasa en Vivo');
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

  useEffect(() => {
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
        setPaymentsOfDay(allPayments);
      } catch (e) {
        console.error("Error fetching payments", e);
      } finally {
        setLoadingPayments(false);
      }
    }
    fetchPayments();
  }, [firestore, activeLocationId, selectedDate, rawOrders]);

  // Determinar la tasa efectiva para la fecha seleccionada
  useEffect(() => {
    if (selectedDate === todayStr) {
      setHistoricalRate(currentExchangeRate);
      setRateSourceLabel('Tasa Activa Hoy');
      return;
    }

    // 1. Si hubo pagos ese día, tomar la tasa exacta de los pagos
    const paymentWithRate = paymentsOfDay.find(p => p.exchangeRateAtPayment && p.exchangeRateAtPayment > 0);
    if (paymentWithRate) {
      setHistoricalRate(paymentWithRate.exchangeRateAtPayment);
      setRateSourceLabel('Tasa en Comandas');
      return;
    }

    // 2. Si no hay pagos, buscar en el histórico oficial BCV
    if (historyList.length > 0) {
      const match = findRateByDate(historyList, selectedDate);
      if (match && match.promedio > 0) {
        setHistoricalRate(match.promedio);
        setRateSourceLabel(`BCV Oficial (${match.fecha})`);
        return;
      }
    }

    // 3. Fallback a la tasa configurada
    setHistoricalRate(currentExchangeRate);
    setRateSourceLabel('Tasa Referencial');
  }, [selectedDate, todayStr, paymentsOfDay, historyList, currentExchangeRate]);

  const effectiveRate = historicalRate || currentExchangeRate;

  const ingredientsQuery = useMemoFirebase(() => collection(firestore, 'ingredients'), [firestore]);
  const { data: ingredients } = useCollection(ingredientsQuery);

  const inventoryQuery = useMemoFirebase(() => {
    if (!activeLocationId) return null;
    return collection(firestore, 'locations', activeLocationId, 'inventory');
  }, [firestore, activeLocationId]);
  const { data: currentInventory } = useCollection(inventoryQuery);

  const filteredOrders = rawOrders?.filter(o => {
    const d = o.orderDate?.seconds ? format(new Date(o.orderDate.seconds * 1000), 'yyyy-MM-dd') : '';
    return d === selectedDate;
  }) || [];

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
              <Card className="bg-card border-border shadow-xl h-fit">
                <CardHeader className="border-b border-border bg-muted/20">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    Auditoría de Insumos ({currentLocationName})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Insumo</TableHead>
                        <TableHead className="text-center">Stock Sede</TableHead>
                        <TableHead className="text-center">Estatus</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ingredients?.slice(0, 5).map(ing => {
                        const myStock = currentInventory?.find(i => i.ingredientId === ing.id)?.quantity || 0;
                        const isLow = myStock < 20;
                        return (
                          <TableRow key={ing.id} className="hover:bg-muted/10">
                            <TableCell className="font-bold text-xs">{ing.name}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={isLow ? "destructive" : "outline"} className={cn("text-[10px]", !isLow && "text-green-400 border-green-500/30")}>
                                {myStock} {ing.unit}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {isLow ? <Badge variant="destructive" className="text-[8px]">BAJO</Badge> : <Badge variant="secondary" className="text-[8px] bg-green-500/10 text-green-400">ÓPTIMO</Badge>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <div className="p-6 bg-primary/5 border border-primary/10 rounded-2xl flex items-start gap-4">
                <div className="p-2 bg-primary/20 rounded-lg shrink-0"><Info className="h-5 w-5 text-primary" /></div>
                <div className="space-y-1">
                  <h4 className="font-bold text-primary text-sm">Conciliación Ética</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    El sistema de cuadre muestra la diferencia entre lo que se <b>facturó</b> y lo que se <b>recibió</b>. Si hay un desfase alto en "Créditos Generados", asegúrate de que los abonos estén siendo registrados correctamente en el módulo de Comandas.
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
