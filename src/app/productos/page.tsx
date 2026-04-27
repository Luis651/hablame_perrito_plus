"use client";

import { useState } from 'react';
import { AppSidebar } from '@/components/layout/Sidebar';
import { 
  useCollection, 
  useFirestore, 
  useMemoFirebase, 
  addDocumentNonBlocking, 
  updateDocumentNonBlocking, 
  deleteDocumentNonBlocking, 
  useUser 
} from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Search, Package, Sparkles, X, Info, Scale } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ComboItem {
  productId: string;
  productName: string;
  quantity: number;
}

interface RecipeItem {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
}

export default function ProductosPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  
  const productsQuery = useMemoFirebase(() => collection(firestore, 'products'), [firestore]);
  const { data: products, isLoading } = useCollection(productsQuery);
  
  const ingredientsQuery = useMemoFirebase(() => collection(firestore, 'ingredients'), [firestore]);
  const { data: ingredients } = useCollection(ingredientsQuery);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [comboSearch, setComboSearch] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    masterPriceUSD: 0,
    sku: '',
    isCombo: false,
    comboItems: [] as ComboItem[],
    recipe: [] as RecipeItem[]
  });

  const handleOpenDialog = (product: any = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description || '',
        masterPriceUSD: product.masterPriceUSD,
        sku: product.sku || '',
        isCombo: product.isCombo || false,
        comboItems: product.comboItems || [],
        recipe: product.recipe || []
      });
    } else {
      setEditingProduct(null);
      setFormData({ name: '', description: '', masterPriceUSD: 0, sku: '', isCombo: false, comboItems: [], recipe: [] });
    }
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.name || formData.masterPriceUSD <= 0) return;

    if (editingProduct) {
      const productRef = doc(firestore, 'products', editingProduct.id);
      updateDocumentNonBlocking(productRef, formData);
    } else {
      const productsRef = collection(firestore, 'products');
      addDocumentNonBlocking(productsRef, formData);
    }
    setIsDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm("¿Estás seguro de eliminar este producto?")) {
      const productRef = doc(firestore, 'products', id);
      deleteDocumentNonBlocking(productRef);
    }
  };

  const toggleComboItem = (product: any) => {
    const exists = formData.comboItems.find(i => i.productId === product.id);
    if (exists) {
      setFormData({
        ...formData,
        comboItems: formData.comboItems.filter(i => i.productId !== product.id)
      });
    } else {
      setFormData({
        ...formData,
        comboItems: [...formData.comboItems, { productId: product.id, productName: product.name, quantity: 1 }]
      });
    }
  };

  const toggleRecipeItem = (ing: any) => {
    const exists = formData.recipe.find(i => i.ingredientId === ing.id);
    if (exists) {
      setFormData({
        ...formData,
        recipe: formData.recipe.filter(i => i.ingredientId !== ing.id)
      });
    } else {
      setFormData({
        ...formData,
        recipe: [...formData.recipe, { ingredientId: ing.id, ingredientName: ing.name, quantity: 1 }]
      });
    }
  };

  const updateRecipeQty = (ingredientId: string, qty: number) => {
    setFormData({
      ...formData,
      recipe: formData.recipe.map(i => 
        i.ingredientId === ingredientId ? { ...i, quantity: qty } : i
      )
    });
  };

  const filteredProducts = products?.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar role="ADMIN" />
      
      <main className="flex-1 overflow-y-auto bg-background p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-headline font-bold text-foreground">Catálogo Maestro</h1>
              <p className="text-muted-foreground">Administra productos, combos y sus fichas técnicas.</p>
            </div>
            <Button onClick={() => handleOpenDialog()} className="gap-2 shadow-lg h-12 px-6 bg-primary hover:bg-primary/90">
              <Plus className="h-5 w-5" /> Nuevo Registro
            </Button>
          </header>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nombre o SKU..." 
              className="pl-10 bg-card/50 h-12" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Card className="border-border bg-card shadow-xl overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-[400px]">Producto / Combo</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Precio (USD)</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!user || isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground animate-pulse">Cargando catálogo...</TableCell>
                    </TableRow>
                  ) : filteredProducts?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No se encontraron registros.</TableCell>
                    </TableRow>
                  ) : (
                    filteredProducts?.map((product) => (
                      <TableRow key={product.id} className="hover:bg-muted/20">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={cn("p-2 rounded-lg", product.isCombo ? "bg-accent/10" : "bg-primary/10")}>
                              {product.isCombo ? <Sparkles className="h-4 w-4 text-accent" /> : <Package className="h-4 w-4 text-primary" />}
                            </div>
                            <div>
                              <p className="font-bold text-foreground">{product.name}</p>
                              {product.isCombo ? (
                                <p className="text-[10px] text-accent uppercase font-bold tracking-widest">
                                  {product.comboItems?.length || 0} productos incluidos
                                </p>
                              ) : (
                                <p className="text-xs text-muted-foreground line-clamp-1">
                                  {product.recipe?.length || 0} insumos en receta
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-code text-xs text-muted-foreground">{product.sku || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant={product.isCombo ? "outline" : "secondary"} className={product.isCombo ? "border-accent text-accent" : ""}>
                            {product.isCombo ? 'COMBO' : 'SIMPLE'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold text-lg text-primary">${product.masterPriceUSD.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="hover:text-primary" onClick={() => handleOpenDialog(product)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="hover:text-destructive" onClick={() => handleDelete(product.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 overflow-hidden bg-card border-border shadow-2xl">
          <div className="p-6 border-b border-border bg-muted/20">
            <DialogTitle className="text-2xl font-headline font-bold flex items-center gap-2">
              {editingProduct ? 'Editar' : 'Nuevo'} {formData.isCombo ? 'Combo' : 'Producto'}
              {formData.isCombo && <Sparkles className="h-5 w-5 text-accent" />}
            </DialogTitle>
            <DialogDescription>Configura los detalles comerciales y la ficha técnica.</DialogDescription>
          </div>

          <div className="flex-1 flex overflow-hidden">
            <div className="w-1/3 p-6 space-y-4 border-r border-border overflow-y-auto">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <div className="space-y-0.5">
                  <Label className="text-sm font-bold">¿Es un Combo?</Label>
                  <p className="text-[10px] text-muted-foreground">Agrupa varios productos finales.</p>
                </div>
                <Switch 
                  checked={formData.isCombo} 
                  onCheckedChange={(checked) => setFormData({...formData, isCombo: checked})} 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nombre Comercial</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Precio Final (USD)</Label>
                  <Input id="price" type="number" step="0.01" value={formData.masterPriceUSD} onChange={(e) => setFormData({...formData, masterPriceUSD: parseFloat(e.target.value)})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU / Código</Label>
                  <Input id="sku" value={formData.sku} onChange={(e) => setFormData({...formData, sku: e.target.value})} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="desc">Descripción</Label>
                <Input id="desc" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />
              </div>
            </div>

            <div className="flex-1 bg-muted/5">
              <Tabs defaultValue={formData.isCombo ? "combo" : "recipe"} className="h-full flex flex-col">
                <div className="px-6 border-b border-border">
                  <TabsList className="bg-transparent gap-6 h-12">
                    <TabsTrigger value="recipe" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 gap-2">
                      <Scale className="h-4 w-4" /> Receta (Insumos)
                    </TabsTrigger>
                    {formData.isCombo && (
                      <TabsTrigger value="combo" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none px-0 gap-2">
                        <Sparkles className="h-4 w-4" /> Composición Combo
                      </TabsTrigger>
                    )}
                  </TabsList>
                </div>

                <TabsContent value="recipe" className="flex-1 p-6 flex flex-col gap-4 overflow-hidden">
                  <div className="flex-1 flex gap-6 overflow-hidden">
                    <div className="flex-1 flex flex-col space-y-4">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <Input placeholder="Buscar insumo..." className="pl-8 h-8 text-xs" value={recipeSearch} onChange={(e) => setRecipeSearch(e.target.value)}/>
                      </div>
                      <ScrollArea className="flex-1 pr-4 border rounded-md">
                        <div className="p-2 space-y-1">
                          {ingredients?.filter(i => i.name.toLowerCase().includes(recipeSearch.toLowerCase())).map(ing => {
                            const isAdded = formData.recipe.find(r => r.ingredientId === ing.id);
                            return (
                              <button key={ing.id} onClick={() => toggleRecipeItem(ing)} className={cn("w-full flex items-center justify-between p-2 rounded text-xs transition-colors", isAdded ? "bg-primary/10 border-primary/20 border" : "hover:bg-muted")}>
                                <span>{ing.name} ({ing.unit})</span>
                                {isAdded ? <X className="h-3 w-3 text-destructive" /> : <Plus className="h-3 w-3 text-primary" />}
                              </button>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>

                    <div className="flex-1 flex flex-col space-y-4">
                      <h4 className="text-xs font-bold uppercase text-muted-foreground">Insumos en Receta</h4>
                      <ScrollArea className="flex-1 pr-4">
                        <div className="space-y-2">
                          {formData.recipe.map(item => (
                            <div key={item.ingredientId} className="p-3 bg-card border border-border rounded-lg space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-bold">{item.ingredientName}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => toggleRecipeItem({id: item.ingredientId})}><X className="h-3 w-3" /></Button>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input 
                                  type="number" 
                                  className="h-8 w-24 text-xs" 
                                  value={item.quantity} 
                                  onChange={(e) => updateRecipeQty(item.ingredientId, parseFloat(e.target.value))}
                                />
                                <span className="text-[10px] text-muted-foreground uppercase">{ingredients?.find(i => i.id === item.ingredientId)?.unit}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="combo" className="flex-1 p-6 flex flex-col gap-4 overflow-hidden">
                  <div className="flex-1 flex gap-6 overflow-hidden">
                    <div className="flex-1 flex flex-col space-y-4">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <Input placeholder="Buscar productos para el combo..." className="pl-8 h-8 text-xs" value={comboSearch} onChange={(e) => setComboSearch(e.target.value)}/>
                      </div>
                      <ScrollArea className="flex-1 pr-4 border rounded-md">
                        <div className="p-2 space-y-1">
                          {products?.filter(p => !p.isCombo && p.name.toLowerCase().includes(comboSearch.toLowerCase())).map(p => {
                            const isAdded = formData.comboItems.find(r => r.productId === p.id);
                            return (
                              <button key={p.id} onClick={() => toggleComboItem(p)} className={cn("w-full flex items-center justify-between p-2 rounded text-xs transition-colors", isAdded ? "bg-accent/10 border-accent/20 border" : "hover:bg-muted")}>
                                <span>{p.name}</span>
                                {isAdded ? <X className="h-3 w-3 text-destructive" /> : <Plus className="h-3 w-3 text-accent" />}
                              </button>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>

                    <div className="flex-1 flex flex-col space-y-4">
                      <h4 className="text-xs font-bold uppercase text-accent">Composición del Combo</h4>
                      <ScrollArea className="flex-1 pr-4">
                        <div className="space-y-2">
                          {formData.comboItems.map(item => (
                            <div key={item.productId} className="p-3 bg-card border border-border rounded-lg flex items-center justify-between">
                              <span className="text-sm font-bold">{item.productName}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground uppercase">Cant:</span>
                                <Input 
                                  type="number" 
                                  className="h-8 w-16 text-xs" 
                                  value={item.quantity} 
                                  onChange={(e) => {
                                    setFormData({
                                      ...formData,
                                      comboItems: formData.comboItems.map(i => i.productId === item.productId ? {...i, quantity: parseInt(e.target.value)} : i)
                                    });
                                  }}
                                />
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => toggleComboItem({id: item.productId})}><X className="h-3 w-3" /></Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <DialogFooter className="bg-muted/10 p-6 border-t border-border">
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="gap-2 shadow-lg" disabled={!formData.name || formData.masterPriceUSD <= 0}>
              <Plus className="h-4 w-4" /> {editingProduct ? 'Actualizar' : 'Guardar'} Registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
