"use client";

import { AppSidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign, ShoppingBag, AlertTriangle, TrendingUp } from 'lucide-react';
import { MOCK_CONFIG } from '@/lib/mock-data';
import { cn } from '@/lib/utils';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

export default function DashboardPage() {
  const firestore = useFirestore();

  // Tasa cambiaria en tiempo real
  const configRef = useMemoFirebase(() => doc(firestore, 'config', 'exchangeRate'), [firestore]);
  const { data: exchangeData } = useDoc(configRef);
  const currentExchangeRate = exchangeData?.exchangeRate || MOCK_CONFIG.exchangeRate;

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar role="ADMIN" />
      
      <main className="flex-1 overflow-y-auto bg-background p-8 pt-16 lg:pt-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-headline font-bold text-foreground">Dashboard</h1>
              <p className="text-muted-foreground">Bienvenido de nuevo, Administrador.</p>
            </div>
            <div className="bg-card px-4 py-3 rounded-xl border border-border shadow-sm flex flex-col items-end">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-3 w-3 text-accent" />
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Tasa del día</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-headline font-bold text-accent">{currentExchangeRate.toFixed(2)}</span>
                <span className="text-xs font-bold text-muted-foreground uppercase">BS / USD</span>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              title="Ventas Hoy" 
              value={"$0.00"} 
              icon={DollarSign} 
              trend="" 
              color="text-primary" 
            />
            <StatCard 
              title="Transacciones" 
              value={"0"} 
              icon={ShoppingBag} 
              trend="" 
              color="text-accent" 
            />
            <StatCard 
              title="Prom. Ticket" 
              value={"$0.00"} 
              icon={TrendingUp} 
              trend="" 
              color="text-green-400" 
            />
            <StatCard 
              title="Stock Crítico" 
              value={"0"} 
              icon={AlertTriangle} 
              trend="" 
              color="text-destructive" 
            />
          </div>

          <div className="grid grid-cols-1 gap-8">
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg">Alertas de Inventario</CardTitle>
                <CardDescription>Resumen de insumos críticos.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground text-center py-4">No hay alertas críticas hoy.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, color }: any) {
  return (
    <Card className="bg-card shadow-lg border-border/50 hover:border-primary/20 transition-all group">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className={cn("p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors", color)}>
            <Icon className="h-5 w-5" />
          </div>
          {trend && (
            <span className={cn(
              "text-xs font-bold px-2 py-0.5 rounded-full",
              trend.startsWith('+') ? "text-green-400 bg-green-500/10" : "text-destructive bg-destructive/10"
            )}>
              {trend}
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <h3 className="text-3xl font-headline font-bold mt-1 tracking-tight">{value}</h3>
      </CardContent>
    </Card>
  );
}
