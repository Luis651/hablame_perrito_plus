
"use client";

import { Order } from '@/lib/types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, DollarSign, Wallet, User, Hash, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrderCardProps {
  order: Order;
  onClick: (order: Order) => void;
}

export function OrderCard({ order, onClick }: OrderCardProps) {
  const isPaid = order.status === 'PAID';
  const hasDebt = !isPaid && order.pendingUSD > 0;
  
  const statusColors = {
    OPEN: hasDebt ? 'bg-destructive/20 text-destructive border-destructive/30' : 'bg-primary/20 text-primary border-primary/30',
    PAID: 'bg-green-500/20 text-green-400 border-green-500/30',
  };

  const statusLabels = {
    OPEN: hasDebt ? 'Con Deuda' : 'Abierta',
    PAID: 'Pagada',
  };

  return (
    <Card 
      className={cn(
        "group cursor-pointer hover:border-primary/50 transition-all duration-300 order-card-gradient overflow-hidden border-border/50",
        hasDebt && "border-destructive/30"
      )}
      onClick={() => onClick(order)}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-1 overflow-hidden">
            <span className="text-xs text-muted-foreground font-bold uppercase tracking-tighter flex items-center gap-1">
              <User className="h-3 w-3" /> Cliente
            </span>
            <CardTitle className="text-xl font-headline truncate max-w-[150px]">
              {order.customerNotes || "Cliente"}
            </CardTitle>
          </div>
          <Badge className={cn("px-2 py-0.5 font-medium uppercase text-[10px]", statusColors[order.status as keyof typeof statusColors])}>
            {statusLabels[order.status as keyof typeof statusLabels]}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pb-4">
        <div className="space-y-3">
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> 
              {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            {order.tableNumber !== "N/A" && (
              <div className="flex items-center gap-1 font-bold text-accent">
                <Hash className="h-3 w-3" /> Mesa: {order.tableNumber}
              </div>
            )}
          </div>
          
          <div className="pt-2 border-t border-border/50 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Total Pedido</span>
              <span className="text-lg font-headline font-bold text-foreground/80 flex items-center tracking-tighter">
                ${order.totalUSD.toFixed(2)}
              </span>
            </div>
            {hasDebt && (
              <div className="flex justify-between items-center p-2 bg-destructive/5 rounded-md border border-destructive/10">
                <span className="text-[9px] text-destructive font-bold uppercase flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Pendiente
                </span>
                <span className="text-xl font-headline font-bold text-destructive">
                  ${order.pendingUSD.toFixed(2)}
                </span>
              </div>
            )}
            {isPaid && (
              <div className="flex justify-between items-center p-2 bg-green-500/5 rounded-md border border-green-500/10">
                <span className="text-[9px] text-green-400 font-bold uppercase">Pagado</span>
                <span className="text-lg font-headline font-bold text-green-400">
                  ${order.totalUSD.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="bg-muted/30 py-3 group-hover:bg-primary/5 transition-colors border-t border-border/10">
        <button className="text-[10px] font-bold text-primary group-hover:tracking-widest transition-all w-full text-center uppercase">
          Ver Detalle de Cobro
        </button>
      </CardFooter>
    </Card>
  );
}
