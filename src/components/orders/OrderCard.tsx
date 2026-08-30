
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
  const isPaid = order.status === 'PAID' || (order.pendingBalanceUSD !== undefined && order.pendingBalanceUSD <= 0.005);
  const hasDebt = !isPaid && (order.pendingBalanceUSD || 0) > 0.005;
  
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
      <CardHeader className="p-3 lg:p-6 pb-1 lg:pb-2">
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-0.5 lg:gap-1 overflow-hidden">
            <span className="text-[10px] lg:text-xs text-muted-foreground font-bold uppercase tracking-tighter flex items-center gap-1">
              <User className="h-3 w-3" /> Cliente
            </span>
            <CardTitle className="text-lg lg:text-xl font-headline truncate max-w-[120px] lg:max-w-[150px]">
              {order.customerNotes || "Cliente"}
            </CardTitle>
          </div>
          <Badge className={cn("px-1.5 py-0 lg:px-2 lg:py-0.5 font-medium uppercase text-[8px] lg:text-[10px]", statusColors[order.status as keyof typeof statusColors])}>
            {statusLabels[order.status as keyof typeof statusLabels]}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="p-3 lg:p-6 pt-0 lg:pt-0 pb-2 lg:pb-4">
        <div className="space-y-2 lg:space-y-3">
          <div className="flex justify-between items-center text-[10px] lg:text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3 lg:h-3.5 lg:w-3.5" /> 
              {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            {order.tableNumber !== "N/A" && (
              <div className="flex items-center gap-1 font-bold text-accent">
                <Hash className="h-3 w-3" /> Mesa: {order.tableNumber}
              </div>
            )}
          </div>
          
          <div className="pt-1.5 lg:pt-2 border-t border-border/50 space-y-1.5 lg:space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[9px] lg:text-[10px] text-muted-foreground uppercase font-bold">Total Pedido</span>
              <span className="text-base lg:text-lg font-headline font-bold text-foreground/80 flex items-center tracking-tighter">
                ${order.totalUSD.toFixed(2)}
              </span>
            </div>
            {hasDebt && (
              <div className="flex justify-between items-center p-1.5 lg:p-2 bg-destructive/5 rounded-md border border-destructive/10">
                <span className="text-[8px] lg:text-[9px] text-destructive font-bold uppercase flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Pendiente
                </span>
                <span className="text-lg lg:text-xl font-headline font-bold text-destructive">
                  ${order.pendingBalanceUSD.toFixed(2)}
                </span>
              </div>
            )}
            {isPaid && (
              <div className="flex justify-between items-center p-1.5 lg:p-2 bg-green-500/5 rounded-md border border-green-500/10">
                <span className="text-[8px] lg:text-[9px] text-green-400 font-bold uppercase">Pagado</span>
                <span className="text-base lg:text-lg font-headline font-bold text-green-400">
                  ${order.totalUSD.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="p-2 lg:p-3 bg-muted/30 group-hover:bg-primary/5 transition-colors border-t border-border/10">
        <button className="text-[9px] lg:text-[10px] font-bold text-primary group-hover:tracking-widest transition-all w-full text-center uppercase">
          Ver Detalle de Cobro
        </button>
      </CardFooter>
    </Card>
  );
}
