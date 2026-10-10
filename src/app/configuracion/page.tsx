
"use client";

import { useState, useEffect, useMemo } from 'react';
import { AppSidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MOCK_CONFIG, MOCK_INGREDIENTS, MOCK_PRODUCTS, MOCK_INVENTORY_SEED, MOCK_LOCATIONS } from '@/lib/mock-data';
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
  ArrowDownRight,
  Building2,
  Plus,
  Edit2,
  MapPin,
  Phone
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocations } from '@/hooks/use-locations';
import { Location, LocationType } from '@/lib/types';
import { useFirestore, setDocumentNonBlocking, deleteDocumentNonBlocking, useDoc, useMemoFirebase, useUser } from '@/firebase';
import { collection, getDocs, doc, serverTimestamp, writeBatch, setDoc, DocumentReference } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { fetchOfficialRates, fetchHistoricalRates, findRateByDate, OfficialRate, HistoricalRate } from '@/lib/dolar-api';
import { cn } from '@/lib/utils';

async function batchDeleteDocs(db: any, refs: DocumentReference[]) {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < refs.length; i += CHUNK_SIZE) {
    const chunk = refs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

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
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmCode, setResetConfirmCode] = useState('');
  const [resetStatusMessage, setResetStatusMessage] = useState('');
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

  // Sedes dinámicas
  const { locations, isUsingFallback } = useLocations();
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [locForm, setLocForm] = useState<{
    id: string;
    name: string;
    type: LocationType;
    address: string;
    phone: string;
  }>({
    id: '',
    name: '',
    type: 'BRANCH',
    address: '',
    phone: '',
  });
  const [isSavingLocation, setIsSavingLocation] = useState(false);

  const handleOpenNewLocation = () => {
    setEditingLocation(null);
    setLocForm({
      id: `br-${Date.now().toString(36)}`,
      name: '',
      type: 'BRANCH',
      address: '',
      phone: '',
    });
    setIsLocationModalOpen(true);
  };

  const handleOpenEditLocation = (loc: Location) => {
    setEditingLocation(loc);
    setLocForm({
      id: loc.id,
      name: loc.name,
      type: loc.type,
      address: loc.address || '',
      phone: loc.phone || '',
    });
    setIsLocationModalOpen(true);
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locForm.name.trim()) {
      toast({ variant: 'destructive', title: 'Nombre requerido', description: 'Ingresa el nombre de la sede.' });
      return;
    }
    const locId = editingLocation ? editingLocation.id : (locForm.id.trim() || `loc-${Date.now().toString(36)}`);
    setIsSavingLocation(true);
    try {
      const locRef = doc(firestore, 'locations', locId);
      await setDoc(locRef, {
        id: locId,
        name: locForm.name.trim(),
        type: locForm.type,
        address: locForm.address.trim(),
        phone: locForm.phone.trim(),
        active: true,
        lastUpdated: serverTimestamp(),
      }, { merge: true });

      toast({
        title: editingLocation ? "Sede Actualizada" : "Sede Creada",
        description: `La sede "${locForm.name.trim()}" quedó registrada exitosamente en Firestore.`,
      });
      setIsLocationModalOpen(false);
      setEditingLocation(null);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error al guardar sede",
        description: err.message || "No se pudo guardar la sede en Firestore.",
      });
    } finally {
      setIsSavingLocation(false);
    }
  };

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
    if (exchangeData?.exchangeRate !== undefined) {
      setRate(exchangeData.exchangeRate.toString());
    }
  }, [exchangeData?.exchangeRate]);

  // Aplicar tasa oficial BCV directamente y activar sincronización automática diaria
  const handleApplyBcvRate = (val: number, label: string, currency: 'USD' | 'EUR' = 'USD') => {
    setRate(val.toFixed(2));
    setDocumentNonBlocking(configRef, {
      exchangeRate: val,
      currencySymbol: currency,
      currencyName: label,
      rateSource: currency === 'EUR' ? 'BCV_EUR' : 'BCV_USD',
      autoSync: true,
      lastBcvDate: new Date().toISOString().slice(0, 10),
      lastUpdated: serverTimestamp()
    }, { merge: true });

    toast({
      title: `⚡ Tasa ${label} aplicada`,
      description: `Se actualizó el factor cambiario a ${val.toFixed(2)} BS y la sincronización automática diaria quedó activada.`
    });
  };

  const handleEnableAutoSync = async () => {
    setIsLoadingBcv(true);
    try {
      const { usd } = await fetchOfficialRates();
      const val = usd?.promedio || parseFloat(rate) || 813.74;
      setRate(val.toFixed(2));
      setDocumentNonBlocking(configRef, {
        exchangeRate: val,
        currencySymbol: 'USD',
        currencyName: 'Dólar Oficial BCV',
        rateSource: 'BCV_USD',
        autoSync: true,
        lastBcvDate: usd?.fechaActualizacion || new Date().toISOString().slice(0, 10),
        lastUpdated: serverTimestamp()
      }, { merge: true });

      toast({
        title: "⚡ Sincronización Automática Activada",
        description: `El sistema mantendrá la tasa oficial del BCV (${val.toFixed(2)} BS/$) actualizada automáticamente todos los días.`
      });
    } catch (err) {
      toast({ variant: "destructive", title: "Error al conectar con BCV" });
    } finally {
      setIsLoadingBcv(false);
    }
  };

  const handleSave = () => {
    const rateNum = parseFloat(rate);
    if (isNaN(rateNum) || rateNum <= 0) {
      toast({ variant: "destructive", title: "Tasa inválida", description: "Ingresa un número mayor a cero." });
      return;
    }

    setIsSaving(true);
    setDocumentNonBlocking(configRef, {
      exchangeRate: rateNum,
      currencySymbol: currentCurrency,
      currencyName: 'Ajuste Manual',
      rateSource: 'MANUAL',
      autoSync: false,
      lastUpdated: serverTimestamp()
    }, { merge: true });

    setTimeout(() => {
      setIsSaving(false);
      toast({
        title: "Tasa Manual Fija Guardada",
        description: `Se fijó la tasa en ${rateNum.toFixed(2)} BS (Modo Manual).`,
      });
    }, 400);
  };

  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      const batch = writeBatch(firestore);

      // 0. Cargar Sedes Maestras (/locations)
      MOCK_LOCATIONS.forEach((loc) => {
        const ref = doc(firestore, 'locations', loc.id);
        batch.set(ref, {
          id: loc.id,
          name: loc.name,
          type: loc.type,
          address: loc.address || (loc.type === 'WAREHOUSE' ? 'Zona Industrial Los Galpones' : 'Centro Comercial Principal'),
          phone: loc.phone || '+58 412 0000000',
          active: true,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp()
        }, { merge: true });
      });

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
      const todayDemoStr = new Date().toISOString().slice(0, 10);
      const order1Ref = doc(firestore, 'locations', 'br-1', 'orders', 'demo-ord-1');
      batch.set(order1Ref, {
        id: 'demo-ord-1',
        orderNumber: '#001',
        locationId: 'br-1',
        orderDate: serverTimestamp(),
        dateStr: todayDemoStr,
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
        orderNumber: '#002',
        locationId: 'br-1',
        orderDate: serverTimestamp(),
        dateStr: todayDemoStr,
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

  const executeFactoryReset = async () => {
    if (resetConfirmCode !== "LIMPIAR") {
      toast({ 
        variant: "destructive", 
        title: "Código incorrecto", 
        description: "Debes escribir exactamente la palabra LIMPIAR para confirmar el borrado total." 
      });
      return;
    }

    setIsResetting(true);
    setResetStatusMessage("Identificando sedes y estructuras en Firestore...");

    try {
      const allRefsToDelete: DocumentReference[] = [];

      // 1. Obtener todas las sedes dinámicas registradas + sedes base
      const locSnap = await getDocs(collection(firestore, 'locations'));
      const foundLocationIds = new Set<string>(['br-1', 'br-2', 'wh-1']);
      locSnap.forEach(d => foundLocationIds.add(d.id));
      locations.forEach(l => foundLocationIds.add(l.id));

      const locationIds = Array.from(foundLocationIds);

      // 2. Para cada sede, recolectar órdenes, subcolecciones (/items, /payments), inventario y ledger
      for (const locId of locationIds) {
        setResetStatusMessage(`Escaneando órdenes e inventario de sede [${locId}]...`);

        // A. Órdenes y sus subcolecciones
        const ordersSnap = await getDocs(collection(firestore, 'locations', locId, 'orders'));
        for (const orderDoc of ordersSnap.docs) {
          // Subcolección items
          const itemsSnap = await getDocs(collection(firestore, 'locations', locId, 'orders', orderDoc.id, 'items'));
          itemsSnap.forEach(itemDoc => allRefsToDelete.push(itemDoc.ref));

          // Subcolección payments
          const orderPaymentsSnap = await getDocs(collection(firestore, 'locations', locId, 'orders', orderDoc.id, 'payments'));
          orderPaymentsSnap.forEach(payDoc => allRefsToDelete.push(payDoc.ref));

          // Documento de la orden
          allRefsToDelete.push(orderDoc.ref);
        }

        // B. Inventario de materias primas
        const invSnap = await getDocs(collection(firestore, 'locations', locId, 'inventory'));
        invSnap.forEach(invDoc => allRefsToDelete.push(invDoc.ref));

        // C. Inventario de preparados
        const prepInvSnap = await getDocs(collection(firestore, 'locations', locId, 'preparados_inventory'));
        prepInvSnap.forEach(prepDoc => allRefsToDelete.push(prepDoc.ref));

        // D. Ledger centralizado de cobros por sede
        const locPaymentsSnap = await getDocs(collection(firestore, 'locations', locId, 'payments'));
        locPaymentsSnap.forEach(pDoc => allRefsToDelete.push(pDoc.ref));

        // E. Contadores correlativos diarios (#001, #002...)
        const countersSnap = await getDocs(collection(firestore, 'locations', locId, 'daily_counters'));
        countersSnap.forEach(cDoc => allRefsToDelete.push(cDoc.ref));
      }

      // 3. Colecciones operativas y catálogos globales
      setResetStatusMessage("Escaneando catálogos maestros y logs de producción...");

      const globalCollections = [
        'transfers',
        'production_logs',
        'waste_logs',
        'ingredients',
        'products',
        'preparados'
      ];

      for (const colName of globalCollections) {
        const snap = await getDocs(collection(firestore, colName));
        snap.forEach(d => allRefsToDelete.push(d.ref));
      }

      // 4. Ejecutar borrado en lotes atómicos (chunks de 400 docs)
      setResetStatusMessage(`Purgando ${allRefsToDelete.length} documentos de forma atómica...`);
      await batchDeleteDocs(firestore, allRefsToDelete);

      toast({
        title: "¡Sistema como nuevo!",
        description: `Se purgaron exitosamente ${allRefsToDelete.length} documentos operativos y de prueba. Los usuarios y accesos permanecen activos.`,
      });

      setIsResetModalOpen(false);
      setResetConfirmCode('');
    } catch (error: any) {
      console.error("Error en Factory Reset:", error);
      toast({
        variant: "destructive",
        title: "Error al limpiar la base de datos",
        description: error.message || "Ocurrió un fallo durante el borrado de documentos.",
      });
    } finally {
      setIsResetting(false);
      setResetStatusMessage('');
    }
  };

  const currentRateVal = exchangeData?.exchangeRate !== undefined ? exchangeData.exchangeRate : (parseFloat(rate) || 0);
  const currentCurrency = (exchangeData as any)?.currencySymbol || 'USD';
  const currentSource = (exchangeData as any)?.rateSource || 'MANUAL';
  const isAutoSync = (exchangeData as any)?.autoSync !== false && currentSource !== 'MANUAL';

  // Una cotización en vivo se considera ACTIVA únicamente si el valor numérico en la base de datos
  // coincide exactamente con la tasa del BCV y la moneda coincide.
  const isUsdActive = Boolean(
    liveBcvUsd && 
    Math.abs(currentRateVal - liveBcvUsd.promedio) < 0.01 && 
    currentCurrency === 'USD'
  );
  
  const isEurActive = Boolean(
    liveBcvEur && 
    Math.abs(currentRateVal - liveBcvEur.promedio) < 0.01 && 
    currentCurrency === 'EUR'
  );

  const hasNewBcvUsdRate = Boolean(
    liveBcvUsd && 
    !isUsdActive && 
    currentCurrency === 'USD'
  );

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

          {/* BANNER DE ALERTA: NUEVA TASA BCV DETECTADA */}
          {hasNewBcvUsdRate && liveBcvUsd && (
            <div className="bg-gradient-to-r from-amber-500/15 via-primary/10 to-transparent border border-amber-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                  <Sparkles className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    Nueva Cotización Oficial del BCV Detectada: <span className="text-primary font-headline text-base">{liveBcvUsd.promedio.toFixed(2)} BS/$</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tu tasa activa en la nube es <span className="font-semibold text-foreground">{currentRateVal.toFixed(2)} BS/$</span>. Haz clic para sincronizar todo el sistema de inmediato.
                  </p>
                </div>
              </div>
              <Button 
                onClick={() => handleApplyBcvRate(liveBcvUsd.promedio, 'Dólar Oficial BCV', 'USD')}
                className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md gap-1.5 h-9 text-xs w-full sm:w-auto"
              >
                <CheckCircle2 className="h-4 w-4" />
                Actualizar Sistema a {liveBcvUsd.promedio.toFixed(2)} BS
              </Button>
            </div>
          )}

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
                    isAutoSync
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" 
                      : isEurActive 
                      ? "bg-accent/15 text-accent border-accent/30" 
                      : isUsdActive 
                      ? "bg-primary/15 text-primary border-primary/30" 
                      : "bg-muted text-muted-foreground border-border"
                  )}>
                    {isAutoSync ? '⚡ Auto-BCV Activo' : isEurActive ? '💶 Euro Oficial BCV' : isUsdActive ? '💵 Dólar Oficial BCV' : '✏️ Tasa Manual Fija'}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  {isAutoSync 
                    ? "Sincronización 100% automática diaria con la API oficial del BCV." 
                    : "Factor de conversión fijado manualmente en la nube."}
                </CardDescription>
              </CardHeader>

              <CardContent className="p-4 sm:p-6 space-y-5">
                <div className="flex flex-col items-center justify-center p-5 sm:p-6 bg-muted/30 rounded-2xl border border-dashed border-border text-center">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase mb-1">
                    {isAutoSync ? 'TASA OFICIAL BCV DEL DÍA (AUTO)' : (isEurActive ? 'TASA OFICIAL EURO BCV' : isUsdActive ? 'TASA OFICIAL DÓLAR BCV' : 'TASA MANUAL EN EL SISTEMA')}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl md:text-5xl font-headline font-bold text-primary">
                      {exchangeData?.exchangeRate !== undefined ? exchangeData.exchangeRate.toFixed(2) : (parseFloat(rate) ? parseFloat(rate).toFixed(2) : '0.00')}
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
                      step="0.01"
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

              <CardFooter className="bg-muted/10 border-t border-border p-4 sm:p-6 flex flex-col sm:flex-row gap-2">
                <Button className="w-full sm:flex-1 gap-2 h-11 text-xs sm:text-sm font-bold" onClick={handleSave} disabled={isSaving}>
                  <Save className="h-4 w-4" />
                  {isSaving ? "Guardando..." : "Fijar Manual"}
                </Button>
                {(!isAutoSync || currentSource === 'MANUAL') && (
                  <Button 
                    variant="outline" 
                    className="w-full sm:w-auto gap-2 h-11 text-xs sm:text-sm font-bold border-primary/40 text-primary hover:bg-primary/10" 
                    onClick={handleEnableAutoSync} 
                    disabled={isLoadingBcv}
                  >
                    <Sparkles className="h-4 w-4 text-primary" />
                    Activar Auto-BCV
                  </Button>
                )}
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
                    : hasNewBcvUsdRate
                    ? "bg-amber-500/5 border-amber-500/40 hover:border-amber-500/60"
                    : "bg-background border-border hover:border-border/80"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2.5 rounded-xl shrink-0 transition-colors",
                      isUsdActive 
                        ? "bg-primary text-primary-foreground" 
                        : hasNewBcvUsdRate 
                        ? "bg-amber-500/15 text-amber-400" 
                        : "bg-primary/10 text-primary"
                    )}>
                      <DollarSign className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">Dólar Oficial (BCV)</span>
                        <Badge className={cn(
                          "text-[9px] font-bold",
                          isUsdActive 
                            ? "bg-primary text-primary-foreground" 
                            : hasNewBcvUsdRate 
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/30" 
                            : "bg-primary/20 text-primary border-primary/30"
                        )}>
                          {isUsdActive ? 'ACTIVA EN EL SISTEMA' : hasNewBcvUsdRate ? 'NUEVA TASA DISPONIBLE' : 'OFICIAL'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {liveBcvUsd ? `Fecha: ${liveBcvUsd.fechaActualizacion?.slice(0, 10)}` : 'Consultando BCV...'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border">
                    <span className={cn(
                      "text-xl sm:text-2xl font-headline font-bold",
                      hasNewBcvUsdRate ? "text-amber-400" : "text-foreground"
                    )}>
                      {liveBcvUsd ? `${liveBcvUsd.promedio.toFixed(2)} BS` : '---'}
                    </span>
                    <Button 
                      size="sm" 
                      disabled={!liveBcvUsd || isLoadingBcv}
                      onClick={() => liveBcvUsd && handleApplyBcvRate(liveBcvUsd.promedio, 'Dólar Oficial BCV', 'USD')}
                      className={cn(
                        "gap-1.5 h-9 text-xs font-bold transition-all min-w-[95px]",
                        isUsdActive 
                          ? "bg-primary text-primary-foreground shadow-md pointer-events-none" 
                          : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
                      )}
                    >
                      <CheckCircle2 className={cn("h-3.5 w-3.5", isUsdActive ? "text-primary-foreground" : "")} />
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
                      onClick={() => liveBcvEur && handleApplyBcvRate(liveBcvEur.promedio, 'Euro Oficial BCV', 'EUR')}
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

          {/* SECCION: GESTIÓN DE SEDES Y SUCURSALES (MULTI-SEDE) */}
          <Card className="bg-card border-border shadow-xl overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base sm:text-lg">Gestión de Sedes y Sucursales</CardTitle>
                  {isUsingFallback && (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30">
                      Modo Inicial (Memoria)
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs mt-1">
                  Administra las ubicaciones del sistema registradas en Firestore (sucursales de atención y depósitos centrales).
                </CardDescription>
              </div>
              <Button 
                onClick={handleOpenNewLocation}
                className="gap-2 h-10 text-xs font-bold shrink-0 shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Nueva Sede
              </Button>
            </CardHeader>

            <CardContent className="p-4 sm:p-6">
              <div className="border border-border rounded-xl overflow-hidden bg-background">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 border-b border-border text-muted-foreground font-bold uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-4 text-left">Sede / Sucursal</th>
                        <th className="py-2.5 px-4 text-left">Tipo</th>
                        <th className="py-2.5 px-4 text-left">Código (ID)</th>
                        <th className="py-2.5 px-4 text-left">Dirección</th>
                        <th className="py-2.5 px-4 text-left">Teléfono</th>
                        <th className="py-2.5 px-4 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {locations.map((loc: Location) => (
                        <tr key={loc.id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4 font-bold flex items-center gap-2">
                            {loc.type === 'WAREHOUSE' ? (
                              <Warehouse className="h-4 w-4 text-accent shrink-0" />
                            ) : (
                              <Store className="h-4 w-4 text-primary shrink-0" />
                            )}
                            <span className="text-foreground">{loc.name}</span>
                          </td>
                          <td className="py-3 px-4">
                            <Badge 
                              variant="outline" 
                              className={cn(
                                "text-[10px] font-bold uppercase",
                                loc.type === 'WAREHOUSE' 
                                  ? "bg-accent/15 text-accent border-accent/30" 
                                  : "bg-primary/15 text-primary border-primary/30"
                              )}
                            >
                              {loc.type === 'WAREHOUSE' ? 'Depósito Central' : 'Sucursal POS'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">
                            {loc.id}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {loc.address || '—'}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {loc.phone || '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleOpenEditLocation(loc)}
                              className="h-8 px-2.5 gap-1.5 text-xs text-primary hover:bg-primary/10 font-bold"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              Editar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                  onClick={() => {
                    setResetConfirmCode('');
                    setIsResetModalOpen(true);
                  }}
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

      {/* DIÁLOGO CREAR / EDITAR SEDE */}
      <Dialog open={isLocationModalOpen} onOpenChange={setIsLocationModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Building2 className="h-5 w-5 text-primary" />
              {editingLocation ? 'Editar Sede o Sucursal' : 'Crear Nueva Sede'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configura los datos maestros de la ubicación en Firestore.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveLocation} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Nombre de la Sede</Label>
              <Input
                placeholder="Ej. Sucursal La Castellana"
                value={locForm.name}
                onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
                className="h-10 text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Tipo de Ubicación</Label>
              <Select 
                value={locForm.type} 
                onValueChange={(val: LocationType) => setLocForm({ ...locForm, type: val })}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRANCH">📍 Sucursal de Ventas (Punto POS)</SelectItem>
                  <SelectItem value="WAREHOUSE">🏢 Depósito Central (Almacén General)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Código Identificador (ID)</Label>
              <Input
                placeholder="Ej. br-3 o wh-2"
                value={locForm.id}
                onChange={(e) => setLocForm({ ...locForm, id: e.target.value })}
                className="h-10 text-xs font-mono"
                disabled={!!editingLocation}
              />
              <p className="text-[10px] text-muted-foreground">
                {editingLocation ? "El identificador no se puede modificar una vez creado." : "Identificador único en Firestore (ej. br-3)."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Dirección Física</Label>
              <Input
                placeholder="Ej. Av. Principal, C.C. San Ignacio, Nivel Jardín"
                value={locForm.address}
                onChange={(e) => setLocForm({ ...locForm, address: e.target.value })}
                className="h-10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Teléfono de Contacto</Label>
              <Input
                placeholder="Ej. +58 412 1234567"
                value={locForm.phone}
                onChange={(e) => setLocForm({ ...locForm, phone: e.target.value })}
                className="h-10 text-xs"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setIsLocationModalOpen(false)}
                disabled={isSavingLocation}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isSavingLocation}
                className="text-xs font-bold"
              >
                {isSavingLocation ? "Guardando..." : (editingLocation ? "Guardar Cambios" : "Crear Sede")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO CONFIRMACIÓN FACTORY RESET */}
      <Dialog open={isResetModalOpen} onOpenChange={(open) => { if (!isResetting) setIsResetModalOpen(open); }}>
        <DialogContent className="max-w-md bg-card border-destructive/40 shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive mb-1">
              <div className="p-2 rounded-xl bg-destructive/10">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <DialogTitle className="text-lg font-headline font-bold">
                Restablecimiento Total de Fábrica
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Esta operación purga permanentemente todos los datos operativos y de prueba acumulados en la base de datos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl space-y-2 text-destructive-foreground">
              <p className="font-bold text-destructive flex items-center gap-1.5 text-xs">
                <Trash2 className="h-4 w-4" /> Elementos que serán eliminados:
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-muted-foreground pl-1">
                <li>Todas las comandas, items vendidos y abonos de clientes.</li>
                <li>Inventario de materias primas y preparados en todas las sedes.</li>
                <li>Historial de cobros (Ledger) y contadores correlativos de tickets.</li>
                <li>Registros de traslados, producción de cocina y mermas.</li>
                <li>Catálogo maestro de insumos, recetas y productos.</li>
              </ul>
            </div>

            <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl space-y-1">
              <p className="font-bold text-primary flex items-center gap-1.5 text-xs">
                <CheckCircle2 className="h-4 w-4" /> Datos preservados de forma segura:
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Tus usuarios, contraseñas, roles asignados y la tasa cambiaria configurada no se verán afectados.
              </p>
            </div>

            {isResetting ? (
              <div className="p-4 bg-muted/40 rounded-xl border border-border flex flex-col items-center justify-center gap-2 text-center py-6">
                <RefreshCw className="h-7 w-7 text-destructive animate-spin" />
                <p className="text-xs font-bold text-foreground">{resetStatusMessage || "Limpiando base de datos..."}</p>
                <p className="text-[10px] text-muted-foreground">Por favor no cierres ni recargues esta ventana.</p>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <Label className="text-xs font-bold">
                  Para confirmar, escribe exactamente <span className="text-destructive font-mono uppercase font-black">LIMPIAR</span>:
                </Label>
                <Input
                  placeholder="Escribe LIMPIAR..."
                  value={resetConfirmCode}
                  onChange={(e) => setResetConfirmCode(e.target.value)}
                  className="h-10 text-xs font-mono font-bold uppercase tracking-wider"
                  autoFocus
                />
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsResetModalOpen(false)}
              disabled={isResetting}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={executeFactoryReset}
              disabled={isResetting || resetConfirmCode.trim() !== "LIMPIAR"}
              className="text-xs font-bold gap-2 shadow-lg"
            >
              {isResetting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Purgando Base de Datos...
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  Purgar Todo Definitivamente
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
