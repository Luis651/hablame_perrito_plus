"use client";

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { AppSidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  DollarSign, 
  ShoppingBag, 
  AlertTriangle, 
  TrendingUp, 
  MapPin, 
  Wallet, 
  UtensilsCrossed, 
  Plus, 
  Package, 
  ArrowRightLeft, 
  Scale, 
  CheckCircle2, 
  Clock 
} from 'lucide-react';
import { MOCK_CONFIG, MOCK_LOCATIONS } from '@/lib/mock-data';
import { cn, round2 } from '@/lib/utils';
import { useFirestore, useDoc, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { doc, collection, query } from 'firebase/firestore';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function DashboardPage() {
  const firestore = useFirestore();
  const { user, profile, role } = useUser();
  const isAdmin = role === 'ADMIN';

  const [activeLocationId, setActiveLocationId] = useState<string>("br-1");

  useEffect(() => {
    if (profile?.locationId) {
      const isBranch = MOCK_LOCATIONS.find(l => l.id === profile.locationId)?.type === 'BRANCH';
      setActiveLocationId(isBranch ? profile.locationId : "br-1");
    }
  }, [profile]);

  // Tasa cambiaria en tiempo real
  const configRef = useMemoFirebase(() => doc(firestore, 'config', 'exchangeRate'), [firestore]);
  const { data: exchangeData } = useDoc(configRef);
  const currentExchangeRate = exchangeData?.exchangeRate || MOCK_CONFIG.exchangeRate;

  // Órdenes de la sede seleccionada
  const ordersQuery = useMemoFirebase(() => {
    if (!user || !activeLocationId) return null;
    return query(collection(firestore, 'locations', activeLocationId, 'orders'));
  }, [firestore, activeLocationId, user]);
  const { data: rawOrders, isLoading: ordersLoading } = useCollection(ordersQuery);

  // Insumos e inventario de la sede
  const ingredientsQuery = useMemoFirebase(() => collection(firestore, 'ingredients'), [firestore]);
  const { data: ingredients, isLoading: ingredientsLoading } = useCollection(ingredientsQuery);

  const inventoryQuery = useMemoFirebase(() => {
    if (!activeLocationId) return null;
    return collection(firestore, 'locations', activeLocationId, 'inventory');
  }, [firestore, activeLocationId]);
  const { data: currentInventory, isLoading: inventoryLoading } = useCollection(inventoryQuery);

  // Fecha de hoy
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Filtrar órdenes de hoy
  const todayOrders = useMemo(() => {
    if (!rawOrders) return [];
    return rawOrders.filter(o => {
      const d = o.orderDate?.seconds ? format(new Date(o.orderDate.seconds * 1000), 'yyyy-MM-dd') : '';
      return d === todayStr;
    }).sort((a, b) => (b.orderDate?.seconds || 0) - (a.orderDate?.seconds || 0));
  }, [rawOrders, todayStr]);

  // Métricas calculadas en tiempo real
  const metrics = useMemo(() => {
    const totalSalesUSD = round2(todayOrders.reduce((sum, o) => sum + (o.totalUSD || 0), 0));
    const totalPaidUSD = round2(todayOrders.reduce((sum, o) => sum + (o.totalPaidUSD || 0), 0));
    const totalPendingUSD = round2(todayOrders.reduce((sum, o) => sum + (o.pendingBalanceUSD || 0), 0));
    const totalTransactions = todayOrders.length;
    const avgTicketUSD = totalTransactions > 0 ? round2(totalSalesUSD / totalTransactions) : 0;
    const paidOrdersCount = todayOrders.filter(o => o.status === 'PAID').length;
    const openOrdersCount = todayOrders.filter(o => o.status !== 'PAID').length;

    return {
      totalSalesUSD,
      totalPaidUSD,
      totalPendingUSD,
      totalTransactions,
      avgTicketUSD,
      paidOrdersCount,
      openOrdersCount
    };
  }, [todayOrders]);

  // Alertas de stock crítico/bajo
  const lowStockItems = useMemo(() => {
    if (!ingredients || !currentInventory) return [];
    return ingredients.map(ing => {
      const invItem = currentInventory.find((i: any) => i.ingredientId === ing.id);
      const qty = invItem ? invItem.quantity : 0;
      const isCritical = qty <= 10;
      const isLow = qty <= 25;
      return {
        id: ing.id,
        name: ing.name,
        unit: ing.unit || 'und',
        category: ing.category || 'General',
        quantity: qty,
        isLow,
        isCritical
      };
    }).filter(i => i.isLow).sort((a, b) => a.quantity - b.quantity);
  }, [ingredients, currentInventory]);

  const currentLocationName = MOCK_LOCATIONS.find(l => l.id === activeLocationId)?.name || "Sucursal";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar role={role} />
      
      <main className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-8 pt-16 pb-24 lg:pt-8 lg:pb-8">
        <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
          
          {/* HEADER */}
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-headline font-bold text-foreground">
                Dashboard
              </h1>
              <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                Bienvenido, <span className="text-foreground font-semibold">{profile?.firstName || user?.email?.split('@')[0] || 'Usuario'}</span> ({role || 'OPERADOR'})
                <span className="text-muted-foreground/40">•</span>
                <MapPin className="h-4 w-4 text-primary" /> <span className="text-primary font-bold">{currentLocationName}</span>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              {isAdmin && (
                <Select value={activeLocationId || "br-1"} onValueChange={(val) => { if (val) setActiveLocationId(val); }}>
                  <SelectTrigger className="h-10 w-full sm:w-48 bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOCK_LOCATIONS.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.type === 'WAREHOUSE' ? '🏢' : '📍'} {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div className="bg-card px-4 py-2 rounded-xl border border-border shadow-sm flex items-center gap-3 w-full sm:w-auto justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-accent" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tasa Hoy:</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-headline font-bold text-accent">{currentExchangeRate.toFixed(2)}</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">BS/$</span>
                </div>
              </div>
            </div>
          </header>

          {/* KPI STAT CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <StatCard 
              title="Ventas Totales (Hoy)" 
              value={`$${metrics.totalSalesUSD.toFixed(2)}`} 
              subValue={`~ ${(metrics.totalSalesUSD * currentExchangeRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })} BS`}
              icon={DollarSign} 
              color="text-primary" 
              badge={`${metrics.paidOrdersCount} pagadas / ${metrics.openOrdersCount} abiertas`}
              badgeColor="text-primary bg-primary/10"
            />
            <StatCard 
              title="Recaudado en Caja" 
              value={`$${metrics.totalPaidUSD.toFixed(2)}`} 
              subValue={`Créditos: $${metrics.totalPendingUSD.toFixed(2)}`}
              icon={Wallet} 
              color="text-green-400" 
              badge={metrics.totalPendingUSD > 0 ? "Saldo Pendiente" : "Al día"}
              badgeColor={metrics.totalPendingUSD > 0 ? "text-amber-400 bg-amber-500/10" : "text-green-400 bg-green-500/10"}
            />
            <StatCard 
              title="Tickets / Promedio" 
              value={`${metrics.totalTransactions} pedidos`} 
              subValue={`Promedio: $${metrics.avgTicketUSD.toFixed(2)} / ticket`}
              icon={ShoppingBag} 
              color="text-accent" 
              badge="Actividad Hoy"
              badgeColor="text-accent bg-accent/10"
            />
            <StatCard 
              title="Stock Crítico" 
              value={`${lowStockItems.length}`} 
              subValue={lowStockItems.length > 0 ? `${lowStockItems.filter(i => i.isCritical).length} insumos muy bajos` : "Niveles estables"}
              icon={AlertTriangle} 
              color={lowStockItems.length > 0 ? "text-destructive" : "text-muted-foreground"} 
              badge={lowStockItems.length > 0 ? "Revisar Insumos" : "Óptimo"}
              badgeColor={lowStockItems.length > 0 ? "text-destructive bg-destructive/10" : "text-green-400 bg-green-500/10"}
            />
          </div>

          {/* ACCIONES RÁPIDAS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link href="/comandas" className="block">
              <Button variant="outline" className="w-full h-14 justify-start gap-3 bg-card border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left">
                <div className="p-2 rounded-lg bg-primary/10 text-primary"><Plus className="h-5 w-5" /></div>
                <div>
                  <p className="font-bold text-xs">Comandas</p>
                  <p className="text-[10px] text-muted-foreground">Tomar pedidos</p>
                </div>
              </Button>
            </Link>
            <Link href="/cuadre" className="block">
              <Button variant="outline" className="w-full h-14 justify-start gap-3 bg-card border-border hover:border-green-500/50 hover:bg-green-500/5 transition-all text-left">
                <div className="p-2 rounded-lg bg-green-500/10 text-green-400"><Scale className="h-5 w-5" /></div>
                <div>
                  <p className="font-bold text-xs">Cuadre Caja</p>
                  <p className="text-[10px] text-muted-foreground">Arqueo diario</p>
                </div>
              </Button>
            </Link>
            <Link href="/inventario" className="block">
              <Button variant="outline" className="w-full h-14 justify-start gap-3 bg-card border-border hover:border-accent/50 hover:bg-accent/5 transition-all text-left">
                <div className="p-2 rounded-lg bg-accent/10 text-accent"><Package className="h-5 w-5" /></div>
                <div>
                  <p className="font-bold text-xs">Inventario</p>
                  <p className="text-[10px] text-muted-foreground">Stock y bultos</p>
                </div>
              </Button>
            </Link>
            <Link href="/transferencias" className="block">
              <Button variant="outline" className="w-full h-14 justify-start gap-3 bg-card border-border hover:border-amber-500/50 hover:bg-amber-500/5 transition-all text-left">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400"><ArrowRightLeft className="h-5 w-5" /></div>
                <div>
                  <p className="font-bold text-xs">Traslados</p>
                  <p className="text-[10px] text-muted-foreground">Mover insumos</p>
                </div>
              </Button>
            </Link>
          </div>

          {/* MAIN CONTENT GRID: RECENT ORDERS & INVENTORY ALERTS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
            
            {/* ÚLTIMAS COMANDAS EN VIVO */}
            <Card className="lg:col-span-2 bg-card border-border shadow-xl">
              <CardHeader className="flex flex-row items-center justify-between border-b border-border bg-muted/10 pb-4">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <UtensilsCrossed className="h-5 w-5 text-primary" />
                    Comandas de Hoy ({currentLocationName})
                  </CardTitle>
                  <CardDescription>Actividad reciente de pedidos registrados el día de hoy.</CardDescription>
                </div>
                <Link href="/comandas">
                  <Button variant="ghost" size="sm" className="text-xs text-primary font-bold">
                    Ver todas &rarr;
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                {ordersLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
                    ))}
                  </div>
                ) : todayOrders.length === 0 ? (
                  <div className="py-12 text-center space-y-3 bg-muted/5 rounded-2xl border border-dashed border-border">
                    <UtensilsCrossed className="h-8 w-8 text-muted-foreground mx-auto" />
                    <p className="text-sm font-bold text-foreground">No hay comandas registradas hoy</p>
                    <p className="text-xs text-muted-foreground">Inicia una nueva comanda desde el botón de accesos rápidos.</p>
                    <Link href="/comandas">
                      <Button size="sm" className="mt-2 gap-1 text-xs"><Plus className="h-4 w-4" /> Nueva Comanda</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {todayOrders.slice(0, 6).map((order) => {
                      const isPaid = order.status === 'PAID';
                      const timeStr = order.orderDate?.seconds 
                        ? format(new Date(order.orderDate.seconds * 1000), 'hh:mm a') 
                        : '--:--';
                      return (
                        <div 
                          key={order.id} 
                          className="flex items-center justify-between p-3.5 rounded-xl border border-border/60 bg-background/50 hover:bg-muted/10 transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "p-2.5 rounded-xl flex items-center justify-center font-bold text-xs",
                              isPaid ? "bg-green-500/10 text-green-400" : "bg-primary/10 text-primary"
                            )}>
                              {order.tableNumber && order.tableNumber !== "N/A" ? `M:${order.tableNumber}` : 'DEL'}
                            </div>
                            <div className="space-y-0.5">
                              <p className="font-bold text-sm text-foreground flex items-center gap-2">
                                {order.customerNotes || 'Cliente General'}
                                <span className="text-[10px] text-muted-foreground font-normal">({order.orderNumber})</span>
                              </p>
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {timeStr}
                              </p>
                            </div>
                          </div>
                          
                          <div className="text-right space-y-1">
                            <p className="font-headline font-bold text-sm text-foreground">
                              ${(order.totalUSD || 0).toFixed(2)}
                            </p>
                            <Badge 
                              variant={isPaid ? "secondary" : "outline"} 
                              className={cn(
                                "text-[9px] px-1.5 py-0 font-bold",
                                isPaid ? "bg-green-500/20 text-green-400 border-transparent" : "text-primary border-primary/30"
                              )}
                            >
                              {isPaid ? "PAGADA" : `PEND: $${(order.pendingBalanceUSD || 0).toFixed(2)}`}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ALERTAS DE STOCK CRÍTICO */}
            <Card className="bg-card border-border shadow-xl flex flex-col">
              <CardHeader className="border-b border-border bg-muted/10 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Alertas de Insumos
                </CardTitle>
                <CardDescription>Insumos que requieren reposición en {currentLocationName}.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 flex-1 flex flex-col justify-between">
                {inventoryLoading || ingredientsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-12 rounded-xl bg-muted/40 animate-pulse" />
                    ))}
                  </div>
                ) : lowStockItems.length === 0 ? (
                  <div className="py-12 text-center space-y-2 bg-green-500/5 rounded-2xl border border-green-500/20 my-auto">
                    <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto" />
                    <p className="text-sm font-bold text-green-400">Stock Óptimo</p>
                    <p className="text-xs text-muted-foreground px-4">Todos los insumos tienen niveles suficientes en esta sede.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {lowStockItems.slice(0, 5).map(item => (
                      <div 
                        key={item.id} 
                        className="flex items-center justify-between p-2.5 rounded-xl border border-border/50 bg-background/50"
                      >
                        <div className="space-y-0.5">
                          <p className="font-bold text-xs text-foreground">{item.name}</p>
                          <span className="text-[9px] text-muted-foreground uppercase">{item.category}</span>
                        </div>
                        <div className="text-right">
                          <Badge 
                            variant="destructive" 
                            className={cn(
                              "text-[10px] font-bold px-2 py-0.5",
                              !item.isCritical && "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            )}
                          >
                            {item.quantity} {item.unit}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {lowStockItems.length > 5 && (
                      <p className="text-[10px] text-center text-muted-foreground pt-1 italic">
                        +{lowStockItems.length - 5} insumos más con stock bajo.
                      </p>
                    )}
                  </div>
                )}

                <div className="pt-4 mt-4 border-t border-border">
                  <Link href="/transferencias" className="block">
                    <Button variant="secondary" className="w-full text-xs font-bold gap-2">
                      <ArrowRightLeft className="h-4 w-4" /> Solicitar Traslado de Depósito
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

          </div>

        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, subValue, icon: Icon, color, badge, badgeColor }: any) {
  return (
    <Card className="bg-card shadow-lg border-border hover:border-primary/30 transition-all group">
      <CardContent className="p-5 sm:p-6">
        <div className="flex justify-between items-start mb-3">
          <div className={cn("p-2.5 rounded-xl bg-muted group-hover:bg-primary/10 transition-colors", color)}>
            <Icon className="h-5 w-5" />
          </div>
          {badge && (
            <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full", badgeColor)}>
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <h3 className="text-2xl sm:text-3xl font-headline font-bold mt-1 tracking-tight text-foreground">{value}</h3>
        {subValue && (
          <p className="text-[11px] text-muted-foreground font-medium mt-1">{subValue}</p>
        )}
      </CardContent>
    </Card>
  );
}
