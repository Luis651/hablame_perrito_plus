"use client";

import { useState, useMemo } from 'react';
import { AppSidebar } from '@/components/layout/Sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  ArrowRightLeft, ArrowRight, Boxes, History, AlertCircle,
  CheckCircle2, Warehouse, Store, Search, X, Plus, Minus,
  ChevronLeft, ChevronRight, Package, Check
} from 'lucide-react';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  useUser,
  setDocumentNonBlocking,
  addDocumentNonBlocking
} from '@/firebase';
import { collection, doc, serverTimestamp, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { MOCK_LOCATIONS } from '@/lib/mock-data';
import { cn, round4 } from '@/lib/utils';

// Tipo para un item seleccionado con su cantidad
interface SelectedItem {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantity: number;
}

type Step = 'setup' | 'select' | 'confirm';

export default function TransferenciasPage() {
  const firestore = useFirestore();
  const { user, role } = useUser();
  const { toast } = useToast();

  // --- QUERIES ---
  const ingredientsQuery = useMemoFirebase(() => collection(firestore, 'ingredients'), [firestore]);
  const { data: ingredients } = useCollection(ingredientsQuery);

  const transfersQuery = useMemoFirebase(
    () => query(collection(firestore, 'transfers'), orderBy('createdAt', 'desc'), limit(20)),
    [firestore]
  );
  const { data: recentTransfers } = useCollection(transfersQuery);

  // --- WIZARD STATE ---
  const [step, setStep] = useState<Step>('setup');
  const [sourceId, setSourceId] = useState('');
  const [destId, setDestId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // --- FILTERED INGREDIENTS ---
  const filteredIngredients = useMemo(() =>
    ingredients?.filter(i =>
      (i.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    ) ?? [],
    [ingredients, searchTerm]
  );

  // --- HELPERS ---
  const sourceName = MOCK_LOCATIONS.find(l => l.id === sourceId)?.name ?? '';
  const destName = MOCK_LOCATIONS.find(l => l.id === destId)?.name ?? '';

  const isSelected = (id: string) => selectedItems.some(i => i.ingredientId === id);
  const getSelectedItem = (id: string) => selectedItems.find(i => i.ingredientId === id);

  const toggleItem = (ing: any) => {
    if (isSelected(ing.id)) {
      setSelectedItems(prev => prev.filter(i => i.ingredientId !== ing.id));
    } else {
      setSelectedItems(prev => [...prev, {
        ingredientId: ing.id,
        ingredientName: ing.name,
        unit: ing.unit ?? '',
        quantity: 1
      }]);
    }
  };

  const updateQty = (ingredientId: string, delta: number) => {
    setSelectedItems(prev => prev.map(i => {
      if (i.ingredientId !== ingredientId) return i;
      const newQty = Math.max(0.01, parseFloat((i.quantity + delta).toFixed(2)));
      return { ...i, quantity: newQty };
    }));
  };

  const setQtyDirect = (ingredientId: string, value: string) => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed <= 0) return;
    setSelectedItems(prev => prev.map(i =>
      i.ingredientId === ingredientId ? { ...i, quantity: parsed } : i
    ));
  };

  const handleGoToSelect = () => {
    if (!sourceId || !destId) {
      toast({ variant: 'destructive', title: 'Faltan datos', description: 'Selecciona la sede de origen y destino.' });
      return;
    }
    if (sourceId === destId) {
      toast({ variant: 'destructive', title: 'Error', description: 'Origen y destino no pueden ser iguales.' });
      return;
    }
    setSelectedItems([]);
    setSearchTerm('');
    setStep('select');
  };

  const handleGoToConfirm = () => {
    if (selectedItems.length === 0) {
      toast({ variant: 'destructive', title: 'Sin insumos', description: 'Selecciona al menos un insumo.' });
      return;
    }
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (!user) return;
    setIsProcessing(true);
    try {
      for (const item of selectedItems) {
        // Verificar stock en origen
        const sourceRef = doc(firestore, 'locations', sourceId, 'inventory', item.ingredientId);
        const sourceSnap = await getDoc(sourceRef);
        const sourceQty = sourceSnap.exists() ? sourceSnap.data().quantity : 0;

        if (sourceQty < item.quantity) {
          toast({
            variant: 'destructive',
            title: `Stock insuficiente: ${item.ingredientName}`,
            description: `Solo hay ${sourceQty} ${item.unit} disponibles.`
          });
          setIsProcessing(false);
          return;
        }

        // Descontar origen
        setDocumentNonBlocking(sourceRef, {
          quantity: Math.max(0, round4(sourceQty - item.quantity)),
          lastUpdatedAt: serverTimestamp()
        }, { merge: true });

        // Sumar destino
        const destRef = doc(firestore, 'locations', destId, 'inventory', item.ingredientId);
        const destSnap = await getDoc(destRef);
        const destQty = destSnap.exists() ? destSnap.data().quantity : 0;

        setDocumentNonBlocking(destRef, {
          id: item.ingredientId,
          ingredientId: item.ingredientId,
          locationId: destId,
          quantity: round4(destQty + item.quantity),
          lastUpdatedAt: serverTimestamp()
        }, { merge: true });

        // Registrar log
        addDocumentNonBlocking(collection(firestore, 'transfers'), {
          ingredientId: item.ingredientId,
          ingredientName: item.ingredientName,
          sourceId,
          sourceName,
          destId,
          destName,
          quantity: item.quantity,
          createdBy: user.uid,
          createdAt: serverTimestamp()
        });
      }

      toast({
        title: '¡Traslado Exitoso!',
        description: `${selectedItems.length} insumo(s) enviados de ${sourceName} → ${destName}.`
      });

      // Reset
      setSelectedItems([]);
      setStep('setup');
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error crítico', description: 'No se pudo completar el traslado.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // ==================== RENDER ====================
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <AppSidebar role={role} />

      <main className="flex-1 flex flex-col overflow-hidden">

        {/* ── STEP: SETUP (Selección de sedes) ── */}
        {step === 'setup' && (
          <>
            {/* Header */}
            <div className="shrink-0 px-4 pt-16 pb-4 lg:pt-6 border-b border-border bg-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="h-6 w-6 text-primary shrink-0" />
                  <div>
                    <h1 className="text-lg font-bold leading-tight">Traslado de Insumos</h1>
                    <p className="text-xs text-muted-foreground">Mueve mercancía entre sedes</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-2 px-3 rounded-lg hover:bg-muted"
                >
                  <History className="h-4 w-4" />
                  <span className="hidden sm:inline">Historial</span>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
              {/* Sede Origen */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Warehouse className="h-4 w-4" />
                  <Label className="text-xs font-bold uppercase tracking-widest">Sede de Origen</Label>
                </div>
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger className="h-14 text-base">
                    <SelectValue placeholder="¿Desde dónde sale?" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOCK_LOCATIONS.map(loc => (
                      <SelectItem key={loc.id} value={loc.id} className="text-base py-3">{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Flecha visual */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <div className="p-2 rounded-full bg-primary/10 text-primary border border-primary/20">
                  <ArrowRight className="h-4 w-4" />
                </div>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Sede Destino */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-accent">
                  <Store className="h-4 w-4" />
                  <Label className="text-xs font-bold uppercase tracking-widest">Sede de Destino</Label>
                </div>
                <Select value={destId} onValueChange={setDestId}>
                  <SelectTrigger className="h-14 text-base">
                    <SelectValue placeholder="¿A dónde va?" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOCK_LOCATIONS.map(loc => (
                      <SelectItem key={loc.id} value={loc.id} className="text-base py-3">{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Resumen ruta */}
              {sourceId && destId && sourceId !== destId && (
                <div className="p-4 bg-primary/5 border border-primary/15 rounded-2xl flex items-center gap-3">
                  <div className="flex-1 text-center">
                    <p className="text-xs text-muted-foreground uppercase font-bold">Desde</p>
                    <p className="font-bold text-sm mt-0.5">{sourceName}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 text-center">
                    <p className="text-xs text-muted-foreground uppercase font-bold">Hacia</p>
                    <p className="font-bold text-sm mt-0.5">{destName}</p>
                  </div>
                </div>
              )}

              {/* Historial Reciente */}
              {showHistory && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                    <History className="h-3.5 w-3.5" /> Traslados Recientes
                  </p>
                  <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
                    {recentTransfers?.length === 0 && (
                      <div className="p-6 text-center text-xs text-muted-foreground italic">Sin traslados recientes</div>
                    )}
                    {recentTransfers?.map(t => (
                      <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.ingredientName}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-muted-foreground truncate max-w-[70px]">{t.sourceName}</span>
                            <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                            <span className="text-[10px] text-accent truncate max-w-[70px]">{t.destName}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-sm">{t.quantity}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {t.createdAt?.seconds ? new Date(t.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Nota */}
              <div className="p-4 bg-amber-500/5 border border-amber-500/15 rounded-2xl flex gap-3">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  El traslado descuenta el stock del origen de forma inmediata. Verifica la mercancía físicamente antes de confirmar.
                </p>
              </div>
            </div>

            {/* CTA Fijo */}
            <div className="shrink-0 p-4 pb-20 lg:pb-4 border-t border-border bg-card">
              <Button
                className="w-full h-14 text-base font-bold gap-2"
                onClick={handleGoToSelect}
                disabled={!sourceId || !destId || sourceId === destId}
              >
                Seleccionar Insumos
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </>
        )}

        {/* ── STEP: SELECT (Selección múltiple de insumos) ── */}
        {step === 'select' && (
          <>
            {/* Header */}
            <div className="shrink-0 px-4 pt-16 pb-3 lg:pt-4 border-b border-border bg-card">
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => setStep('setup')}
                  className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-base">Elige los Insumos</h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted-foreground truncate">{sourceName}</span>
                    <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                    <span className="text-xs text-accent truncate">{destName}</span>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0 font-bold">
                  {selectedItems.length} sel.
                </Badge>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-10"
                  placeholder="Buscar insumo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>

            {/* Sticky: items seleccionados con cantidad */}
            {selectedItems.length > 0 && (
              <div className="shrink-0 bg-primary/5 border-b border-primary/15">
                <p className="text-[10px] font-bold uppercase text-primary px-4 pt-2 pb-1">
                  Insumos seleccionados — ajusta cantidades
                </p>
                <div className="divide-y divide-primary/10 max-h-52 overflow-y-auto">
                  {selectedItems.map(item => (
                    <div key={item.ingredientId} className="flex items-center gap-3 px-4 py-2.5">
                      <button
                        onClick={() => toggleItem({ id: item.ingredientId })}
                        className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                      >
                        <X className="h-3 w-3 text-primary-foreground" />
                      </button>
                      <p className="flex-1 text-sm font-medium truncate">{item.ingredientName}</p>
                      {/* Quantity control */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => updateQty(item.ingredientId, -1)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted hover:bg-muted/70 active:scale-95 transition-all"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <Input
                          type="number"
                          inputMode="decimal"
                          className="w-16 h-8 text-center text-sm font-bold p-1"
                          value={item.quantity}
                          onChange={(e) => setQtyDirect(item.ingredientId, e.target.value)}
                        />
                        <button
                          onClick={() => updateQty(item.ingredientId, 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted hover:bg-muted/70 active:scale-95 transition-all"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-[10px] text-muted-foreground w-8 text-center">{item.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista de ingredientes */}
            <div className="flex-1 overflow-y-auto divide-y divide-border/60">
              {/* Botón seleccionar/deseleccionar todo */}
              <div className="px-4 py-2 flex items-center justify-between bg-muted/20">
                <span className="text-xs text-muted-foreground">{filteredIngredients.length} insumos</span>
                <button
                  className="text-xs font-bold text-primary"
                  onClick={() => {
                    if (selectedItems.length === filteredIngredients.length) {
                      setSelectedItems([]);
                    } else {
                      const allItems = filteredIngredients.map(ing => ({
                        ingredientId: ing.id,
                        ingredientName: ing.name,
                        unit: ing.unit ?? '',
                        quantity: getSelectedItem(ing.id)?.quantity ?? 1
                      }));
                      setSelectedItems(allItems);
                    }
                  }}
                >
                  {selectedItems.length === filteredIngredients.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                </button>
              </div>

              {filteredIngredients.map(ing => {
                const selected = isSelected(ing.id);
                return (
                  <button
                    key={ing.id}
                    onClick={() => toggleItem(ing)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-4 text-left transition-colors active:opacity-70",
                      selected ? "bg-primary/8" : "hover:bg-muted/30"
                    )}
                  >
                    {/* Checkbox visual */}
                    <div className={cn(
                      "w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                      selected ? "border-primary bg-primary" : "border-border bg-background"
                    )}>
                      {selected && <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-medium truncate", selected && "font-bold text-primary")}>
                        {ing.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase">{ing.unit}</p>
                    </div>

                    {selected && (
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                        {getSelectedItem(ing.id)?.quantity} {ing.unit}
                      </span>
                    )}
                  </button>
                );
              })}

              {filteredIngredients.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                  <Package className="h-8 w-8 opacity-30" />
                  <p className="text-xs">No hay insumos que coincidan</p>
                </div>
              )}
            </div>

            {/* Botón fijo — fuera del scroll */}
            <div className="shrink-0 p-4 pb-20 lg:pb-4 border-t border-border bg-card safe-bottom">
              <Button
                className="w-full h-14 text-base font-bold gap-2"
                onClick={handleGoToConfirm}
                disabled={selectedItems.length === 0}
              >
                Revisar Traslado ({selectedItems.length})
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </>
        )}

        {/* ── STEP: CONFIRM (Resumen y confirmación) ── */}
        {step === 'confirm' && (
          <>
            {/* Header */}
            <div className="shrink-0 px-4 pt-16 pb-4 lg:pt-6 border-b border-border bg-card">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep('select')}
                  className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div>
                  <h2 className="font-bold text-base">Confirmar Traslado</h2>
                  <p className="text-xs text-muted-foreground">Revisa el resumen antes de enviar</p>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-28">
              {/* Ruta */}
              <div className="p-4 bg-primary/5 border border-primary/15 rounded-2xl">
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-3">Ruta del Traslado</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-center p-3 bg-background rounded-xl border border-border">
                    <Warehouse className="h-5 w-5 text-primary mx-auto mb-1" />
                    <p className="text-xs font-bold">{sourceName}</p>
                    <p className="text-[10px] text-muted-foreground">Origen</p>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <ArrowRight className="h-5 w-5 text-primary" />
                    <p className="text-[10px] text-muted-foreground font-bold">{selectedItems.length} items</p>
                  </div>
                  <div className="flex-1 text-center p-3 bg-background rounded-xl border border-border">
                    <Store className="h-5 w-5 text-accent mx-auto mb-1" />
                    <p className="text-xs font-bold">{destName}</p>
                    <p className="text-[10px] text-muted-foreground">Destino</p>
                  </div>
                </div>
              </div>

              {/* Lista de insumos a trasladar */}
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2">Insumos a Trasladar</p>
                <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
                  {selectedItems.map((item, idx) => (
                    <div key={item.ingredientId} className="flex items-center px-4 py-3 gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold">{idx + 1}</span>
                      </div>
                      <p className="flex-1 text-sm font-medium truncate">{item.ingredientName}</p>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-sm">{item.quantity}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">{item.unit}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Advertencia */}
              <div className="p-4 bg-destructive/5 border border-destructive/15 rounded-2xl flex gap-3">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Al confirmar, el stock se descontará <strong>de inmediato</strong> de <strong>{sourceName}</strong> y se acreditará en <strong>{destName}</strong>. Esta acción no se puede deshacer.
                </p>
              </div>
            </div>

            {/* CTAs Fijos */}
            <div className="shrink-0 p-4 pb-20 lg:pb-4 border-t border-border bg-card flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-14"
                onClick={() => setStep('select')}
                disabled={isProcessing}
              >
                Editar
              </Button>
              <Button
                className="flex-[2] h-14 text-base font-bold gap-2"
                onClick={handleConfirm}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>Procesando...</>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Confirmar Traslado
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
