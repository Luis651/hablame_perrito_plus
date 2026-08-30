
"use client";

import { useState, useMemo } from 'react';
import { AppSidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Plus, 
  Package, 
  Search, 
  AlertTriangle, 
  Calculator, 
  Boxes, 
  MapPin,
  Warehouse,
  Store,
  ChevronRight,
  Pencil,
  Trash2,
  FlaskConical,
  ChefHat,
  Check,
  X,
  ChevronLeft
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter
} from '@/components/ui/sheet';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  useCollection, 
  useFirestore, 
  useMemoFirebase, 
  useUser,
  setDocumentNonBlocking,
  updateDocumentNonBlocking,
  addDocumentNonBlocking
} from '@/firebase';
import { collection, doc, serverTimestamp, query, where, deleteDoc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { cn, round2, round4 } from '@/lib/utils';
import { MOCK_LOCATIONS } from '@/lib/mock-data';
import { WasteReason } from '@/lib/types';
import { Textarea } from '@/components/ui/textarea';

interface RecipeItem {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
}

export default function InventarioPage() {
  const firestore = useFirestore();
  const { user, profile, role } = useUser();
  const { toast } = useToast();
  
  // Estado para la sede que estamos visualizando
  const [viewLocationId, setViewLocationId] = useState(profile?.locationId || "br-1");
  const isAdmin = role === 'ADMIN';

  const currentLoc = MOCK_LOCATIONS.find(l => l.id === viewLocationId);
  const isWarehouse = currentLoc?.type === 'WAREHOUSE';

  // --- CONSULTAS ---
  const ingredientsQuery = useMemoFirebase(() => collection(firestore, 'ingredients'), [firestore]);
  const { data: ingredients } = useCollection(ingredientsQuery);

  // Inventario de la sede seleccionada
  const inventoryQuery = useMemoFirebase(() => {
    if (!viewLocationId) return null;
    return query(collection(firestore, 'locations', viewLocationId, 'inventory'));
  }, [firestore, viewLocationId]);
  const { data: currentInventory } = useCollection(inventoryQuery);

  // Necesitamos ver el stock global para comparar (Simulado o con una query general si existiera)
  // En este MVP, usaremos el inventario de la sede seleccionada pero permitiremos al admin cambiarla.

  const [isEntryDialogOpen, setIsEntryDialogOpen] = useState(false);
  const [isIngredientDialogOpen, setIsIngredientDialogOpen] = useState(false);
  const [isEditIngredientDialogOpen, setIsEditIngredientDialogOpen] = useState(false);
  const [isWasteDialogOpen, setIsWasteDialogOpen] = useState(false);
  const [wasteItem, setWasteItem] = useState<any>(null);
  const [wasteQuantity, setWasteQuantity] = useState("");
  const [wasteReason, setWasteReason] = useState<WasteReason>('DAMAGE');
  const [wasteNotes, setWasteNotes] = useState("");
  const [isSavingWaste, setIsSavingWaste] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [editingIngredient, setEditingIngredient] = useState<any>(null);
  const [entryMode, setEntryMode] = useState<"BULTOS" | "UNIDADES">("BULTOS");
  const [bultosCount, setBultosCount] = useState("");
  const [unitsPerBulto, setUnitsPerBulto] = useState("");
  const [directUnits, setDirectUnits] = useState("");
  const [entryLocationId, setEntryLocationId] = useState(viewLocationId);

  const [createActiveTab, setCreateActiveTab] = useState<'general' | 'recipe'>('general');
  const [editActiveTab, setEditActiveTab] = useState<'general' | 'recipe'>('general');
  const [ingredientSearch, setIngredientSearch] = useState('');

  const [newIngredient, setNewIngredient] = useState({
    name: '',
    unit: 'unidades',
    category: 'General',
    isSubInsumo: false,
    yieldQty: 1,
    recipe: [] as RecipeItem[]
  });

  const toggleRecipeItemForNew = (ing: any) => {
    const exists = newIngredient.recipe.find(r => r.ingredientId === ing.id);
    if (exists) {
      setNewIngredient(prev => ({
        ...prev,
        recipe: prev.recipe.filter(r => r.ingredientId !== ing.id)
      }));
    } else {
      setNewIngredient(prev => ({
        ...prev,
        recipe: [...prev.recipe, {
          ingredientId: ing.id,
          ingredientName: ing.name,
          quantity: 1,
          unit: ing.unit || ''
        }]
      }));
    }
  };

  const updateRecipeQtyForNew = (ingredientId: string, qty: number) => {
    setNewIngredient(prev => ({
      ...prev,
      recipe: prev.recipe.map(r => r.ingredientId === ingredientId ? { ...r, quantity: qty } : r)
    }));
  };

  const toggleRecipeItemForEditing = (ing: any) => {
    const exists = editingIngredient.recipe?.find((r: any) => r.ingredientId === ing.id);
    if (exists) {
      setEditingIngredient((prev: any) => ({
        ...prev,
        recipe: prev.recipe.filter((r: any) => r.ingredientId !== ing.id)
      }));
    } else {
      setEditingIngredient((prev: any) => ({
        ...prev,
        recipe: [...(prev.recipe || []), {
          ingredientId: ing.id,
          ingredientName: ing.name,
          quantity: 1,
          unit: ing.unit || ''
        }]
      }));
    }
  };

  const updateRecipeQtyForEditing = (ingredientId: string, qty: number) => {
    setEditingIngredient((prev: any) => ({
      ...prev,
      recipe: prev.recipe.map((r: any) => r.ingredientId === ingredientId ? { ...r, quantity: qty } : r)
    }));
  };

  const handleSaveIngredient = () => {
    if (!newIngredient.name) return;
    const ingredientsRef = collection(firestore, 'ingredients');
    const newDoc = doc(ingredientsRef);
    setDocumentNonBlocking(newDoc, { ...newIngredient, id: newDoc.id }, { merge: true });
    setIsIngredientDialogOpen(false);
    setNewIngredient({
      name: '',
      unit: 'unidades',
      category: 'General',
      isSubInsumo: false,
      yieldQty: 1,
      recipe: []
    });
    setCreateActiveTab('general');
    toast({ title: "Insumo creado maestro" });
  };

  const handleUpdateIngredient = () => {
    if (!editingIngredient || !editingIngredient.name) return;
    const ingredientRef = doc(firestore, 'ingredients', editingIngredient.id);
    updateDocumentNonBlocking(ingredientRef, {
      name: editingIngredient.name,
      unit: editingIngredient.unit,
      category: editingIngredient.category,
      isSubInsumo: editingIngredient.isSubInsumo || false,
      yieldQty: editingIngredient.yieldQty || 1,
      recipe: editingIngredient.recipe || []
    });
    setIsEditIngredientDialogOpen(false);
    setEditingIngredient(null);
    setEditActiveTab('general');
    toast({ title: "Insumo actualizado", description: "Los cambios se han guardado." });
  };

  const handleDeleteIngredient = async (ingredientId: string) => {
    if (confirm("¿Estás seguro de eliminar este insumo? Se borrará del catálogo maestro y ya no aparecerá en el inventario.")) {
      try {
        await deleteDoc(doc(firestore, 'ingredients', ingredientId));
        toast({ title: "Insumo eliminado", description: "El registro ha sido borrado." });
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el insumo." });
      }
    }
  };

  const handleStockEntry = async () => {
    if (!selectedIngredientId || !entryLocationId) return;
    const selectedIng = ingredients?.find(ing => ing.id === selectedIngredientId);
    if (!selectedIng) return;

    let totalToAdd = 0;
    if (entryMode === "BULTOS") {
      const b = parseFloat(bultosCount);
      const u = parseFloat(unitsPerBulto);
      if (isNaN(b) || isNaN(u)) return;
      totalToAdd = round4(b * u);
    } else {
      totalToAdd = round4(parseFloat(directUnits));
      if (isNaN(totalToAdd) || totalToAdd <= 0) return;
    }

    const destLoc = MOCK_LOCATIONS.find(l => l.id === entryLocationId);

    // Si es un sub-insumo, verificar que la sede de destino sea un depósito (WAREHOUSE)
    if (selectedIng.isSubInsumo && destLoc?.type !== 'WAREHOUSE') {
      toast({
        variant: "destructive",
        title: "Operación no permitida",
        description: "La producción de sub-insumos solo está permitida en el Depósito Central."
      });
      return;
    }

    // Si es un sub-insumo, verificar stock de los ingredientes de su receta y descontarlos
    if (selectedIng.isSubInsumo) {
      const recipe = selectedIng.recipe || [];
      if (recipe.length === 0) {
        toast({
          variant: "destructive",
          title: "Receta vacía",
          description: "Este sub-insumo no tiene ingredientes configurados en su receta."
        });
        return;
      }

      const yieldQty = selectedIng.yieldQty || 1;
      const ratio = totalToAdd / yieldQty;

      // 1. Verificar stock en Firestore para todos los ingredientes de la receta
      const requiredStocks: { ingredientId: string; name: string; quantity: number; available: number; unit: string }[] = [];
      
      for (const item of recipe) {
        const requiredQty = round4(item.quantity * ratio);
        const ingRef = doc(firestore, 'locations', entryLocationId, 'inventory', item.ingredientId);
        const ingSnap = await getDoc(ingRef);
        const available = ingSnap.exists() ? (ingSnap.data().quantity || 0) : 0;
        
        if (available < requiredQty) {
          toast({
            variant: "destructive",
            title: "Stock insuficiente",
            description: `Se necesitan ${requiredQty.toFixed(2)} ${item.unit || 'und'} de ${item.ingredientName}, pero solo hay ${available} disponibles en ${destLoc?.name}.`
          });
          return;
        }
        requiredStocks.push({
          ingredientId: item.ingredientId,
          name: item.ingredientName,
          quantity: requiredQty,
          available: available,
          unit: item.unit
        });
      }

      // 2. Descontar stock de ingredientes
      for (const item of requiredStocks) {
        const ingRef = doc(firestore, 'locations', entryLocationId, 'inventory', item.ingredientId);
        setDocumentNonBlocking(ingRef, {
          quantity: Math.max(0, round4(item.available - item.quantity)),
          lastUpdatedAt: serverTimestamp()
        }, { merge: true });
      }

      // 3. Registrar log de producción
      addDocumentNonBlocking(collection(firestore, 'production_logs'), {
        preparadoId: selectedIngredientId,
        preparadoName: selectedIng.name,
        locationId: entryLocationId,
        locationName: destLoc?.name || "",
        batchCount: ratio,
        totalProduced: totalToAdd,
        unit: selectedIng.unit,
        createdBy: user?.uid || "system",
        createdAt: serverTimestamp()
      });
    }

    // 4. Agregar stock del insumo/sub-insumo
    const currentItem = currentInventory?.find(i => i.ingredientId === selectedIngredientId);
    let currentQty = 0;
    if (entryLocationId === viewLocationId) {
      currentQty = currentItem?.quantity || 0;
    } else {
      const itemRef = doc(firestore, 'locations', entryLocationId, 'inventory', selectedIngredientId);
      const itemSnap = await getDoc(itemRef);
      currentQty = itemSnap.exists() ? itemSnap.data().quantity : 0;
    }

    const inventoryRef = doc(firestore, 'locations', entryLocationId, 'inventory', selectedIngredientId);
    setDocumentNonBlocking(inventoryRef, {
      id: selectedIngredientId,
      ingredientId: selectedIngredientId,
      locationId: entryLocationId,
      quantity: round4(currentQty + totalToAdd),
      lastUpdatedAt: serverTimestamp()
    }, { merge: true });

    setIsEntryDialogOpen(false);
    resetEntryForm();
    toast({ 
      title: selectedIng.isSubInsumo ? "Producción automática completada" : "Stock actualizado", 
      description: selectedIng.isSubInsumo
        ? `Se elaboraron ${totalToAdd} ${selectedIng.unit} de ${selectedIng.name} consumiendo sus insumos.`
        : `Ingreso procesado en ${destLoc?.name}`
    });
  };

  const resetEntryForm = () => {
    setSelectedIngredientId("");
    setEntryMode("BULTOS");
    setBultosCount("");
    setUnitsPerBulto("");
    setDirectUnits("");
  };

  const handleOpenWasteDialog = (item: any) => {
    setWasteItem(item);
    setWasteQuantity("1");
    setWasteReason("DAMAGE");
    setWasteNotes("");
    setIsWasteDialogOpen(true);
  };

  const handleSaveWaste = async () => {
    if (!wasteItem || !wasteQuantity || parseFloat(wasteQuantity) <= 0 || !viewLocationId) {
      toast({ variant: "destructive", title: "Datos inválidos", description: "Indica una cantidad válida mayor a 0." });
      return;
    }

    const currentQty = wasteItem.currentQuantity || 0;
    const qty = round4(parseFloat(wasteQuantity));

    if (currentQty <= 0) {
      toast({
        variant: "destructive",
        title: "Sin existencias",
        description: `No hay stock de ${wasteItem.name} en ${currentLocationName} para reportar merma.`
      });
      return;
    }

    if (qty > currentQty) {
      toast({
        variant: "destructive",
        title: "Cantidad supera el stock",
        description: `No puedes reportar ${qty} ${wasteItem.unit}. El stock actual en ${currentLocationName} es de ${currentQty} ${wasteItem.unit}.`
      });
      return;
    }

    setIsSavingWaste(true);
    try {
      // 1. Descontar del inventario de la sede
      const newQty = Math.max(0, round4(currentQty - qty));

      const invRef = doc(firestore, 'locations', viewLocationId, 'inventory', wasteItem.id);
      await setDocumentNonBlocking(invRef, {
        id: wasteItem.id,
        ingredientId: wasteItem.id,
        locationId: viewLocationId,
        quantity: newQty,
        lastUpdatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Guardar registro en log de mermas
      const wasteLogsRef = collection(firestore, 'waste_logs');
      await addDocumentNonBlocking(wasteLogsRef, {
        ingredientId: wasteItem.id,
        ingredientName: wasteItem.name,
        quantity: qty,
        unit: wasteItem.unit || 'unidades',
        locationId: viewLocationId,
        locationName: currentLocationName,
        reason: wasteReason,
        notes: wasteNotes || '',
        registeredBy: user?.uid || 'anon',
        registeredByName: profile?.firstName ? `${profile.firstName} ${profile.lastName}` : (user?.displayName || 'Usuario'),
        createdAt: serverTimestamp()
      });

      toast({
        title: "Merma registrada",
        description: `Se descontaron ${qty} ${wasteItem.unit} de ${wasteItem.name} en ${currentLocationName}.`
      });
      setIsWasteDialogOpen(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "No se pudo registrar la merma." });
    } finally {
      setIsSavingWaste(false);
    }
  };

  const selectedIngredient = ingredients?.find(ing => ing.id === selectedIngredientId);
  const isInvalidSubInsumoLocation = selectedIngredient?.isSubInsumo && 
    (MOCK_LOCATIONS.find(l => l.id === entryLocationId)?.type !== 'WAREHOUSE');
  const unitLabel = selectedIngredient?.unit === 'kg' ? 'Kilos' : 
                    selectedIngredient?.unit === 'litros' ? 'Litros' : 
                    'Unidades';

  const filteredInventory = ingredients?.filter(ing => 
    (ing.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  ).map(ing => {
    const inv = currentInventory?.find(i => i.ingredientId === ing.id);
    return {
      ...ing,
      currentQuantity: inv?.quantity || 0,
      lastUpdate: inv?.lastUpdatedAt
    };
  });

  const currentLocationName = MOCK_LOCATIONS.find(l => l.id === viewLocationId)?.name || "Sede";

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <AppSidebar role={role} />
      
      <main className="flex-1 overflow-y-auto p-3 sm:p-6 pt-16 pb-24 lg:pt-6 lg:pb-6">
        <div className="max-w-7xl mx-auto">
          {isIngredientDialogOpen ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              <Button
                variant="ghost"
                className="gap-2 h-10 border border-border bg-card shadow-sm text-xs"
                onClick={() => {
                  setIsIngredientDialogOpen(false);
                  setNewIngredient({ name: '', unit: 'unidades', category: 'General', isSubInsumo: false, yieldQty: 1, recipe: [] });
                }}
              >
                <ChevronLeft className="h-4 w-4" /> Volver al Inventario
              </Button>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-2xl border border-border shadow-sm">
                <div>
                  <h1 className="text-xl md:text-2xl font-headline font-bold flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" /> Definir Nuevo Insumo
                  </h1>
                  <p className="text-xs text-muted-foreground">Añade un insumo o sub-insumo al catálogo maestro.</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    className="h-10 text-xs"
                    onClick={() => {
                      setIsIngredientDialogOpen(false);
                      setNewIngredient({ name: '', unit: 'unidades', category: 'General', isSubInsumo: false, yieldQty: 1, recipe: [] });
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="h-10 text-xs shadow-md shadow-primary/10"
                    onClick={handleSaveIngredient}
                    disabled={!newIngredient.name}
                  >
                    Crear Insumo
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
                {/* Panel Izquierdo: General */}
                <div className="lg:col-span-5 space-y-4">
                  <Card className="bg-card border-border shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Datos Generales</CardTitle>
                      <CardDescription className="text-xs">Información básica del insumo</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-1 space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Nombre del Insumo *</Label>
                        <Input
                          placeholder="Ej: Pan de Hamburguesa"
                          value={newIngredient.name}
                          onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
                          className="h-11 text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Unidad *</Label>
                          <Select value={newIngredient.unit} onValueChange={(v) => setNewIngredient({ ...newIngredient, unit: v })}>
                            <SelectTrigger className="h-11 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unidades" className="text-xs">Unidades</SelectItem>
                              <SelectItem value="kg" className="text-xs">Kilogramos (kg)</SelectItem>
                              <SelectItem value="litros" className="text-xs">Litros (L)</SelectItem>
                              <SelectItem value="paquetes" className="text-xs">Paquetes</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Categoría</Label>
                          <Input
                            placeholder="Ej: Panadería"
                            value={newIngredient.category}
                            onChange={(e) => setNewIngredient({ ...newIngredient, category: e.target.value })}
                            className="h-11 text-xs"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-primary/5 rounded-2xl border border-primary/10 mt-2">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-xs">¿Es un Sub-Insumo?</p>
                          <p className="text-[10px] text-muted-foreground">Se prepara mezclando otros insumos</p>
                        </div>
                        <Switch
                          checked={newIngredient.isSubInsumo}
                          onCheckedChange={(checked) => setNewIngredient(prev => ({ ...prev, isSubInsumo: checked }))}
                        />
                      </div>

                      {newIngredient.isSubInsumo && (
                        <div className="space-y-2 pt-2 animate-in fade-in duration-200">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Rendimiento de la receta *</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              placeholder="Ej: 1"
                              value={newIngredient.yieldQty}
                              onChange={(e) => setNewIngredient({ ...newIngredient, yieldQty: Math.max(0.01, parseFloat(e.target.value) || 1) })}
                              className="h-11 font-bold text-sm w-full"
                            />
                            <span className="text-xs font-bold text-muted-foreground">{newIngredient.unit}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground italic leading-relaxed">Cantidad estándar producida por la receta mezcla.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Panel Derecho: Receta o Info */}
                <div className="lg:col-span-7">
                  {newIngredient.isSubInsumo ? (
                    <Card className="bg-card border-border shadow-sm flex flex-col h-[520px]">
                      <CardHeader className="p-4 pb-2 shrink-0">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Receta de Mezcla</CardTitle>
                        <CardDescription className="text-xs">Selecciona y dosifica los ingredientes de la receta.</CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-1 flex-1 flex flex-col min-h-0 space-y-4 overflow-hidden">
                        {/* Ingredientes en Receta */}
                        <div className="flex flex-col min-h-0 shrink-0">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Ingredientes Seleccionados ({newIngredient.recipe.length})</Label>
                          {newIngredient.recipe.length > 0 ? (
                            <div className="border border-border rounded-xl divide-y divide-border/50 overflow-y-auto max-h-[160px] bg-muted/10">
                              {newIngredient.recipe.map(item => (
                                <div key={item.ingredientId} className="flex items-center gap-3 px-3 py-2 bg-card">
                                  <button
                                    type="button"
                                    onClick={() => toggleRecipeItemForNew({ id: item.ingredientId })}
                                    className="shrink-0 w-6 h-6 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive hover:text-white transition-colors"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                  <p className="flex-1 text-xs font-semibold truncate">{item.ingredientName}</p>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      placeholder="1"
                                      className="w-20 h-9 text-center text-xs font-bold bg-background border border-border"
                                      value={item.quantity === 0 ? "" : item.quantity}
                                      onChange={e => {
                                        const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
                                        updateRecipeQtyForNew(item.ingredientId, isNaN(val) ? 0 : val);
                                      }}
                                    />
                                    <span className="text-[10px] font-semibold text-muted-foreground w-12 truncate">{item.unit}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="border border-dashed border-border rounded-xl p-4 text-center text-muted-foreground flex flex-col items-center justify-center py-6 bg-muted/5">
                              <ChefHat className="h-6 w-6 mb-1 text-muted-foreground/45" />
                              <p className="text-[10px] font-bold uppercase">Sin Ingredientes</p>
                              <p className="text-[9px] mt-0.5">Elige ingredientes del catálogo a continuación.</p>
                            </div>
                          )}
                        </div>

                        {/* Catálogo */}
                        <div className="flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground shrink-0">Catálogo de Insumos</Label>
                          <div className="relative shrink-0">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              className="pl-8 h-9 text-xs"
                              placeholder="Buscar insumos..."
                              value={ingredientSearch}
                              onChange={e => setIngredientSearch(e.target.value)}
                            />
                          </div>
                          <div className="border border-border rounded-xl divide-y divide-border/50 overflow-y-auto flex-1 bg-muted/5">
                            {ingredients
                              ?.filter(ing =>
                                (ing.name || "").toLowerCase().includes(ingredientSearch.toLowerCase())
                              )
                              .map(ing => {
                                const selected = newIngredient.recipe.some(r => r.ingredientId === ing.id);
                                return (
                                  <button
                                    key={ing.id}
                                    type="button"
                                    onClick={() => toggleRecipeItemForNew(ing)}
                                    className={cn(
                                      "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors text-xs",
                                      selected ? "bg-primary/5" : "hover:bg-muted/30"
                                    )}
                                  >
                                    <div className={cn(
                                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all",
                                      selected ? "border-primary bg-primary text-white" : "border-border bg-background"
                                    )}>
                                      {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className={cn("font-medium truncate", selected && "font-bold text-primary")}>{ing.name}</p>
                                    </div>
                                    <Badge variant="secondary" className="text-[9px] uppercase font-bold tracking-wider">{ing.unit}</Badge>
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="bg-card border-border border-dashed shadow-sm flex flex-col justify-center items-center p-8 text-center h-[280px]">
                      <FlaskConical className="h-10 w-10 text-muted-foreground/30 mb-3" />
                      <h3 className="font-bold text-sm text-foreground">Insumo Directo o Simple</h3>
                      <p className="text-xs text-muted-foreground max-w-sm mt-1 leading-relaxed">
                        Este insumo se compra y almacena directamente. No requiere receta de preparación para ser producido.
                      </p>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          ) : isEditIngredientDialogOpen ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              <Button
                variant="ghost"
                className="gap-2 h-10 border border-border bg-card shadow-sm text-xs"
                onClick={() => {
                  setIsEditIngredientDialogOpen(false);
                  setEditingIngredient(null);
                }}
              >
                <ChevronLeft className="h-4 w-4" /> Volver al Inventario
              </Button>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-2xl border border-border shadow-sm">
                <div>
                  <h1 className="text-xl md:text-2xl font-headline font-bold flex items-center gap-2">
                    <Pencil className="h-5 w-5 text-primary" /> Editar Insumo
                  </h1>
                  <p className="text-xs text-muted-foreground">Modifica los detalles del insumo en el catálogo maestro.</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    className="h-10 text-xs"
                    onClick={() => {
                      setIsEditIngredientDialogOpen(false);
                      setEditingIngredient(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="h-10 text-xs shadow-md shadow-primary/10"
                    onClick={handleUpdateIngredient}
                    disabled={!editingIngredient?.name}
                  >
                    Guardar Cambios
                  </Button>
                </div>
              </div>

              {editingIngredient && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
                  {/* Panel Izquierdo: General */}
                  <div className="lg:col-span-5 space-y-4">
                    <Card className="bg-card border-border shadow-sm">
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Datos Generales</CardTitle>
                        <CardDescription className="text-xs">Modifica datos básicos del insumo</CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-1 space-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Nombre del Insumo *</Label>
                          <Input
                            placeholder="Ej: Pan de Hamburguesa"
                            value={editingIngredient.name}
                            onChange={(e) => setEditingIngredient({ ...editingIngredient, name: e.target.value })}
                            className="h-11 text-xs"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Unidad *</Label>
                            <Select value={editingIngredient.unit} onValueChange={(v) => setEditingIngredient({ ...editingIngredient, unit: v })}>
                              <SelectTrigger className="h-11 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unidades" className="text-xs">Unidades</SelectItem>
                                <SelectItem value="kg" className="text-xs">Kilogramos (kg)</SelectItem>
                                <SelectItem value="litros" className="text-xs">Litros (L)</SelectItem>
                                <SelectItem value="paquetes" className="text-xs">Paquetes</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Categoría</Label>
                            <Input
                              placeholder="Ej: Panadería"
                              value={editingIngredient.category}
                              onChange={(e) => setEditingIngredient({ ...editingIngredient, category: e.target.value })}
                              className="h-11 text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-primary/5 rounded-2xl border border-primary/10 mt-2">
                          <div className="space-y-0.5">
                            <p className="font-semibold text-xs">¿Es un Sub-Insumo?</p>
                            <p className="text-[10px] text-muted-foreground">Se prepara mezclando otros insumos</p>
                          </div>
                          <Switch
                            checked={editingIngredient.isSubInsumo || false}
                            onCheckedChange={(checked) => setEditingIngredient((prev: any) => ({ ...prev, isSubInsumo: checked }))}
                          />
                        </div>

                        {editingIngredient.isSubInsumo && (
                          <div className="space-y-2 pt-2 animate-in fade-in duration-200">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Rendimiento de la receta *</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                placeholder="Ej: 1"
                                value={editingIngredient.yieldQty || 1}
                                onChange={(e) => setEditingIngredient({ ...editingIngredient, yieldQty: Math.max(0.01, parseFloat(e.target.value) || 1) })}
                                className="h-11 font-bold text-sm w-full"
                              />
                              <span className="text-xs font-bold text-muted-foreground">{editingIngredient.unit}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground italic leading-relaxed">Cantidad estándar producida por la mezcla.</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Panel Derecho: Receta o Info */}
                  <div className="lg:col-span-7">
                    {editingIngredient.isSubInsumo ? (
                      <Card className="bg-card border-border shadow-sm flex flex-col h-[520px]">
                        <CardHeader className="p-4 pb-2 shrink-0">
                          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Receta de Mezcla</CardTitle>
                          <CardDescription className="text-xs">Selecciona y dosifica los ingredientes de la receta.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 pt-1 flex-1 flex flex-col min-h-0 space-y-4 overflow-hidden">
                          {/* Ingredientes de la Receta */}
                          <div className="flex flex-col min-h-0 shrink-0">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Ingredientes Seleccionados ({editingIngredient.recipe?.length || 0})</Label>
                            {editingIngredient.recipe?.length > 0 ? (
                              <div className="border border-border rounded-xl divide-y divide-border/50 overflow-y-auto max-h-[160px] bg-muted/10">
                                {editingIngredient.recipe.map((item: any) => (
                                  <div key={item.ingredientId} className="flex items-center gap-3 px-3 py-2 bg-card">
                                    <button
                                      type="button"
                                      onClick={() => toggleRecipeItemForEditing({ id: item.ingredientId })}
                                      className="shrink-0 w-6 h-6 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive hover:text-white transition-colors"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                    <p className="flex-1 text-xs font-semibold truncate">{item.ingredientName}</p>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        placeholder="1"
                                        className="w-20 h-9 text-center text-xs font-bold bg-background border border-border"
                                        value={item.quantity === 0 ? "" : item.quantity}
                                        onChange={e => {
                                          const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
                                          updateRecipeQtyForEditing(item.ingredientId, isNaN(val) ? 0 : val);
                                        }}
                                      />
                                      <span className="text-[10px] font-semibold text-muted-foreground w-12 truncate">{item.unit}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="border border-dashed border-border rounded-xl p-4 text-center text-muted-foreground flex flex-col items-center justify-center py-6 bg-muted/5">
                                <ChefHat className="h-6 w-6 mb-1 text-muted-foreground/45" />
                                <p className="text-[10px] font-bold uppercase">Sin Ingredientes</p>
                                <p className="text-[9px] mt-0.5">Elige ingredientes del catálogo a continuación.</p>
                              </div>
                            )}
                          </div>

                          {/* Catálogo */}
                          <div className="flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground shrink-0">Catálogo de Insumos</Label>
                            <div className="relative shrink-0">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                              <Input
                                className="pl-8 h-9 text-xs"
                                placeholder="Buscar insumos..."
                                value={ingredientSearch}
                                onChange={e => setIngredientSearch(e.target.value)}
                              />
                            </div>
                            <div className="border border-border rounded-xl divide-y divide-border/50 overflow-y-auto flex-1 bg-muted/5">
                              {ingredients
                                ?.filter(ing =>
                                  ing.id !== editingIngredient.id &&
                                  (ing.name || "").toLowerCase().includes(ingredientSearch.toLowerCase())
                                )
                                .map(ing => {
                                  const selected = editingIngredient.recipe?.some((r: any) => r.ingredientId === ing.id);
                                  return (
                                    <button
                                      key={ing.id}
                                      type="button"
                                      onClick={() => toggleRecipeItemForEditing(ing)}
                                      className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors text-xs",
                                        selected ? "bg-primary/5" : "hover:bg-muted/30"
                                      )}
                                    >
                                      <div className={cn(
                                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all",
                                        selected ? "border-primary bg-primary text-white" : "border-border bg-background"
                                      )}>
                                        {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className={cn("font-medium truncate", selected && "font-bold text-primary")}>{ing.name}</p>
                                      </div>
                                      <Badge variant="secondary" className="text-[9px] uppercase font-bold tracking-wider">{ing.unit}</Badge>
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card className="bg-card border-border border-dashed shadow-sm flex flex-col justify-center items-center p-8 text-center h-[280px]">
                        <FlaskConical className="h-10 w-10 text-muted-foreground/30 mb-3" />
                        <h3 className="font-bold text-sm text-foreground">Insumo Directo o Simple</h3>
                        <p className="text-xs text-muted-foreground max-w-sm mt-1 leading-relaxed">
                          Este insumo se almacena directamente. No requiere receta de preparación para ser producido.
                        </p>
                      </Card>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 md:space-y-6">
              <header className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h1 className="text-2xl md:text-3xl font-headline font-bold flex items-center gap-2">
                    <Package className="h-6 w-6 text-primary" /> Inventario Global
                  </h1>
                  <p className="text-sm text-muted-foreground">Monitoreo de insumos y materia prima por sucursal.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {isAdmin && (
                    <div className="flex items-center gap-2 bg-card p-1 rounded-lg border border-border shadow-sm">
                      <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> Ver Sede:
                      </div>
                      <Select value={viewLocationId} onValueChange={setViewLocationId}>
                        <SelectTrigger className="h-9 w-[180px] border-none bg-transparent focus:ring-0 text-xs font-bold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MOCK_LOCATIONS.map(loc => (
                            <SelectItem key={loc.id} value={loc.id} className="text-xs">
                              {loc.type === 'WAREHOUSE' ? '🏠 ' : '📍 '}{loc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNewIngredient({
                        name: '',
                        unit: 'unidades',
                        category: 'General',
                        isSubInsumo: false,
                        yieldQty: 1,
                        recipe: []
                      });
                      setIsIngredientDialogOpen(true);
                    }}
                    className="gap-2 h-11 border-primary/20 hover:bg-primary/5 text-xs"
                  >
                    <Plus className="h-4 w-4" /> Maestro Insumos
                  </Button>
                  <Button onClick={() => setIsEntryDialogOpen(true)} className="gap-2 bg-primary h-11 shadow-lg shadow-primary/20 text-xs">
                    <Boxes className="h-4 w-4" /> Registrar Entrada
                  </Button>
                </div>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard
                  label="Stock Crítico"
                  value={filteredInventory?.filter(i => i.currentQuantity < 20)?.length || 0}
                  icon={AlertTriangle}
                  color="text-destructive"
                  subtext={`En ${currentLocationName}`}
                />
                <StatsCard
                  label="Insumos Activos"
                  value={ingredients?.length || 0}
                  icon={Package}
                  color="text-primary"
                  subtext="Catálogo total"
                />
                <StatsCard
                  label="Sede Actual"
                  value={currentLocationName}
                  icon={viewLocationId === 'wh-1' ? Warehouse : Store}
                  color="text-accent"
                  isText
                />
                <StatsCard
                  label="Valor Teórico"
                  value="---"
                  icon={Calculator}
                  color="text-green-400"
                  subtext="Estimado en USD"
                />
              </div>

              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre de insumo..."
                    className="pl-10 h-11 bg-card border-border text-xs"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Badge variant="outline" className="px-4 py-1.5 border-accent/20 text-accent bg-accent/5 font-semibold text-xs">
                  Visualizando: {currentLocationName}
                </Badge>
              </div>

              <Card className="bg-card shadow-2xl border-border/50 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow className="border-b border-border/50">
                        <TableHead className="py-2 text-xs">Insumo</TableHead>
                        <TableHead className="text-center text-xs">Stock Actual</TableHead>
                        <TableHead className="hidden md:table-cell text-xs">Categoría</TableHead>
                        <TableHead className="hidden lg:table-cell text-xs">Unidad</TableHead>
                        <TableHead className="text-right text-xs">Último Movimiento</TableHead>
                        <TableHead className="text-right text-xs">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!ingredients || !currentInventory ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-20">
                            <div className="flex flex-col items-center gap-2 animate-pulse">
                              <RefreshCw className="h-8 w-8 text-primary animate-spin" />
                              <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Sincronizando inventario...</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : filteredInventory?.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic text-xs">
                            No se encontraron insumos que coincidan con la búsqueda.
                          </TableCell>
                        </TableRow>
                      ) : filteredInventory?.map(item => {
                        const isLow = item.currentQuantity < 20;
                        return (
                          <TableRow key={item.id} className="hover:bg-muted/10 group transition-colors">
                            <TableCell className="py-2">
                              <div className="flex items-center gap-3">
                                <div className={cn("p-2 rounded bg-muted group-hover:bg-background transition-colors", isLow ? "text-destructive" : item.isSubInsumo ? "text-accent bg-accent/15" : "text-primary")}>
                                  {item.isSubInsumo ? <FlaskConical className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                                </div>
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold text-sm">{item.name}</p>
                                    {item.isSubInsumo && (
                                      <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-accent/30 text-accent bg-accent/5 font-bold uppercase tracking-wider">Sub-insumo</Badge>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-muted-foreground uppercase lg:hidden">{item.category}</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center gap-1">
                                <Badge variant={isLow ? "destructive" : "outline"} className={cn("font-bold px-3 text-xs", !isLow && "border-green-500/30 text-green-400 bg-green-500/5")}>
                                  {item.currentQuantity} {item.unit}
                                </Badge>
                                {isLow && <span className="text-[8px] font-bold text-destructive uppercase tracking-widest animate-pulse">Pedir Reposición</span>}
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <Badge variant="secondary" className="text-[9px] uppercase font-bold tracking-wider">{item.category}</Badge>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-xs text-muted-foreground italic">
                              {item.unit}
                            </TableCell>
                            <TableCell className="text-right text-[10px] text-muted-foreground tabular-nums">
                              {item.lastUpdate?.seconds ? new Date(item.lastUpdate.seconds * 1000).toLocaleString() : '---'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Registrar Merma o Daño"
                                  onClick={() => handleOpenWasteDialog(item)}
                                  className="h-8 w-8 text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10"
                                >
                                  <AlertTriangle className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Editar Insumo"
                                  onClick={() => {
                                    setEditingIngredient({
                                      id: item.id,
                                      name: item.name || '',
                                      unit: item.unit || 'unidades',
                                      category: item.category || 'General',
                                      isSubInsumo: item.isSubInsumo || false,
                                      yieldQty: item.yieldQty || 1,
                                      recipe: item.recipe || []
                                    });
                                    setIngredientSearch('');
                                    setEditActiveTab('general');
                                    setIsEditIngredientDialogOpen(true);
                                  }}
                                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Eliminar"
                                  onClick={() => handleDeleteIngredient(item.id)}
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </div>
          )}
        </div>
      </main>



      {/* HOJA (SHEET): ENTRADA DE STOCK */}
      <Sheet open={isEntryDialogOpen} onOpenChange={(open) => { setIsEntryDialogOpen(open); if(!open) resetEntryForm(); }}>
        <SheetContent side="right" className="w-full sm:max-w-md bg-card border-l-border p-0 flex flex-col">
          <SheetHeader className="p-3 pb-1">
            <SheetTitle className="flex items-center gap-2"><Boxes className="h-5 w-5 text-primary" /> Registrar Entrada de Mercancía</SheetTitle>
            <SheetDescription className="text-xs">Aumenta el stock disponible en una sede específica.</SheetDescription>
          </SheetHeader>
          
          <ScrollArea className="flex-1 px-3">
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Sede de Destino</Label>
                <Select value={entryLocationId} onValueChange={setEntryLocationId}>
                  <SelectTrigger className="h-12 text-xs font-bold"><SelectValue placeholder="Seleccionar sede..." /></SelectTrigger>
                  <SelectContent>
                    {MOCK_LOCATIONS.map(loc => (
                      <SelectItem key={loc.id} value={loc.id} className="text-xs">{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Insumo</Label>
                <Select value={selectedIngredientId} onValueChange={setSelectedIngredientId}>
                  <SelectTrigger className="h-12 text-xs"><SelectValue placeholder="Seleccionar insumo..." /></SelectTrigger>
                  <SelectContent>
                    {ingredients?.map(ing => (
                      <SelectItem key={ing.id} value={ing.id} className="text-xs">{ing.name} ({ing.unit})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedIngredient?.isSubInsumo && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <div className="p-3 bg-accent/5 border border-accent/15 rounded-2xl space-y-1.5">
                    <p className="text-xs font-bold text-accent flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" /> Producción Automática
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Este es un sub-insumo. Al registrar la entrada, el sistema descontará automáticamente del stock los ingredientes requeridos según su receta.
                    </p>
                  </div>

                  {MOCK_LOCATIONS.find(l => l.id === entryLocationId)?.type !== 'WAREHOUSE' && (
                    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl flex gap-3 text-destructive animate-in shake duration-300">
                      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                      <p className="text-xs font-semibold leading-relaxed">
                        No se puede registrar. La preparación/producción de sub-insumos solo está permitida en ubicaciones de tipo Depósito (Warehouse).
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-2xl border border-primary/10">
                <div className="space-y-0.5">
                  <Label className="text-sm font-bold">Cálculo por Bultos / Cajas</Label>
                  <p className="text-xs text-muted-foreground italic">Facilita el ingreso masivo.</p>
                </div>
                <Switch checked={entryMode === "BULTOS"} onCheckedChange={(checked) => setEntryMode(checked ? "BULTOS" : "UNIDADES")} />
              </div>

              {entryMode === "BULTOS" ? (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-right-1">
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase">Cant. Bultos</Label>
                    <Input type="number" placeholder="Ej: 5" className="h-12" value={bultosCount} onChange={(e) => setBultosCount(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase">{unitLabel} por Bulto</Label>
                    <Input type="number" placeholder="Ej: 24" className="h-12" value={unitsPerBulto} onChange={(e) => setUnitsPerBulto(e.target.value)} />
                  </div>
                </div>
              ) : (
                <div className="space-y-2 animate-in fade-in slide-in-from-right-1">
                  <Label className="text-[10px] uppercase">{unitLabel} Totales</Label>
                  <Input type="number" placeholder="Ej: 120" className="h-12" value={directUnits} onChange={(e) => setDirectUnits(e.target.value)} />
                </div>
              )}

              {(bultosCount && unitsPerBulto && entryMode === "BULTOS") && (
                <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-center space-y-1.5">
                  <span className="text-xs font-bold text-primary uppercase tracking-widest">Total a Sumar</span>
                  <p className="text-3xl font-headline font-bold text-primary">{parseFloat(bultosCount) * parseFloat(unitsPerBulto)} {selectedIngredient?.unit || 'unidades'}</p>
                </div>
              )}

              <div className="flex flex-row gap-3 pt-4 border-t border-border mt-2">
                <Button variant="ghost" className="flex-1 h-12" onClick={() => setIsEntryDialogOpen(false)}>Cancelar</Button>
                <Button className="flex-1 h-12 shadow-lg shadow-primary/20" onClick={handleStockEntry} disabled={!selectedIngredientId || !entryLocationId || isInvalidSubInsumoLocation}>
                  Confirmar
                </Button>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* DIALOGO: REGISTRAR MERMA / AJUSTE DE STOCK */}
      <Dialog open={isWasteDialogOpen} onOpenChange={setIsWasteDialogOpen}>
        <DialogContent className="max-w-md bg-card border-border shadow-2xl w-[92vw] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <AlertTriangle className="h-5 w-5 text-amber-400" /> Registrar Merma / Pérdida
            </DialogTitle>
            <DialogDescription className="text-xs">
              Descuenta stock por producto dañado, vencido o ajuste físico en <strong>{currentLocationName}</strong>.
            </DialogDescription>
          </DialogHeader>

          {wasteItem && (
            <div className="py-3 space-y-4">
              <div className="p-3 bg-muted/20 rounded-xl border border-border flex justify-between items-center">
                <div>
                  <p className="font-bold text-sm">{wasteItem.name}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">{wasteItem.category} • {wasteItem.unit}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Stock Actual</span>
                  <p className="text-sm font-bold text-primary">{wasteItem.currentQuantity} {wasteItem.unit}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Motivo de la Pérdida</Label>
                <Select value={wasteReason} onValueChange={(val) => setWasteReason(val as WasteReason)}>
                  <SelectTrigger className="h-11 bg-background text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAMAGE" className="text-xs">💔 Producto Dañado / Caído</SelectItem>
                    <SelectItem value="EXPIRATION" className="text-xs">⌛ Vencido / Descompuesto</SelectItem>
                    <SelectItem value="COOKING_MISTAKE" className="text-xs">🍳 Error en Cocina / Quemado</SelectItem>
                    <SelectItem value="COUNT_ADJUSTMENT" className="text-xs">⚖️ Ajuste por Conteo Físico</SelectItem>
                    <SelectItem value="OTHER" className="text-xs">📝 Otro Motivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                    Cantidad a Descontar ({wasteItem.unit})
                  </Label>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Máx: {wasteItem.currentQuantity} {wasteItem.unit}
                  </span>
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  max={wasteItem.currentQuantity}
                  min="0.01"
                  step="any"
                  placeholder={`Máximo ${wasteItem.currentQuantity}`}
                  className={cn(
                    "h-11 font-bold text-base bg-background",
                    (parseFloat(wasteQuantity || "0") > (wasteItem.currentQuantity || 0)) && "border-destructive focus-visible:ring-destructive text-destructive"
                  )}
                  value={wasteQuantity}
                  onChange={(e) => setWasteQuantity(e.target.value)}
                />
              </div>

              {/* Mensaje de validación en vivo */}
              {(wasteItem.currentQuantity || 0) <= 0 ? (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Este insumo no tiene existencias en {currentLocationName} (Stock: 0).</span>
                </div>
              ) : parseFloat(wasteQuantity || "0") > (wasteItem.currentQuantity || 0) ? (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>No puedes reportar más de {wasteItem.currentQuantity} {wasteItem.unit} existentes.</span>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Notas / Explicación (Opcional)</Label>
                <Textarea
                  placeholder="Ej. Pan aplastado durante el traslado matutino..."
                  className="text-xs resize-none h-20 bg-background"
                  value={wasteNotes}
                  onChange={(e) => setWasteNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" className="h-11 text-xs" onClick={() => setIsWasteDialogOpen(false)} disabled={isSavingWaste}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveWaste}
              disabled={
                isSavingWaste || 
                !wasteQuantity || 
                parseFloat(wasteQuantity) <= 0 || 
                (wasteItem && (wasteItem.currentQuantity || 0) <= 0) ||
                (wasteItem && parseFloat(wasteQuantity) > (wasteItem.currentQuantity || 0))
              }
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground h-11 text-xs font-bold shadow-lg"
            >
              {isSavingWaste ? 'Registrando...' : 'Descontar Merma'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatsCard({ label, value, icon: Icon, color, subtext, isText = false }: any) {
  return (
    <Card className="bg-card border-border/50 shadow-lg hover:border-primary/20 transition-all group overflow-hidden relative">
      <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
        <Icon className="h-12 w-12" />
      </div>
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Icon className={cn("h-3 w-3", color)} /> {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1">
        <div className="flex flex-col">
          <p className={cn(
            "font-headline font-bold tracking-tight truncate",
            isText ? "text-xl" : "text-3xl",
            color
          )}>
            {value}
          </p>
          {subtext && <p className="text-[9px] text-muted-foreground font-medium mt-1">{subtext}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function RefreshCw(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}
