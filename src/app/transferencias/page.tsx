
"use client";

import { useState } from 'react';
import { AppSidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  ArrowRightLeft, 
  ArrowRight, 
  Boxes, 
  History, 
  AlertCircle,
  CheckCircle2,
  Warehouse,
  Store
} from 'lucide-react';
import { 
  useCollection, 
  useFirestore, 
  useMemoFirebase, 
  useUser,
  setDocumentNonBlocking,
  addDocumentNonBlocking
} from '@/firebase';
import { collection, doc, serverTimestamp, getDoc, query, orderBy, limit } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { MOCK_LOCATIONS } from '@/lib/mock-data';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function TransferenciasPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  // --- QUERIES ---
  const ingredientsQuery = useMemoFirebase(() => collection(firestore, 'ingredients'), [firestore]);
  const { data: ingredients } = useCollection(ingredientsQuery);

  const transfersQuery = useMemoFirebase(() => 
    query(collection(firestore, 'transfers'), orderBy('createdAt', 'desc'), limit(10)), 
  [firestore]);
  const { data: recentTransfers } = useCollection(transfersQuery);

  // --- STATE ---
  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // --- ACTIONS ---
  const handleTransfer = async () => {
    if (!user || !sourceId || !destId || !ingredientId || !quantity) {
      toast({ variant: "destructive", title: "Faltan datos", description: "Completa todos los campos para transferir." });
      return;
    }

    if (sourceId === destId) {
      toast({ variant: "destructive", title: "Error", description: "La sede de origen y destino no pueden ser la misma." });
      return;
    }

    const qtyNum = parseFloat(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      toast({ variant: "destructive", title: "Cantidad inválida" });
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Verificar stock en origen
      const sourceInvRef = doc(firestore, 'locations', sourceId, 'inventory', ingredientId);
      const sourceSnap = await getDoc(sourceInvRef);
      
      const sourceQty = sourceSnap.exists() ? sourceSnap.data().quantity : 0;
      
      if (sourceQty < qtyNum) {
        toast({ 
          variant: "destructive", 
          title: "Stock insuficiente", 
          description: `La sede de origen solo tiene ${sourceQty} unidades.` 
        });
        setIsProcessing(false);
        return;
      }

      // 2. Descontar de origen
      setDocumentNonBlocking(sourceInvRef, {
        quantity: sourceQty - qtyNum,
        lastUpdatedAt: serverTimestamp()
      }, { merge: true });

      // 3. Sumar a destino
      const destInvRef = doc(firestore, 'locations', destId, 'inventory', ingredientId);
      const destSnap = await getDoc(destInvRef);
      const destQty = destSnap.exists() ? destSnap.data().quantity : 0;

      setDocumentNonBlocking(destInvRef, {
        id: ingredientId,
        ingredientId,
        locationId: destId,
        quantity: destQty + qtyNum,
        lastUpdatedAt: serverTimestamp()
      }, { merge: true });

      // 4. Registrar log de transferencia
      const ingName = ingredients?.find(i => i.id === ingredientId)?.name || "Insumo";
      const sourceName = MOCK_LOCATIONS.find(l => l.id === sourceId)?.name || "Origen";
      const destName = MOCK_LOCATIONS.find(l => l.id === destId)?.name || "Destino";

      addDocumentNonBlocking(collection(firestore, 'transfers'), {
        ingredientId,
        ingredientName: ingName,
        sourceId,
        sourceName,
        destId,
        destName,
        quantity: qtyNum,
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });

      toast({ 
        title: "Transferencia Exitosa", 
        description: `Se movieron ${qtyNum} de ${ingName} a ${destName}.` 
      });

      // Reset
      setQuantity("");
      setIngredientId("");
    } catch (error) {
      toast({ variant: "destructive", title: "Error crítico", description: "No se pudo procesar el traslado." });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar role="ADMIN" />
      
      <main className="flex-1 overflow-y-auto bg-background p-8">
        <div className="max-w-5xl mx-auto space-y-8">
          <header>
            <h1 className="text-4xl font-headline font-bold text-foreground">Transferencias de Insumos</h1>
            <p className="text-muted-foreground">Mueve materia prima entre depósitos y sucursales.</p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-2 bg-card border-border shadow-xl">
              <CardHeader className="bg-primary/5 border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-primary" />
                  Nuevo Traslado
                </CardTitle>
                <CardDescription>Selecciona las sedes y el insumo para procesar el movimiento.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-primary">
                      <Warehouse className="h-4 w-4" />
                      <Label className="font-bold uppercase text-[10px] tracking-widest">Sede de Origen</Label>
                    </div>
                    <Select value={sourceId} onValueChange={setSourceId}>
                      <SelectTrigger className="h-12"><SelectValue placeholder="Desde..." /></SelectTrigger>
                      <SelectContent>
                        {MOCK_LOCATIONS.map(loc => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-background p-2 rounded-full border border-border shadow-md">
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-accent">
                      <Store className="h-4 w-4" />
                      <Label className="font-bold uppercase text-[10px] tracking-widest">Sede de Destino</Label>
                    </div>
                    <Select value={destId} onValueChange={setDestId}>
                      <SelectTrigger className="h-12"><SelectValue placeholder="Hacia..." /></SelectTrigger>
                      <SelectContent>
                        {MOCK_LOCATIONS.map(loc => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-muted/20 rounded-2xl border border-dashed border-border">
                  <div className="space-y-2">
                    <Label>Insumo a Trasladar</Label>
                    <Select value={ingredientId} onValueChange={setIngredientId}>
                      <SelectTrigger><SelectValue placeholder="Selecciona insumo..." /></SelectTrigger>
                      <SelectContent>
                        {ingredients?.map(ing => (
                          <SelectItem key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Cantidad</Label>
                    <Input 
                      type="number" 
                      placeholder="Ej: 50" 
                      value={quantity} 
                      onChange={(e) => setQuantity(e.target.value)}
                      className="text-lg font-bold h-10"
                    />
                  </div>
                </div>

                <Button 
                  className="w-full h-14 gap-2 text-lg font-headline shadow-lg" 
                  onClick={handleTransfer}
                  disabled={isProcessing || !sourceId || !destId || !ingredientId || !quantity}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  {isProcessing ? "Procesando..." : "Confirmar Traslado de Mercancía"}
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="bg-card border-border shadow-lg">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    Traslados Recientes
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <div className="divide-y divide-border">
                      {recentTransfers?.map(t => (
                        <div key={t.id} className="p-4 space-y-2 hover:bg-muted/10 transition-colors">
                          <div className="flex justify-between items-start">
                            <Badge variant="outline" className="text-[9px] uppercase border-primary/30 text-primary">
                              {t.ingredientName}
                            </Badge>
                            <span className="text-[9px] text-muted-foreground">
                              {t.createdAt?.seconds ? new Date(t.createdAt.seconds * 1000).toLocaleTimeString() : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs font-bold">
                            <span className="truncate max-w-[80px] text-muted-foreground">{t.sourceName}</span>
                            <ArrowRight className="h-3 w-3 text-primary" />
                            <span className="truncate max-w-[80px] text-accent">{t.destName}</span>
                          </div>
                          <p className="text-lg font-headline font-bold">
                            {t.quantity} <span className="text-[10px] text-muted-foreground uppercase">Unidades</span>
                          </p>
                        </div>
                      ))}
                      {recentTransfers?.length === 0 && (
                        <div className="p-8 text-center text-xs text-muted-foreground italic">
                          No hay traslados hoy.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <div className="p-4 bg-accent/5 border border-accent/10 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-accent">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Nota de Control</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Toda transferencia descuenta stock real de forma inmediata. Asegúrate de verificar físicamente la salida de mercancía antes de confirmar.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
