
"use client";

import { useState, useEffect } from 'react';
import { AppSidebar } from '@/components/layout/Sidebar';
import { OrderCard } from '@/components/orders/OrderCard';
import { Button } from '@/components/ui/button';
import { 
  Search, 
  Calendar as CalendarIcon, 
  X, 
  Archive,
  ArrowLeft,
  MapPin,
  CircleDollarSign,
  Wallet
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  useCollection, 
  useDoc,
  useFirestore, 
  useMemoFirebase, 
  useUser
} from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import { MOCK_LOCATIONS } from '@/lib/mock-data';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export default function HistorialPage() {
  const firestore = useFirestore();
  const { user, role, profile } = useUser();
  const isAdmin = role === 'ADMIN';
  
  const [activeLocationId, setActiveLocationId] = useState<string>("br-1");

  useEffect(() => {
    if (profile?.locationId) {
      const isBranch = MOCK_LOCATIONS.find(l => l.id === profile.locationId)?.type === 'BRANCH';
      setActiveLocationId(isBranch ? profile.locationId : "br-1");
    }
  }, [profile]);

  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const historyQuery = useMemoFirebase(() => {
    if (!user || !activeLocationId) return null;
    return query(
      collection(firestore, 'locations', activeLocationId, 'orders'), 
      where('archived', '==', true)
    );
  }, [firestore, activeLocationId, user]);
  
  const { data: rawHistory, isLoading: historyLoading } = useCollection(historyQuery);
  
  const history = rawHistory?.filter(order => {
    const orderDate = order.orderDate?.seconds ? format(new Date(order.orderDate.seconds * 1000), 'yyyy-MM-dd') : '';
    const matchesDate = orderDate === selectedDate;
    const matchesSearch = 
      order.customerNotes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesDate && matchesSearch;
  }).sort((a, b) => (b.orderDate?.seconds || 0) - (a.orderDate?.seconds || 0));

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

  const currentLocationName = MOCK_LOCATIONS.find(l => l.id === activeLocationId)?.name || "Sucursal";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar role={role} />
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-16 lg:pt-8">
        <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/comandas">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowLeft className="h-6 w-6" />
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl md:text-4xl font-headline font-bold text-foreground">Historial</h1>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> {currentLocationName}
                </p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              {isAdmin && (
                <Select value={activeLocationId || "br-1"} onValueChange={(val) => { if(val) setActiveLocationId(val) }}>
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
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                <Input 
                  type="date" 
                  className="pl-10 h-10 w-full sm:w-44 bg-card"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar..." 
                  className="pl-10 h-10 w-full sm:w-56 bg-card" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {!user || historyLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-48 rounded-xl bg-card animate-pulse border border-border" />
              ))
            ) : history?.length === 0 ? (
              <div className="col-span-full py-20 text-center space-y-4 bg-muted/10 rounded-3xl border border-dashed border-border">
                <div className="p-4 bg-muted/20 rounded-full w-fit mx-auto">
                  <Archive className="h-10 w-10 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-xl font-headline font-bold">No hay registros</h3>
                  <p className="text-muted-foreground">Sede: {currentLocationName}</p>
                </div>
              </div>
            ) : history?.map(order => (
              <OrderCard 
                key={order.id} 
                order={{
                  ...order,
                  createdAt: order.orderDate?.seconds ? new Date(order.orderDate.seconds * 1000).toISOString() : new Date().toISOString(),
                  totalUSD: order.totalUSD || 0,
                  paidUSD: order.totalPaidUSD || 0,
                  pendingUSD: order.pendingBalanceUSD || 0,
                  status: (order.status || 'PAID') as any,
                  items: [] 
                }} 
                onClick={() => setSelectedOrderId(order.id)} 
              />
            ))}
          </div>
        </div>
      </main>
      
      {/* DIALOGO: DETALLE DE HISTORIAL CON PAGOS */}
      <Dialog open={!!selectedOrderId} onOpenChange={(open) => !open && setSelectedOrderId(null)}>
        <DialogContent className="max-w-4xl bg-card border-border shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="sr-only"><DialogTitle>Detalle Histórico</DialogTitle></DialogHeader>
          {selectedOrder ? (
            <div className="flex flex-col h-[85vh]">
              <div className="p-6 border-b border-border bg-muted/20 flex justify-between items-center">
                <div className="space-y-1">
                  <Badge variant="outline" className="border-accent text-accent">ARCHIVO HISTÓRICO</Badge>
                  <DialogTitle className="text-2xl font-headline font-bold">{selectedOrder.customerNotes}</DialogTitle>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Mesa: {selectedOrder.tableNumber}</span>
                    <span>Ticket: {selectedOrder.orderNumber}</span>
                    <span>Sede: {currentLocationName}</span>
                  </div>
                </div>
                {/* Built-in X button will be used here */}
              </div>

              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                <div className="w-full lg:w-2/3 p-6 border-b lg:border-b-0 lg:border-r border-border flex flex-col overflow-hidden">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase mb-4">Detalle de Productos</h4>
                  <ScrollArea className="flex-1 pr-4">
                    <div className="space-y-2">
                      {selectedOrderItems?.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50">
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary" className="h-6 w-6 p-0 flex items-center justify-center rounded-full text-xs">{item.quantity}</Badge>
                            <p className="font-bold text-sm">{item.productName}</p>
                          </div>
                          <span className="font-bold text-sm">${item.subtotalUSD?.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <div className="w-full lg:w-1/3 bg-muted/5 p-6 flex flex-col overflow-hidden">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase mb-4">Auditoría de Pagos</h4>
                  <ScrollArea className="flex-1 mb-4">
                    <div className="space-y-2 pr-2">
                      {selectedOrderPayments?.map(p => (
                        <div key={p.id} className="p-3 rounded-lg bg-card border border-border flex justify-between items-center">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-primary flex items-center gap-1 uppercase">
                              <Wallet className="h-3 w-3" /> {p.paymentMethod}
                            </span>
                            <span className="text-[9px] text-muted-foreground">
                              {p.paymentDate?.seconds ? format(new Date(p.paymentDate.seconds * 1000), 'HH:mm:ss') : ''}
                            </span>
                          </div>
                          <p className="font-bold text-sm">${p.amountUSD.toFixed(2)}</p>
                        </div>
                      ))}
                      {(!selectedOrderPayments || selectedOrderPayments.length === 0) && (
                        <p className="text-xs text-muted-foreground italic text-center py-4">Sin registros de pago.</p>
                      )}
                    </div>
                  </ScrollArea>
                  
                  <div className="space-y-4 pt-4 border-t border-border mt-auto">
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span>Total Facturado</span>
                        <span>${selectedOrder.totalUSD?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-green-400">
                        <span>Total Recaudado</span>
                        <span>${selectedOrder.totalPaidUSD?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-xs font-bold uppercase">Balance Final</span>
                        <span className={cn("text-2xl font-headline font-bold", selectedOrder.pendingBalanceUSD > 0.01 ? "text-destructive" : "text-primary")}>
                          ${selectedOrder.pendingBalanceUSD?.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    {selectedOrder.pendingBalanceUSD <= 0.01 ? (
                      <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-center uppercase text-[10px] font-bold text-green-400">Venta Cerrada</div>
                    ) : (
                      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-center uppercase text-[10px] font-bold text-destructive">Deuda Pendiente</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground">Cargando...</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
