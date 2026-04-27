
"use client";

import { useState, useEffect } from 'react';
import { AppSidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MOCK_CONFIG, MOCK_INGREDIENTS, MOCK_PRODUCTS, MOCK_INVENTORY_SEED } from '@/lib/mock-data';
import { RefreshCw, Save, DollarSign, Trash2, AlertTriangle, Sparkles, Database, Warehouse, Store, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useFirestore, setDocumentNonBlocking, deleteDocumentNonBlocking, useDoc, useMemoFirebase } from '@/firebase';
import { collection, getDocs, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export default function ConfiguracionPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  
  // Tasa cambiaria en tiempo real de Firestore
  const configRef = useMemoFirebase(() => doc(firestore, 'config', 'exchangeRate'), [firestore]);
  const { data: exchangeData } = useDoc(configRef);
  
  const [rate, setRate] = useState(exchangeData?.exchangeRate?.toString() || MOCK_CONFIG.exchangeRate.toString());
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  
  const branchId = "br-1";
  const warehouseId = "wh-1";

  useEffect(() => {
    if (exchangeData?.exchangeRate) {
      setRate(exchangeData.exchangeRate.toString());
    }
  }, [exchangeData]);

  const handleSave = () => {
    const rateNum = parseFloat(rate);
    if (isNaN(rateNum) || rateNum <= 0) {
      toast({ variant: "destructive", title: "Tasa inválida" });
      return;
    }

    setIsSaving(true);
    setDocumentNonBlocking(configRef, {
      exchangeRate: rateNum,
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

      // 1. Cargar Ingredientes (Maestro)
      MOCK_INGREDIENTS.forEach((ing) => {
        const ref = doc(firestore, 'ingredients', ing.id);
        batch.set(ref, ing);
      });

      // 2. Cargar Productos con Recetas
      MOCK_PRODUCTS.forEach((prod) => {
        const ref = doc(firestore, 'products', prod.id);
        batch.set(ref, prod);
      });

      // 3. Cargar Inventario Inicial en Sucursal CIMA (br-1)
      MOCK_INVENTORY_SEED.forEach((inv) => {
        const ref = doc(firestore, 'locations', branchId, 'inventory', inv.ingredientId!);
        batch.set(ref, {
          ...inv,
          id: inv.ingredientId,
          locationId: branchId,
          lastUpdatedAt: serverTimestamp()
        });
      });

      // 4. Cargar Inventario Masivo en Depósito Central (wh-1)
      MOCK_INGREDIENTS.forEach((ing) => {
        const ref = doc(firestore, 'locations', warehouseId, 'inventory', ing.id);
        batch.set(ref, {
          id: ing.id,
          ingredientId: ing.id,
          locationId: warehouseId,
          quantity: 1000, 
          lastUpdatedAt: serverTimestamp()
        });
      });

      // 5. Cargar Tasa Inicial
      batch.set(configRef, {
        exchangeRate: MOCK_CONFIG.exchangeRate,
        lastUpdated: serverTimestamp()
      }, { merge: true });

      await batch.commit();
      toast({
        title: "Base de Datos Poblada",
        description: "Se han cargado ingredientes, productos, inventario y tasa inicial.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error al sembrar",
        description: "No se pudieron cargar los datos de prueba.",
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleResetDatabase = async () => {
    if (!confirm("¿ESTÁS TOTALMENTE SEGURO? Esta acción borrará todas las comandas de esta sede.")) {
      return;
    }

    setIsResetting(true);
    try {
      const ordersRef = collection(firestore, 'locations', branchId, 'orders');
      const snapshot = await getDocs(ordersRef);
      
      snapshot.forEach((orderDoc) => {
        const docRef = doc(firestore, 'locations', branchId, 'orders', orderDoc.id);
        deleteDocumentNonBlocking(docRef);
      });

      toast({
        title: "Limpieza iniciada",
        description: "Se están eliminando los registros de comandas de la sucursal actual.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error de permisos",
        description: "No se pudieron borrar las órdenes.",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar role="ADMIN" />
      
      <main className="flex-1 overflow-y-auto bg-background p-4 md:p-8 pt-16 lg:pt-8">
        <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
          <header>
            <h1 className="text-3xl md:text-4xl font-headline font-bold text-foreground">Configuración Central</h1>
            <p className="text-muted-foreground">Ajustes globales y mantenimiento del sistema Hablame Perrito Plus.</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <Card className="bg-card border-primary/20 shadow-xl overflow-hidden">
              <CardHeader className="bg-primary/5 border-b border-primary/10">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Factor Cambiario (USD/BS)
                </CardTitle>
                <CardDescription>Conversión para pagos multimoneda.</CardDescription>
              </CardHeader>
              <CardContent className="pt-8 space-y-6">
                <div className="flex flex-col items-center justify-center p-6 md:p-8 bg-muted/30 rounded-2xl border border-dashed border-border text-center">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Tasa en la Nube</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl md:text-5xl font-headline font-bold text-primary">
                      {exchangeData?.exchangeRate?.toFixed(2) || rate}
                    </span>
                    <span className="text-lg md:text-xl text-muted-foreground">BS</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Nueva Tasa</label>
                    <div className="relative">
                      <Input 
                        type="number" 
                        value={rate} 
                        onChange={(e) => setRate(e.target.value)}
                        className="h-12 pl-12 text-lg font-headline"
                      />
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-muted/20 border-t border-border p-6">
                <Button className="w-full gap-2 h-12" onClick={handleSave} disabled={isSaving}>
                  <Save className="h-4 w-4" />
                  {isSaving ? "Guardando..." : "Actualizar Tasa"}
                </Button>
              </CardFooter>
            </Card>

            <div className="space-y-6">
              <Card className="bg-card border-accent/20 shadow-lg">
                <CardHeader className="bg-accent/5">
                  <CardTitle className="text-lg flex items-center gap-2 text-accent">
                    <Sparkles className="h-5 w-5" />
                    Poblar Multi-Sede
                  </CardTitle>
                  <CardDescription>Carga datos iniciales en todas las ubicaciones.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-4 mb-6">
                    <div className="flex items-start gap-3 text-xs text-muted-foreground">
                      <Warehouse className="h-4 w-4 text-primary shrink-0" />
                      <span>Se cargará stock masivo (1000 unidades/kg) en el **Depósito Central**.</span>
                    </div>
                    <div className="flex items-start gap-3 text-xs text-muted-foreground">
                      <Store className="h-4 w-4 text-accent shrink-0" />
                      <span>Se cargará stock operativo y recetas en la **Sucursal CIMA**.</span>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full gap-2 h-12 border-accent text-accent hover:bg-accent/10" 
                    onClick={handleSeedData}
                    disabled={isSeeding}
                  >
                    <Database className="h-5 w-5" />
                    {isSeeding ? "Poblando..." : "Cargar Datos de Prueba"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-card border-destructive/20 shadow-lg">
                <CardHeader className="bg-destructive/5">
                  <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    Zona de Peligro
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <Button 
                    variant="destructive" 
                    className="w-full gap-2 h-12" 
                    onClick={handleResetDatabase}
                    disabled={isResetting}
                  >
                    <Trash2 className="h-5 w-5" />
                    {isResetting ? "Limpiando..." : "Borrar Comandas (Sede Actual)"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
