
"use client";

import { useState, useEffect } from 'react';
import { AppSidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign, ShoppingBag, AlertTriangle, TrendingUp, RefreshCw } from 'lucide-react';
import { generateDailyPerformanceSummary, DailyPerformanceSummaryOutput } from '@/ai/flows/daily-performance-summary';
import { MOCK_CONFIG } from '@/lib/mock-data';
import { cn } from '@/lib/utils';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

export default function DashboardPage() {
  const [aiSummary, setAiSummary] = useState<DailyPerformanceSummaryOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const firestore = useFirestore();

  // Tasa cambiaria en tiempo real
  const configRef = useMemoFirebase(() => doc(firestore, 'config', 'exchangeRate'), [firestore]);
  const { data: exchangeData } = useDoc(configRef);
  const currentExchangeRate = exchangeData?.exchangeRate || MOCK_CONFIG.exchangeRate;

  useEffect(() => {
    async function loadSummary() {
      try {
        const summary = await generateDailyPerformanceSummary();
        setAiSummary(summary);
      } catch (err) {
        console.error("Error loading AI summary", err);
      } finally {
        setLoading(false);
      }
    }
    loadSummary();
  }, []);

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
              value={aiSummary ? `$${aiSummary.salesSummary.totalSalesUSD.toFixed(2)}` : "..."} 
              icon={DollarSign} 
              trend="+12%" 
              color="text-primary" 
            />
            <StatCard 
              title="Transacciones" 
              value={aiSummary ? aiSummary.salesSummary.totalTransactions.toString() : "..."} 
              icon={ShoppingBag} 
              trend="+5%" 
              color="text-accent" 
            />
            <StatCard 
              title="Prom. Ticket" 
              value={aiSummary ? `$${aiSummary.salesSummary.averageTransactionValueUSD.toFixed(2)}` : "..."} 
              icon={TrendingUp} 
              trend="-2%" 
              color="text-green-400" 
            />
            <StatCard 
              title="Stock Crítico" 
              value={aiSummary ? aiSummary.inventorySummary.lowStockItemsCount.toString() : "..."} 
              icon={AlertTriangle} 
              trend="" 
              color="text-destructive" 
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-2 glass-morphism border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Resumen de Inteligencia Artificial
                </CardTitle>
                <CardDescription>Análisis de operaciones generado por GenAI.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="h-24 flex items-center justify-center text-muted-foreground animate-pulse gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Analizando datos operacionales...
                  </div>
                ) : (
                  <>
                    <p className="text-lg leading-relaxed text-foreground/90 italic">
                      "{aiSummary?.overallSummary}"
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                      <div className="p-4 bg-muted/40 rounded-lg border border-border">
                        <span className="text-xs font-bold text-primary uppercase">Producto Estrella</span>
                        <p className="text-xl font-headline mt-1">{aiSummary?.salesSummary.bestSellingProduct}</p>
                      </div>
                      <div className="p-4 bg-muted/40 rounded-lg border border-border">
                        <span className="text-xs font-bold text-accent uppercase">Top Insumos</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {aiSummary?.inventorySummary.topConsumedItems.map(item => (
                            <span key={item} className="text-sm px-2 py-0.5 bg-background rounded border border-border">{item}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg">Alertas de Inventario</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {aiSummary?.inventorySummary.lowStockItems.map(item => (
                    <div key={item} className="flex items-center justify-between p-3 rounded-md bg-destructive/10 border border-destructive/20">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                        <span className="text-sm font-medium">{item}</span>
                      </div>
                      <button className="text-[10px] font-bold uppercase text-destructive hover:underline">Reordenar</button>
                    </div>
                  ))}
                  {(!aiSummary || aiSummary.inventorySummary.lowStockItems.length === 0) && !loading && (
                    <p className="text-sm text-muted-foreground text-center py-4">No hay alertas críticas hoy.</p>
                  )}
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
