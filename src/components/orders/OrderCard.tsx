
import { Order, KitchenStatus } from '@/lib/types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, DollarSign, Wallet, User, Hash, AlertCircle, ChefHat, CheckCheck, Hourglass, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrderCardProps {
  order: Order;
  onClick: (order: Order) => void;
}

export function OrderCard({ order, onClick }: OrderCardProps) {
  const isCancelled = order.status === 'CANCELLED';
  const isPaid = order.status === 'PAID' || (order.pendingBalanceUSD !== undefined && order.pendingBalanceUSD <= 0.005);
  const isPartial = !isCancelled && !isPaid && (order.totalPaidUSD || 0) > 0.005;
  const isUnpaid = !isCancelled && !isPaid && !isPartial;
  const hasDebt = !isCancelled && !isPaid && (order.pendingBalanceUSD || 0) > 0.005;

  // Estado de Cocina (3 estados simples con alta diferenciación visual)
  const kitchen: KitchenStatus = order.kitchenStatus || (isPaid ? 'DELIVERED' : 'PENDING');
  const isDeliveredUnpaid = kitchen === 'DELIVERED' && !isPaid && !isCancelled;
  
  const kitchenConfig: Record<KitchenStatus, { 
    label: string; 
    headerBg: string; 
    cardBorder: string;
  }> = {
    PENDING: { 
      label: '1. EN ESPERA', 
      headerBg: 'bg-amber-500 text-black font-black', 
      cardBorder: 'border-amber-500/50 hover:border-amber-500 shadow-amber-500/10 shadow-lg'
    },
    IN_PREPARATION: { 
      label: '2. EN COCINA', 
      headerBg: 'bg-cyan-400 text-black font-black animate-pulse shadow-cyan-400/30', 
      cardBorder: 'border-cyan-400/60 ring-2 ring-cyan-400/30 hover:border-cyan-400 shadow-cyan-400/20 shadow-xl'
    },
    DELIVERED: { 
      label: '3. ENTREGADO', 
      headerBg: 'bg-purple-600 text-white font-bold', 
      cardBorder: 'border-purple-500/40 hover:border-purple-500/70 shadow-sm'
    }
  };

  const currentKitchen = isCancelled
    ? {
        label: 'COMANDA BLOQUEADA',
        headerBg: 'bg-zinc-800 text-zinc-300 font-black border-b border-zinc-700',
        cardBorder: 'border-zinc-800 bg-zinc-950/70 opacity-75 hover:opacity-100 hover:border-zinc-700 shadow-none'
      }
    : isDeliveredUnpaid
    ? {
        label: '3. ENTREGADO - SIN PAGAR',
        headerBg: 'bg-red-600 text-white font-black animate-pulse shadow-red-600/50 shadow-xl border-b border-red-500',
        cardBorder: 'border-2 border-red-600 ring-4 ring-red-600/30 shadow-red-600/25 shadow-2xl bg-red-950/20 hover:border-red-500'
      }
    : kitchenConfig[kitchen] || kitchenConfig.PENDING;

  return (
    <Card 
      className={cn(
        "group cursor-pointer transition-all duration-300 overflow-hidden bg-card border rounded-2xl shadow-md hover:shadow-2xl flex flex-col justify-between",
        currentKitchen.cardBorder
      )}
      onClick={() => onClick(order)}
    >
      <div>
        {/* CABECERA FULL-COLOR KDS (100% VISIBLE A DISTANCIA) */}
        <div className={cn("p-2.5 sm:p-3 px-3.5 sm:px-4 flex justify-between items-center whitespace-nowrap", currentKitchen.headerBg)}>
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-hidden">
            <span className="text-[11px] font-mono font-black bg-black/20 px-2 py-0.5 rounded-lg tracking-wider shrink-0">
              {order.orderNumber}
            </span>
            <span className="text-xs sm:text-sm tracking-wide font-black truncate">
              {currentKitchen.label}
            </span>
          </div>
          
          <span className="text-[11px] font-black bg-black/25 px-2.5 py-0.5 rounded-lg shrink-0 ml-2">
            {order.tableNumber !== "N/A" && order.tableNumber ? `MESA ${order.tableNumber}` : 'DIRECTO'}
          </span>
        </div>

        {/* CUERPO DE LA COMANDA */}
        <div className="p-3.5 sm:p-4 space-y-3">
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 overflow-hidden">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                Cliente
              </span>
              <div className="text-base sm:text-lg font-headline font-black truncate text-foreground">
                {order.customerNotes || "Cliente"}
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[10px] text-muted-foreground font-semibold flex items-center justify-end gap-1 mb-1 whitespace-nowrap">
                <Clock className="h-3 w-3" />
                {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div>
                {isCancelled ? (
                  <Badge className="px-2.5 py-0.5 font-black text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700 whitespace-nowrap">
                    BLOQUEADA
                  </Badge>
                ) : isPaid ? (
                  <Badge className="px-2.5 py-0.5 font-black text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 whitespace-nowrap">
                    PAGADO
                  </Badge>
                ) : isPartial ? (
                  <Badge className="px-2.5 py-0.5 font-bold text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 whitespace-nowrap">
                    ABONADO
                  </Badge>
                ) : (
                  <Badge className="px-2.5 py-0.5 font-black text-[10px] bg-destructive/20 text-destructive border border-destructive/40 whitespace-nowrap">
                    SIN PAGAR
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {isCancelled && (
            <div className="p-2 rounded-xl bg-destructive/10 border border-destructive/20 text-xs">
              <span className="text-[9px] font-black uppercase text-destructive block">Motivo de Bloqueo:</span>
              <p className="text-foreground text-xs font-semibold mt-0.5">{order.cancelReason || "Comanda bloqueada / anulada"}</p>
            </div>
          )}

          {isDeliveredUnpaid && (
            <div className="p-2 px-3 rounded-xl bg-red-600/20 border border-red-500/50 text-xs font-black text-red-400 flex items-center justify-center gap-1.5 animate-pulse text-center">
              <span>¡PELIGRO: Comida servida sin cobrar!</span>
            </div>
          )}

          <div className="pt-2 border-t border-border/60 flex justify-between items-center">
            <div>
              <span className="text-[10px] text-muted-foreground uppercase font-bold block">Total Pedido</span>
              <span className={cn("text-lg sm:text-xl font-headline font-black whitespace-nowrap", isCancelled ? "text-muted-foreground line-through" : "text-foreground")}>
                ${order.totalUSD.toFixed(2)}
              </span>
            </div>

            {isCancelled ? (
              <div className="text-right text-xs text-muted-foreground font-semibold whitespace-nowrap">
                Anulada
              </div>
            ) : hasDebt ? (
              <div className="text-right p-1.5 px-3 rounded-xl bg-destructive/15 border border-destructive/30 shrink-0">
                <span className="text-[9px] text-destructive font-black uppercase block whitespace-nowrap">
                  Saldo Pendiente
                </span>
                <span className="text-base sm:text-lg font-headline font-black text-destructive whitespace-nowrap">
                  ${order.pendingBalanceUSD.toFixed(2)}
                </span>
              </div>
            ) : isPaid ? (
              <div className="text-right text-emerald-400 text-xs font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg whitespace-nowrap">
                Cobro Completo
              </div>
            ) : null}
          </div>
        </div>
      </div>
      
      {/* BOTÓN INFERIOR DE ACCIÓN */}
      <div className="p-2.5 bg-muted/30 group-hover:bg-primary/10 transition-colors border-t border-border/40 text-center">
        <button className="text-[11px] font-black text-primary group-hover:tracking-wider transition-all uppercase flex items-center justify-center gap-1.5 w-full whitespace-nowrap">
          <span>{isCancelled ? 'Ver Motivo de Bloqueo' : 'Ver Detalle / Cobrar'}</span>
          <span className="text-sm">&rarr;</span>
        </button>
      </div>
    </Card>
  );
}
