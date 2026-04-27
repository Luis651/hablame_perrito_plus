
"use client";

import { useState, useMemo } from 'react';
import { AppSidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  ChevronRight
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
  setDocumentNonBlocking
} from '@/firebase';
import { collection, doc, serverTimestamp, query, where } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { MOCK_LOCATIONS } from '@/lib/mock-data';

export default function InventarioPage() {
  const firestore = useFirestore();
  const { user, profile, role } = useUser();
  const { toast } = useToast();
  
  // Estado para la sede que estamos visualizando
  const [viewLocationId, setViewLocationId] = useState(profile?.locationId || "br-1");
  const isAdmin = role === 'ADMIN';

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
  const [searchTerm, setSearchTerm] = useState("");
  
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [entryMode, setEntryMode] = useState<"BULTOS" | "UNIDADES">("BULTOS");
  const [bultosCount, setBultosCount] = useState("");
  const [unitsPerBulto, setUnitsPerBulto] = useState("");
  const [directUnits, setDirectUnits] = useState("");
  const [entryLocationId, setEntryLocationId] = useState(viewLocationId);

  const [newIngredient, setNewIngredient] = useState({ name: '', unit: 'unidades', category: 'General' });

  const handleSaveIngredient = () => {
    if (!newIngredient.name) return;
    const ingredientsRef = collection(firestore, 'ingredients');
    const newDoc = doc(ingredientsRef);
    setDocumentNonBlocking(newDoc, { ...newIngredient, id: newDoc.id }, { merge: true });
    setIsIngredientDialogOpen(false);
    setNewIngredient({ name: '', unit: 'unidades', category: 'General' });
    toast({ title: "Insumo creado maestro" });
  };

  const handleStockEntry = () => {
    if (!selectedIngredientId || !entryLocationId) return;

    let totalToAdd = 0;
    if (entryMode === "BULTOS") {
      const b = parseFloat(bultosCount);
      const u = parseFloat(unitsPerBulto);
      if (isNaN(b) || isNaN(u)) return;
      totalToAdd = b * u;
    } else {
      totalToAdd = parseFloat(directUnits);
      if (isNaN(totalToAdd)) return;
    }

    // Nota: Para obtener el stock actual de la sede de entrada si no es la que estamos viendo
    // en una app real haríamos un getDoc, aquí simplificaremos asumiendo la entrada.
    const currentItem = currentInventory?.find(i => i.ingredientId === selectedIngredientId);
    const currentQty = (entryLocationId === viewLocationId) ? (currentItem?.quantity || 0) : 0;
    
    const inventoryRef = doc(firestore, 'locations', entryLocationId, 'inventory', selectedIngredientId);
    setDocumentNonBlocking(inventoryRef, {
      id: selectedIngredientId,
      ingredientId: selectedIngredientId,
      locationId: entryLocationId,
      quantity: currentQty + totalToAdd,
      lastUpdatedAt: serverTimestamp()
    }, { merge: true });

    setIsEntryDialogOpen(false);
    resetEntryForm();
    toast({ title: "Stock actualizado", description: `Ingreso procesado en ${MOCK_LOCATIONS.find(l => l.id === entryLocationId)?.name}` });
  };

  const resetEntryForm = () => {
    setSelectedIngredientId("");
    setEntryMode("BULTOS");
    setBultosCount("");
    setUnitsPerBulto("");
    setDirectUnits("");
  };

  const filteredInventory = ingredients?.filter(ing => 
    ing.name.toLowerCase().includes(searchTerm.toLowerCase())
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
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar role={role} />
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-16 lg:pt-8">
        <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h1 className="text-3xl md:text-4xl font-headline font-bold flex items-center gap-3">
                <Package className="h-8 w-8 text-primary" /> Inventario Global
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
              <Button variant="outline" onClick={() => setIsIngredientDialogOpen(true)} className="gap-2 h-11 border-primary/20 hover:bg-primary/5">
                <Plus className="h-4 w-4" /> Maestro Insumos
              </Button>
              <Button onClick={() => setIsEntryDialogOpen(true)} className="gap-2 bg-primary h-11 shadow-lg shadow-primary/20">
                <Boxes className="h-4 w-4" /> Registrar Entrada
              </Button>
            </div>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard 
              label="Stock Crítico" 
              value={filteredInventory?.filter(i => i.currentQuantity < 20).length || 0} 
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
                className="pl-10 h-11 bg-card border-border"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Badge variant="outline" className="px-4 py-1.5 border-accent/20 text-accent bg-accent/5">
              Visualizando: {currentLocationName}
            </Badge>
          </div>

          <Card className="bg-card shadow-2xl border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="border-b border-border/50">
                    <TableHead className="py-4">Insumo</TableHead>
                    <TableHead className="text-center">Stock Actual</TableHead>
                    <TableHead className="hidden md:table-cell">Categoría</TableHead>
                    <TableHead className="hidden lg:table-cell">Unidad</TableHead>
                    <TableHead className="text-right">Último Movimiento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!ingredients || !currentInventory ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-20">
                        <div className="flex flex-col items-center gap-2 animate-pulse">
                          <RefreshCw className="h-8 w-8 text-primary animate-spin" />
                          <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest">Sincronizando inventario...</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredInventory?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-20 text-muted-foreground italic">
                        No se encontraron insumos que coincidan con la búsqueda.
                      </TableCell>
                    </TableRow>
                  ) : filteredInventory?.map(item => {
                    const isLow = item.currentQuantity < 20;
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/10 group transition-colors">
                        <TableCell className="py-4">
                          <div className="flex items-center gap-3">
                            <div className={cn("p-2 rounded bg-muted group-hover:bg-background transition-colors", isLow ? "text-destructive" : "text-primary")}>
                              <Package className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col">
                              <p className="font-bold text-sm">{item.name}</p>
                              <span className="text-[10px] text-muted-foreground uppercase lg:hidden">{item.category}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Badge variant={isLow ? "destructive" : "outline"} className={cn("font-bold px-3", !isLow && "border-green-500/30 text-green-400 bg-green-500/5")}>
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </main>

      {/* DIALOGO: MAESTRO DE INSUMOS */}
      <Dialog open={isIngredientDialogOpen} onOpenChange={setIsIngredientDialogOpen}>
        <DialogContent className="max-w-md bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5 text-primary" /> Definir Nuevo Insumo</DialogTitle>
            <DialogDescription>Añade un elemento al catálogo maestro de la empresa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-muted-foreground">Nombre del Insumo</Label>
              <Input placeholder="Ej: Pan de Hamburguesa" value={newIngredient.name} onChange={(e) => setNewIngredient({...newIngredient, name: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Unidad</Label>
                <Select value={newIngredient.unit} onValueChange={(v) => setNewIngredient({...newIngredient, unit: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unidades">Unidades</SelectItem>
                    <SelectItem value="kg">Kilogramos (kg)</SelectItem>
                    <SelectItem value="litros">Litros (L)</SelectItem>
                    <SelectItem value="paquetes">Paquetes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Categoría</Label>
                <Input placeholder="Ej: Panadería" value={newIngredient.category} onChange={(e) => setNewIngredient({...newIngredient, category: e.target.value})} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsIngredientDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveIngredient} disabled={!newIngredient.name}>Crear Insumo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOGO: ENTRADA DE STOCK */}
      <Dialog open={isEntryDialogOpen} onOpenChange={(open) => { setIsEntryDialogOpen(open); if(!open) resetEntryForm(); }}>
        <DialogContent className="max-w-md w-[95%] rounded-xl bg-card border border-border shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Boxes className="h-5 w-5 text-primary" /> Registrar Entrada de Mercancía</DialogTitle>
            <DialogDescription>Aumenta el stock disponible en una sede específica.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Sede de Destino</Label>
              <Select value={entryLocationId} onValueChange={setEntryLocationId}>
                <SelectTrigger className="h-10 text-xs font-bold"><SelectValue placeholder="Seleccionar sede..." /></SelectTrigger>
                <SelectContent>
                  {MOCK_LOCATIONS.map(loc => (
                    <SelectItem key={loc.id} value={loc.id} className="text-xs">{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Insumo</Label>
              <Select value={selectedIngredientId} onValueChange={setSelectedIngredientId}>
                <SelectTrigger className="h-10 text-xs"><SelectValue placeholder="Seleccionar insumo..." /></SelectTrigger>
                <SelectContent>
                  {ingredients?.map(ing => (
                    <SelectItem key={ing.id} value={ing.id} className="text-xs">{ing.name} ({ing.unit})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between p-3 bg-primary/5 rounded-xl border border-primary/10">
              <div className="space-y-0.5">
                <Label className="text-xs font-bold">Cálculo por Bultos / Cajas</Label>
                <p className="text-[9px] text-muted-foreground italic">Facilita el ingreso masivo.</p>
              </div>
              <Switch checked={entryMode === "BULTOS"} onCheckedChange={(checked) => setEntryMode(checked ? "BULTOS" : "UNIDADES")} />
            </div>

            {entryMode === "BULTOS" ? (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase">Cant. Bultos</Label>
                  <Input type="number" placeholder="Ej: 5" value={bultosCount} onChange={(e) => setBultosCount(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase">Und. por Bulto</Label>
                  <Input type="number" placeholder="Ej: 24" value={unitsPerBulto} onChange={(e) => setUnitsPerBulto(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
                <Label className="text-[10px] uppercase">Unidades Totales</Label>
                <Input type="number" placeholder="Ej: 120" value={directUnits} onChange={(e) => setDirectUnits(e.target.value)} />
              </div>
            )}

            {(bultosCount && unitsPerBulto && entryMode === "BULTOS") && (
              <div className="p-4 bg-primary/10 rounded-xl border border-primary/20 text-center space-y-1">
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Total a Sumar</span>
                <p className="text-2xl font-headline font-bold text-primary">{parseFloat(bultosCount) * parseFloat(unitsPerBulto)} unidades</p>
              </div>
            )}
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setIsEntryDialogOpen(false)}>Cancelar</Button>
            <Button className="flex-1 shadow-lg shadow-primary/20" onClick={handleStockEntry} disabled={!selectedIngredientId || !entryLocationId}>
              Confirmar Ingreso
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
