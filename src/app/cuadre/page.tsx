
"use client";

import { useState, useMemo, useEffect } from 'react';
import { AppSidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  useCollection, 
  useFirestore, 
  useMemoFirebase, 
  useUser 
} from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
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
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function CuadrePage() {
  const firestore = useFirestore();
  const { user, role, profile } = useUser();
  const isAdmin = role === 'ADMIN';

  const [activeLocationId, setActiveLocationId] = useState<string>(profile?.locationId || "br-1");

  useEffect(() => {
    if (profile?.locationId && !isAdmin) {
      setActiveLocationId(profile.locationId);
    }
  }, [profile, isAdmin]);

  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

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
          collection(firestore, 'locations', activeLocationId, 'orders'),
          where('archived', '==', false) // Solo abonos de órdenes activas para el cuadre
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
    const salesTotalUSD = filteredOrders.reduce((acc, o) => acc + (o.totalUSD || 0), 0);
    
    // Créditos Generados (Lo que quedó debiéndose de las ventas de hoy)
    const pendingUSD = filteredOrders.reduce((acc, o) => acc + (o.pendingBalanceUSD || 0), 0);
    
    // Dinero Real Entrado (Abonos realizados hoy de cualquier orden activa)
    const collectedUSD = paymentsOfDay.reduce((acc, p) => acc + (p.amountUSD || 0), 0);
    
    // Desglose por método de pago (del dinero real)
    const methodBreakdown = paymentsOfDay.reduce((acc, p) => {
      const method = p.paymentMethod || 'OTROS';
      acc[method] = (acc[method] || 0) + p.amountUSD;
      return acc;
    }, {} as Record<string, number>);

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
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-16 lg:pt-8">
        <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-headline font-bold text-foreground">Cuadre de Caja</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" /> <span className="text-primary font-bold">{currentLocationName}</span>
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-3">
              {isAdmin && (
                <Select value={activeLocationId} onValueChange={setActiveLocationId}>
                  <SelectTrigger className="h-10 w-full sm:w-48 bg-card border-border">
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
                  className="pl-10 h-10 bg-card border-border w-full sm:w-44"
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

            <Card className="bg-accent/5 border-accent/20 shadow-lg">
              <CardHeader className="pb-2">
                <CardDescription className="uppercase font-bold text-[10px] tracking-widest text-accent">Tasa del Día</CardDescription>
                <CardTitle className="text-2xl font-headline font-bold text-accent">{MOCK_CONFIG.exchangeRate.toFixed(2)} BS</CardTitle>
              </CardHeader>
              <CardContent><p className="text-[10px] text-muted-foreground">Factor de conversión aplicado</p></CardContent>
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
                <PaymentRow icon={Wallet} label="Divisas ($)" amount={totals.methodBreakdown['DIVISAS'] || 0} color="text-green-400" />
                <PaymentRow icon={Smartphone} label="Pago Móvil / Transf." amount={totals.methodBreakdown['PAGO_MOVIL'] || (totals.methodBreakdown['TRANSFERENCIA'] || 0)} color="text-primary" />
                <PaymentRow icon={CreditCard} label="Punto de Venta" amount={totals.methodBreakdown['PUNTO'] || 0} color="text-accent" />
                <PaymentRow icon={Banknote} label="Efectivo BS" amount={totals.methodBreakdown['EFECTIVO_BS'] || 0} color="text-muted-foreground" />
                
                <div className="pt-4 border-t border-border flex justify-between items-center px-2">
                  <span className="text-sm font-bold uppercase text-muted-foreground">Equivalente Real BS</span>
                  <span className="text-xl font-headline font-bold text-accent">{(totals.collectedUSD * MOCK_CONFIG.exchangeRate).toLocaleString()} BS</span>
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

function PaymentRow({ icon: Icon, label, amount, color }: any) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/10 transition-colors">
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded bg-muted", color)}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="font-bold">${amount.toFixed(2)}</p>
    </div>
  );
}
