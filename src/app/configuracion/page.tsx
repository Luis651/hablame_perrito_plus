
"use client";

import { useState, useEffect, useMemo } from 'react';
import { AppSidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MOCK_CONFIG, MOCK_INGREDIENTS, MOCK_PRODUCTS, MOCK_INVENTORY_SEED } from '@/lib/mock-data';
import { 
  RefreshCw, 
  Save, 
  DollarSign, 
  Trash2, 
  AlertTriangle, 
  Sparkles, 
  Database, 
  Warehouse, 
  Store, 
  TrendingUp, 
  Calendar, 
  CalendarDays, 
  Landmark, 
  Coins, 
  CheckCircle2, 
  History, 
  Search,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useFirestore, setDocumentNonBlocking, deleteDocumentNonBlocking, useDoc, useMemoFirebase, useUser } from '@/firebase';
import { collection, getDocs, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { fetchOfficialRates, fetchHistoricalRates, findRateByDate, OfficialRate, HistoricalRate } from '@/lib/dolar-api';
import { cn } from '@/lib/utils';

export default function ConfiguracionPage() {
  const firestore = useFirestore();
  const { role } = useUser();
  const { toast } = useToast();
  
  // Tasa cambiaria en tiempo real de Firestore
  const configRef = useMemoFirebase(() => doc(firestore, 'config', 'exchangeRate'), [firestore]);
  const { data: exchangeData } = useDoc(configRef);
  
  const [rate, setRate] = useState(exchangeData?.exchangeRate?.toString() || MOCK_CONFIG.exchangeRate.toString());
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // Estados para API Oficial BCV
  const [liveBcvUsd, setLiveBcvUsd] = useState<OfficialRate | null>(null);
  const [liveBcvEur, setLiveBcvEur] = useState<OfficialRate | null>(null);
  const [isLoadingBcv, setIsLoadingBcv] = useState(false);

  // Estados para Calendario / Historial de Tasas
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'EUR'>('USD');
  const [historyRates, setHistoryRates] = useState<HistoricalRate[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [historySearchTerm, setHistorySearchTerm] = useState('');

  const branchId = "br-1";
  const warehouseId = "wh-1";

  // Cargar tasas oficiales en vivo al montar
  const loadBcvRates = async () => {
    setIsLoadingBcv(true);
    try {
      const { usd, eur } = await fetchOfficialRates();
      setLiveBcvUsd(usd);
      setLiveBcvEur(eur);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingBcv(false);
    }
  };

  // Cargar histórico de la moneda seleccionada
  const loadHistory = async (curr: 'USD' | 'EUR') => {
    setIsLoadingHistory(true);
    try {
      const data = await fetchHistoricalRates(curr);
      setHistoryRates(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadBcvRates();
  }, []);

  useEffect(() => {
    loadHistory(selectedCurrency);
  }, [selectedCurrency]);

  useEffect(() => {
    if (exchangeData?.exchangeRate) {
      setRate(exchangeData.exchangeRate.toString());
    }
  }, [exchangeData]);

  // Aplicar tasa oficial BCV directamente
  const handleApplyBcvRate = (val: number, label: string, currency: 'USD' | 'EUR' = 'USD') => {
    setRate(val.toFixed(2));
    setDocumentNonBlocking(configRef, {
      exchangeRate: val,
      currencySymbol: currency,
      currencyName: label,
      rateSource: currency === 'EUR' ? 'BCV_EUR' : 'BCV_USD',
      lastUpdated: serverTimestamp()
    }, { merge: true });

    toast({
      title: `Tasa ${label} aplicada`,
      description: `Se actualizó el factor cambiario a ${val.toFixed(2)} BS por ${currency === 'EUR' ? '€' : '$'} en la nube.`
    });
  };

  const handleSave = () => {
    const rateNum = parseFloat(rate);
    if (isNaN(rateNum) || rateNum <= 0) {
      toast({ variant: "destructive", title: "Tasa inválida" });
      return;
    }

    setIsSaving(true);
    setDocumentNonBlocking(configRef, {
      exchangeRate: rateNum,
      currencySymbol: selectedCurrency,
      currencyName: 'Ajuste Manual',
      rateSource: 'MANUAL',
      lastUpdated: serverTimestamp()
    }, { merge: true });

    setTimeout(() => {
      setIsSaving(false);
      toast({
        title: "Tasa actualizada",
        description: "El factor cambiario ha sido guardado en la nube correctamente.",
      });
    }, 500);
  };

  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      const batch = writeBatch(firestore);

      // 1. Cargar Ingredientes y Sub-Insumos (Maestro)
      MOCK_INGREDIENTS.forEach((ing) => {
        const ref = doc(firestore, 'ingredients', ing.id);
        batch.set(ref, ing);
      });

      // 2. Cargar Productos y Combos con Recetas
      MOCK_PRODUCTS.forEach((prod) => {
        const ref = doc(firestore, 'products', prod.id);
        batch.set(ref, prod);
      });

      // 3. Cargar Inventario en Sucursal CIMA (br-1)
      MOCK_INVENTORY_SEED.forEach((inv) => {
        const ref = doc(firestore, 'locations', 'br-1', 'inventory', inv.ingredientId!);
        batch.set(ref, {
          ...inv,
          id: inv.ingredientId,
          locationId: 'br-1',
          lastUpdatedAt: serverTimestamp()
        });
      });

      // 4. Cargar Inventario en Sucursal TRAGO SPREXX (br-2)
      MOCK_INVENTORY_SEED.forEach((inv) => {
        const ref = doc(firestore, 'locations', 'br-2', 'inventory', inv.ingredientId!);
        batch.set(ref, {
          ...inv,
          id: inv.ingredientId,
          locationId: 'br-2',
          quantity: Math.floor((inv.quantity || 10) * 0.8), // 80% del stock de CIMA
          lastUpdatedAt: serverTimestamp()
        });
      });

      // 5. Cargar Inventario Mayorista en Depósito Central (wh-1)
      MOCK_INGREDIENTS.forEach((ing) => {
        const ref = doc(firestore, 'locations', 'wh-1', 'inventory', ing.id);
        const qty = ing.isSubInsumo ? 120 : (ing.category === 'Carnes en Bruto' ? 80 : 350);
        batch.set(ref, {
          id: ing.id,
          ingredientId: ing.id,
          locationId: 'wh-1',
          quantity: qty, 
          lastUpdatedAt: serverTimestamp()
        });
      });

      // 6. Cargar Tasa Cambiaria Inicial
      batch.set(configRef, {
        exchangeRate: MOCK_CONFIG.exchangeRate,
        lastUpdated: serverTimestamp()
      }, { merge: true });

      // 7. Crear Comandas de Prueba en Sucursal CIMA (br-1)
      const order1Ref = doc(firestore, 'locations', 'br-1', 'orders', 'demo-ord-1');
      batch.set(order1Ref, {
        id: 'demo-ord-1',
        orderNumber: 'ORD-7001',
        locationId: 'br-1',
        orderDate: serverTimestamp(),
        status: 'OPEN',
        totalUSD: 16.00,
        totalPaidUSD: 0,
        pendingBalanceUSD: 16.00,
        waiterId: 'demo-waiter',
        tableNumber: '4',
        customerNotes: 'Carlos Gómez',
        archived: false,
        lastUpdatedAt: serverTimestamp()
      });

      const item1Ref = doc(firestore, 'locations', 'br-1', 'orders', 'demo-ord-1', 'items', 'item-1');
      batch.set(item1Ref, {
        productId: 'p-1',
        productName: 'Hamburguesa Clásica Perrito',
        quantity: 1,
        unitPriceUSD: 6.50,
        subtotalUSD: 6.50,
        notes: 'Sin cebolla',
        orderId: 'demo-ord-1',
        status: 'Pending'
      });
      const item2Ref = doc(firestore, 'locations', 'br-1', 'orders', 'demo-ord-1', 'items', 'item-2');
      batch.set(item2Ref, {
        productId: 'c-1',
        productName: 'Combo Parrandero (Clásica + Papas + Refresco)',
        quantity: 1,
        unitPriceUSD: 9.50,
        subtotalUSD: 9.50,
        notes: 'Refresco bien frío',
        orderId: 'demo-ord-1',
        status: 'Pending'
      });

      // Comanda 2: Pagada (para Dashboard y Cuadre de Caja)
      const order2Ref = doc(firestore, 'locations', 'br-1', 'orders', 'demo-ord-2');
      batch.set(order2Ref, {
        id: 'demo-ord-2',
        orderNumber: 'ORD-7002',
        locationId: 'br-1',
        orderDate: serverTimestamp(),
        status: 'PAID',
        totalUSD: 12.50,
        totalPaidUSD: 12.50,
        pendingBalanceUSD: 0,
        waiterId: 'demo-waiter',
        tableNumber: 'Barra',
        customerNotes: 'María Rodríguez',
        archived: false,
        lastUpdatedAt: serverTimestamp()
      });
      const item3Ref = doc(firestore, 'locations', 'br-1', 'orders', 'demo-ord-2', 'items', 'item-3');
      batch.set(item3Ref, {
        productId: 'c-2',
        productName: 'Combo Doble Boss (Doble Carne + Papas + Refresco)',
        quantity: 1,
        unitPriceUSD: 12.50,
        subtotalUSD: 12.50,
        orderId: 'demo-ord-2',
        status: 'Delivered'
      });
      const pay1Ref = doc(firestore, 'locations', 'br-1', 'orders', 'demo-ord-2', 'payments', 'pay-1');
      batch.set(pay1Ref, {
        id: 'pay-1',
        orderId: 'demo-ord-2',
        amountUSD: 10.00,
        amountBS: 0,
        paymentMethod: 'CASH_USD',
        exchangeRateAtPayment: 36.50,
        paymentDate: serverTimestamp(),
        cashierId: 'demo-cashier'
      });
      const pay2Ref = doc(firestore, 'locations', 'br-1', 'orders', 'demo-ord-2', 'payments', 'pay-2');
      batch.set(pay2Ref, {
        id: 'pay-2',
        orderId: 'demo-ord-2',
        amountUSD: 2.50,
        amountBS: 91.25,
        paymentMethod: 'PAGO_MOVIL',
        exchangeRateAtPayment: 36.50,
        paymentDate: serverTimestamp(),
        cashierId: 'demo-cashier'
      });

      await batch.commit();
      toast({
        title: "Base de Datos Poblada con Éxito",
        description: "Se han cargado materias primas, sub-insumos, productos, combos, inventario multisede y comandas demo.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al sembrar",
        description: error.message || "No se pudieron cargar los datos de prueba.",
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleFactoryReset = async () => {
    const code = prompt("Para confirmar el borrado TOTAL (excepto usuarios), escribe: LIMPIAR");
    if (code !== "LIMPIAR") {
      toast({ title: "Cancelado", description: "No se borró ningún dato." });
      return;
    }

    setIsResetting(true);
    toast({ title: "Limpieza iniciada...", description: "Borrando comandas, inventario, traslados y catálogo. No cierres la ventana." });
    
    try {
      const paths = [
        'ingredients',
        'products',
        'transfers',
        'locations/br-1/orders',
        'locations/br-1/inventory',
        'locations/br-2/orders',
        'locations/br-2/inventory',
        'locations/wh-1/orders',
        'locations/wh-1/inventory'
      ];

      for (const path of paths) {
        const snap = await getDocs(collection(firestore, path));
        snap.forEach((docSnap) => {
          deleteDocumentNonBlocking(docSnap.ref);
        });
      }

      toast({
        title: "¡Sistema como nuevo!",
        description: "Se han eliminado todos los registros de prueba. Listo para empezar desde cero.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error al limpiar",
        description: "No se pudieron borrar todos los datos.",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const currentRateVal = exchangeData?.exchangeRate || parseFloat(rate) || 0;
  const currentSource = exchangeData?.rateSource || (
    liveBcvEur && Math.abs(currentRateVal - liveBcvEur.promedio) < 0.01 ? 'BCV_EUR' :
    liveBcvUsd && Math.abs(currentRateVal - liveBcvUsd.promedio) < 0.01 ? 'BCV_USD' : 'MANUAL'
  );
  const currentCurrency = (exchangeData as any)?.currencySymbol || (currentSource === 'BCV_EUR' ? 'EUR' : 'USD');
  const isUsdActive = currentSource === 'BCV_USD' || (liveBcvUsd && Math.abs(currentRateVal - liveBcvUsd.promedio) < 0.01 && currentCurrency === 'USD');
  const isEurActive = currentSource === 'BCV_EUR' || (liveBcvEur && Math.abs(currentRateVal - liveBcvEur.promedio) < 0.01 && currentCurrency === 'EUR');

  const selectedDateRate = useMemo(() => {
    return findRateByDate(historyRates, selectedHistoryDate);
  }, [historyRates, selectedHistoryDate]);

  const selectedDateRateIndex = useMemo(() => {
    if (!selectedDateRate) return -1;
    return historyRates.findIndex(h => h.fecha === selectedDateRate.fecha);
  }, [historyRates, selectedDateRate]);

  const previousDateRate = useMemo(() => {
    if (selectedDateRateIndex >= 0 && selectedDateRateIndex < historyRates.length - 1) {
      return historyRates[selectedDateRateIndex + 1];
    }
    return null;
  }, [historyRates, selectedDateRateIndex]);

  const dailyVariation = useMemo(() => {
    if (!selectedDateRate || !previousDateRate) return null;
    const diff = selectedDateRate.promedio - previousDateRate.promedio;
    const pct = (diff / previousDateRate.promedio) * 100;
    return { diff, pct };
  }, [selectedDateRate, previousDateRate]);

  const filteredHistoryList = useMemo(() => {
    if (!historySearchTerm) return historyRates.slice(0, 15);
    return historyRates.filter(h => h.fecha.includes(historySearchTerm)).slice(0, 15);
  }, [historyRates, historySearchTerm]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar role={role} />
      
      <main className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-8 pt-16 pb-24 lg:pt-8 lg:pb-8">
        <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
          <header>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-headline font-bold text-foreground">Configuración y Tasas Oficiales</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Control cambiario del BCV, historial por fechas y herramientas del sistema.</p>
          </header>

          {/* SECCION 1: FACTOR CAMBIARIO Y TASAS OFICIALES EN VIVO */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Tarjeta de Tasa Activa en la Nube */}
            <Card className="lg:col-span-5 bg-card border-primary/20 shadow-xl flex flex-col justify-between overflow-hidden">
              <CardHeader className="bg-primary/5 border-b border-primary/10 p-4 sm:p-6">
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Tasa Activa (Nube)
                  </CardTitle>
                  <Badge variant="outline" className={cn(
                    "text-[10px] font-bold px-2.5 py-0.5",
                    isEurActive 
                      ? "bg-accent/15 text-accent border-accent/30" 
                      : isUsdActive 
                      ? "bg-primary/15 text-primary border-primary/30" 
                      : "bg-muted text-muted-foreground border-border"
                  )}>
                    {isEurActive ? '💶 Euro Oficial BCV' : isUsdActive ? '💵 Dólar Oficial BCV' : '✏️ Ajuste Manual'}
                  </Badge>
                </div>
                <CardDescription className="text-xs">Factor de conversión activo para todos los cobros del personal.</CardDescription>
              </CardHeader>

              <CardContent className="p-4 sm:p-6 space-y-5">
                <div className="flex flex-col items-center justify-center p-5 sm:p-6 bg-muted/30 rounded-2xl border border-dashed border-border text-center">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase mb-1">
                    {isEurActive ? 'TASA OFICIAL EURO BCV' : isUsdActive ? 'TASA OFICIAL DÓLAR BCV' : 'TASA EN EL SISTEMA'}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl md:text-5xl font-headline font-bold text-primary">
                      {exchangeData?.exchangeRate?.toFixed(2) || rate}
                    </span>
                    <span className="text-base sm:text-lg text-muted-foreground font-bold">
                      BS / {currentCurrency === 'EUR' ? '€' : '$'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-muted-foreground">
                    Ajuste Manual Personalizado (BS / {currentCurrency === 'EUR' ? '€' : '$'})
                  </label>
                  <div className="relative">
                    <Input 
                      type="number" 
                      value={rate} 
                      onChange={(e) => setRate(e.target.value)}
                      className="h-11 pl-10 text-base font-headline font-bold"
                    />
                    {currentCurrency === 'EUR' ? (
                      <Coins className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-accent" />
                    ) : (
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                    )}
                  </div>
                </div>
              </CardContent>

              <CardFooter className="bg-muted/10 border-t border-border p-4 sm:p-6">
                <Button className="w-full gap-2 h-11 text-xs sm:text-sm font-bold" onClick={handleSave} disabled={isSaving}>
                  <Save className="h-4 w-4" />
                  {isSaving ? "Guardando..." : "Guardar Manual"}
                </Button>
              </CardFooter>
            </Card>

            {/* Tarjeta de Sincronización en Vivo con BCV */}
            <Card className="lg:col-span-7 bg-card border-border shadow-xl flex flex-col justify-between overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border p-4 sm:p-6">
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Landmark className="h-5 w-5 text-accent" />
                    Banco Central de Venezuela (BCV)
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={loadBcvRates} 
                    disabled={isLoadingBcv}
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", isLoadingBcv && "animate-spin text-primary")} />
                    <span>Actualizar</span>
                  </Button>
                </div>
                <CardDescription className="text-xs">Cotizaciones oficiales extraídas de la API oficial.</CardDescription>
              </CardHeader>

              <CardContent className="p-4 sm:p-6 space-y-4">
                {/* Dólar Oficial BCV */}
                <div className={cn(
                  "p-4 rounded-2xl border transition-all shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3",
                  isUsdActive 
                    ? "bg-primary/10 border-primary shadow-primary/10 ring-1 ring-primary/30" 
                    : "bg-background border-border hover:border-border/80"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2.5 rounded-xl shrink-0 transition-colors",
                      isUsdActive ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                    )}>
                      <DollarSign className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">Dólar Oficial (BCV)</span>
                        <Badge className={cn(
                          "text-[9px] font-bold",
                          isUsdActive ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary border-primary/30"
                        )}>
                          {isUsdActive ? 'ACTIVA EN EL SISTEMA' : 'OFICIAL'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {liveBcvUsd ? `Fecha: ${liveBcvUsd.fechaActualizacion?.slice(0, 10)}` : 'Consultando BCV...'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border">
                    <span className="text-xl sm:text-2xl font-headline font-bold text-foreground">
                      {liveBcvUsd ? `${liveBcvUsd.promedio.toFixed(2)} BS` : '---'}
                    </span>
                    <Button 
                      size="sm" 
                      disabled={!liveBcvUsd || isLoadingBcv}
                      onClick={() => liveBcvUsd && handleApplyBcvRate(liveBcvUsd.promedio, 'Dólar BCV', 'USD')}
                      className={cn(
                        "gap-1.5 h-9 text-xs font-bold transition-all min-w-[95px]",
                        isUsdActive 
                          ? "bg-primary text-primary-foreground shadow-md pointer-events-none" 
                          : "bg-muted/80 hover:bg-primary hover:text-primary-foreground text-foreground border border-border"
                      )}
                    >
                      <CheckCircle2 className={cn("h-3.5 w-3.5", isUsdActive ? "text-primary-foreground" : "text-muted-foreground")} />
                      {isUsdActive ? 'Activa' : 'Aplicar'}
                    </Button>
                  </div>
                </div>

                {/* Euro Oficial BCV */}
                <div className={cn(
                  "p-4 rounded-2xl border transition-all shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3",
                  isEurActive 
                    ? "bg-accent/10 border-accent shadow-accent/10 ring-1 ring-accent/30" 
                    : "bg-background border-border hover:border-border/80"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2.5 rounded-xl shrink-0 transition-colors",
                      isEurActive ? "bg-accent text-accent-foreground" : "bg-accent/10 text-accent"
                    )}>
                      <Coins className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">Euro Oficial (BCV)</span>
                        <Badge className={cn(
                          "text-[9px] font-bold",
                          isEurActive ? "bg-accent text-accent-foreground" : "bg-accent/20 text-accent border-accent/30"
                        )}>
                          {isEurActive ? 'ACTIVA EN EL SISTEMA' : 'OFICIAL'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {liveBcvEur ? `Fecha: ${liveBcvEur.fechaActualizacion?.slice(0, 10)}` : 'Consultando BCV...'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border">
                    <span className="text-xl sm:text-2xl font-headline font-bold text-foreground">
                      {liveBcvEur ? `${liveBcvEur.promedio.toFixed(2)} BS` : '---'}
                    </span>
                    <Button 
                      size="sm" 
                      disabled={!liveBcvEur || isLoadingBcv}
                      onClick={() => liveBcvEur && handleApplyBcvRate(liveBcvEur.promedio, 'Euro BCV', 'EUR')}
                      className={cn(
                        "gap-1.5 h-9 text-xs font-bold transition-all min-w-[95px]",
                        isEurActive 
                          ? "bg-accent text-accent-foreground shadow-md pointer-events-none" 
                          : "bg-muted/80 hover:bg-accent hover:text-accent-foreground text-foreground border border-border"
                      )}
                    >
                      <CheckCircle2 className={cn("h-3.5 w-3.5", isEurActive ? "text-accent-foreground" : "text-muted-foreground")} />
                      {isEurActive ? 'Activa' : 'Aplicar'}
                    </Button>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="bg-muted/10 border-t border-border p-4 text-[11px] text-muted-foreground flex items-center gap-2">
                <Landmark className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>Datos suministrados directamente por la API oficial del Banco Central de Venezuela.</span>
              </CardFooter>
            </Card>

          </div>

          {/* SECCION 2: CALENDARIO Y CONSULTA DE TASAS HISTÓRICAS */}
          <Card className="bg-card border-border shadow-xl overflow-hidden">
            <CardHeader className="bg-muted/20 border-b border-border p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    Calendario e Historial de Tasas Oficiales (BCV)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Consulta la cotización oficial exacta de cualquier día pasado para auditorías y cuadres históricos.
                  </CardDescription>
                </div>

                {/* Selector de Moneda */}
                <div className="flex bg-background rounded-xl p-1 border border-border shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setSelectedCurrency('USD')}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5",
                      selectedCurrency === 'USD' ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <DollarSign className="h-3.5 w-3.5" /> Dólar BCV
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCurrency('EUR')}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5",
                      selectedCurrency === 'EUR' ? "bg-accent text-accent-foreground shadow" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Coins className="h-3.5 w-3.5" /> Euro BCV
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-6 space-y-6">
              
              {/* Buscador de Fecha Específica */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-muted/10 p-4 rounded-2xl border border-border">
                <div className="md:col-span-5 space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-primary" /> Seleccionar Fecha Histórica:
                  </label>
                  <Input 
                    type="date"
                    value={selectedHistoryDate}
                    onChange={(e) => setSelectedHistoryDate(e.target.value)}
                    className="h-11 bg-background text-sm font-bold"
                  />
                </div>

                <div className="md:col-span-7 flex flex-col sm:flex-row items-center justify-between gap-3 bg-background p-3 rounded-xl border border-border">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">
                      Tasa Oficial del {selectedDateRate?.fecha || selectedHistoryDate}
                    </span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-2xl font-headline font-bold text-primary">
                        {selectedDateRate ? `${selectedDateRate.promedio.toFixed(2)} BS` : 'No registrada'}
                      </span>
                      {dailyVariation && (
                        <span className={cn(
                          "text-xs font-bold flex items-center gap-0.5",
                          dailyVariation.diff >= 0 ? "text-green-400" : "text-destructive"
                        )}>
                          {dailyVariation.diff >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                          {dailyVariation.pct > 0 ? `+${dailyVariation.pct.toFixed(2)}%` : `${dailyVariation.pct.toFixed(2)}%`}
                        </span>
                      )}
                    </div>
                  </div>

                  {selectedDateRate && (
                    <Button 
                      size="sm"
                      onClick={() => handleApplyBcvRate(selectedDateRate.promedio, `${selectedCurrency} del ${selectedDateRate.fecha}`, selectedCurrency)}
                      className="h-9 px-3 text-xs font-bold gap-1 w-full sm:w-auto"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aplicar a la Nube
                    </Button>
                  )}
                </div>
              </div>

              {/* Tabla de Histórico Reciente */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5 text-primary" /> Registros Históricos Recientes ({selectedCurrency})
                  </h4>
                  <div className="relative w-full sm:w-56">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input 
                      placeholder="Filtrar por fecha (YYYY-MM)..." 
                      className="h-8 pl-8 text-xs bg-background"
                      value={historySearchTerm}
                      onChange={(e) => setHistorySearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                <div className="border border-border rounded-xl overflow-hidden bg-background">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 border-b border-border text-muted-foreground font-bold uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-4 text-left">Fecha Oficial</th>
                          <th className="py-2.5 px-4 text-left">Moneda</th>
                          <th className="py-2.5 px-4 text-left">Fuente</th>
                          <th className="py-2.5 px-4 text-right">Cotización Oficial</th>
                          <th className="py-2.5 px-4 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {isLoadingHistory ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-muted-foreground">
                              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                              <span>Cargando historial del BCV...</span>
                            </td>
                          </tr>
                        ) : filteredHistoryList.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-muted-foreground">
                              No se encontraron registros para la búsqueda.
                            </td>
                          </tr>
                        ) : (
                          filteredHistoryList.map((item, idx) => {
                            const isThisItemActive = Math.abs(currentRateVal - item.promedio) < 0.01 && currentCurrency === selectedCurrency;
                            return (
                              <tr key={idx} className={cn("transition-colors", isThisItemActive ? "bg-primary/5 font-bold" : "hover:bg-muted/20")}>
                                <td className="py-2.5 px-4 font-bold">{item.fecha}</td>
                                <td className="py-2.5 px-4">
                                  <Badge variant="outline" className="text-[9px] font-bold">
                                    {selectedCurrency}
                                  </Badge>
                                </td>
                                <td className="py-2.5 px-4 text-muted-foreground uppercase text-[10px] font-bold">
                                  {item.fuente} (BCV)
                                </td>
                                <td className="py-2.5 px-4 text-right font-headline font-bold text-primary text-sm">
                                  {item.promedio.toFixed(2)} BS
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  {isThisItemActive ? (
                                    <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] font-bold">
                                      ✔ En Uso
                                    </Badge>
                                  ) : (
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      onClick={() => handleApplyBcvRate(item.promedio, `${selectedCurrency} (${item.fecha})`, selectedCurrency)}
                                      className="h-7 px-2 text-[10px] font-bold text-primary hover:bg-primary/10"
                                    >
                                      Usar esta tasa
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>

          {/* SECCION 3: HERRAMIENTAS DE MANTENIMIENTO */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-card border-accent/20 shadow-lg">
              <CardHeader className="bg-accent/5 p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-accent">
                  <Sparkles className="h-5 w-5" />
                  Poblar Base de Datos (Multi-Sede)
                </CardTitle>
                <CardDescription className="text-xs">Carga insumos, recetas de sub-insumos, productos, combos y stock inicial.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <Button 
                  variant="outline" 
                  className="w-full gap-2 h-11 border-accent text-accent hover:bg-accent/10 text-xs font-bold" 
                  onClick={handleSeedData}
                  disabled={isSeeding}
                >
                  <Database className="h-4 w-4" />
                  {isSeeding ? "Poblando base de datos..." : "Cargar Datos de Prueba"}
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card border-destructive/20 shadow-lg">
              <CardHeader className="bg-destructive/5 p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Zona de Peligro (Reset)
                </CardTitle>
                <CardDescription className="text-xs">Borrado completo de datos de prueba para iniciar en blanco.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <Button 
                  variant="destructive" 
                  className="w-full gap-2 h-11 text-xs font-bold shadow-lg" 
                  onClick={handleFactoryReset}
                  disabled={isResetting}
                >
                  <Trash2 className="h-4 w-4" />
                  {isResetting ? "Limpiando..." : "Factory Reset (Borrar Todo)"}
                </Button>
              </CardContent>
            </Card>
          </div>

        </div>
      </main>
    </div>
  );
}
