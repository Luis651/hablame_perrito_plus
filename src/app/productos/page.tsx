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
import {
  Plus, Pencil, Trash2, Search, Package, Sparkles,
  X, Info, ShoppingBasket, ChevronLeft, ChevronRight
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn, round2, formatUSD } from '@/lib/utils';

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

type DialogTab = 'general' | 'recipe' | 'combo';

export default function ProductosPage() {
  const firestore = useFirestore();
  const { role } = useUser();

  const productsQuery = useMemoFirebase(() => collection(firestore, 'products'), [firestore]);
  const { data: products, isLoading } = useCollection(productsQuery);

  const ingredientsQuery = useMemoFirebase(() => collection(firestore, 'ingredients'), [firestore]);
  const { data: ingredients } = useCollection(ingredientsQuery);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [recipeFilterType, setRecipeFilterType] = useState<'all' | 'subinsumos' | 'base'>('all');
  const [activeTab, setActiveTab] = useState<DialogTab>('general');

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
        masterPriceUSD: round2(product.masterPriceUSD || 0),
        sku: product.sku || '',
        isCombo: product.isCombo || false,
        comboItems: product.comboItems || [],
        recipe: product.recipe || []
      });
    } else {
      setEditingProduct(null);
      setFormData({ name: '', description: '', masterPriceUSD: 0, sku: '', isCombo: false, comboItems: [], recipe: [] });
    }
    setActiveTab('general');
    setIngredientSearch('');
    setIsDialogOpen(true);
  };

  const handleClose = () => {
    setIsDialogOpen(false);
    setEditingProduct(null);
  };

  const handleSave = () => {
    if (!formData.name || formData.masterPriceUSD <= 0) return;
    const cleanData = {
      ...formData,
      masterPriceUSD: round2(formData.masterPriceUSD)
    };
    if (editingProduct) {
      updateDocumentNonBlocking(doc(firestore, 'products', editingProduct.id), cleanData);
    } else {
      addDocumentNonBlocking(collection(firestore, 'products'), cleanData);
    }
    handleClose();
  };

  const handleDelete = (id: string) => {
    if (confirm("¿Eliminar este producto?")) {
      deleteDocumentNonBlocking(doc(firestore, 'products', id));
    }
  };

  const toggleRecipeItem = (ing: any) => {
    const exists = formData.recipe.find(i => i.ingredientId === ing.id);
    if (exists) {
      setFormData(prev => ({ ...prev, recipe: prev.recipe.filter(i => i.ingredientId !== ing.id) }));
    } else {
      setFormData(prev => ({ ...prev, recipe: [...prev.recipe, { ingredientId: ing.id, ingredientName: ing.name, quantity: 1 }] }));
    }
  };

  const updateRecipeQty = (ingredientId: string, qty: number) => {
    setFormData(prev => ({
      ...prev,
      recipe: prev.recipe.map(i => i.ingredientId === ingredientId ? { ...i, quantity: qty } : i)
    }));
  };

  const toggleComboItem = (product: any) => {
    const exists = formData.comboItems.find(i => i.productId === product.id);
    if (exists) {
      setFormData(prev => ({ ...prev, comboItems: prev.comboItems.filter(i => i.productId !== product.id) }));
    } else {
      setFormData(prev => ({ ...prev, comboItems: [...prev.comboItems, { productId: product.id, productName: product.name, quantity: 1 }] }));
    }
  };

  const filteredProducts = products?.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const tabs: { id: DialogTab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'recipe', label: `Receta (${formData.recipe.length})` },
    ...(formData.isCombo ? [{ id: 'combo' as DialogTab, label: `Combo (${formData.comboItems.length})` }] : []),
  ];

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <AppSidebar role={role} />

      {/* MAIN PAGE */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-4 pt-16 pb-4 lg:pt-6 border-b border-border bg-card">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShoppingBasket className="h-6 w-6 text-primary shrink-0" />
              <div>
                <h1 className="text-lg font-bold leading-tight">Catálogo Maestro</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">Productos, combos y fichas técnicas</p>
              </div>
            </div>
            <Button
              onClick={() => handleOpenDialog()}
              size="sm"
              className="gap-1.5 shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nuevo</span>
              <span className="sm:hidden">+</span>
            </Button>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              className="pl-9 h-10 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-y-auto pb-20 lg:pb-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Package className="h-8 w-8 animate-pulse" />
              <p className="text-xs font-medium">Cargando...</p>
            </div>
          ) : filteredProducts?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Package className="h-8 w-8 opacity-30" />
              <p className="text-xs">No se encontraron productos</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredProducts?.map((product) => (
                <div key={product.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 active:bg-muted/50 transition-colors">
                  <div className={cn(
                    "p-2 rounded-lg shrink-0",
                    product.isCombo ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"
                  )}>
                    {product.isCombo ? <Sparkles className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{product.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-bold text-primary">${product.masterPriceUSD?.toFixed(2)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {product.isCombo
                          ? `${product.comboItems?.length || 0} items`
                          : `${product.recipe?.length || 0} insumos`}
                      </span>
                      {product.sku && (
                        <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">{product.sku}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleOpenDialog(product)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* DIALOG — Full screen sheet on mobile */}
      {isDialogOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          {/* Dialog Header */}
          <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
            <button
              onClick={handleClose}
              className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 flex-1">
              <div className={cn(
                "p-1.5 rounded-lg",
                formData.isCombo ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"
              )}>
                {formData.isCombo ? <Sparkles className="h-4 w-4" /> : <Package className="h-4 w-4" />}
              </div>
              <h2 className="font-bold text-base">
                {editingProduct ? 'Editar' : 'Nuevo'} {formData.isCombo ? 'Combo' : 'Producto'}
              </h2>
            </div>
            <Button
              onClick={handleSave}
              size="sm"
              disabled={!formData.name || formData.masterPriceUSD <= 0}
              className="shrink-0"
            >
              Guardar
            </Button>
          </div>

          {/* Tab Bar */}
          <div className="shrink-0 flex border-b border-border bg-card overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 min-w-[80px] py-3 text-xs font-bold uppercase tracking-wide transition-colors border-b-2 whitespace-nowrap px-2",
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content — scrollable */}
          <div className="flex-1 overflow-y-auto">

            {/* GENERAL TAB */}
            {activeTab === 'general' && (
              <div className="p-4 space-y-4 pb-20">
                {/* Combo toggle */}
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border">
                  <div>
                    <p className="font-semibold text-sm">¿Es un Combo?</p>
                    <p className="text-xs text-muted-foreground">Agrupa varios productos</p>
                  </div>
                  <Switch
                    checked={formData.isCombo}
                    onCheckedChange={(checked) => {
                      setFormData(prev => ({ ...prev, isCombo: checked }));
                      if (checked) setActiveTab('combo');
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Nombre *</Label>
                  <Input
                    className="h-12"
                    placeholder="Ej: Hamburguesa clásica"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Precio (USD) *</Label>
                  <Input
                    className="h-12 font-bold text-lg"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.masterPriceUSD || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, masterPriceUSD: parseFloat(e.target.value) || 0 }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">SKU</Label>
                    <Input
                      className="h-12 font-mono"
                      placeholder="HP-001"
                      value={formData.sku}
                      onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Descripción</Label>
                    <Input
                      className="h-12"
                      placeholder="Opcional"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab('recipe')}
                  className="w-full flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-2xl text-primary hover:bg-primary/10 transition-colors"
                >
                  <span className="text-sm font-bold">Ir a Receta →</span>
                  <span className="text-xs bg-primary/10 px-2 py-1 rounded-full">{formData.recipe.length} insumos</span>
                </button>
              </div>
            )}

            {/* RECIPE TAB */}
            {activeTab === 'recipe' && (
              <div className="flex flex-col h-full">
                {/* Selected items at top */}
                {formData.recipe.length > 0 && (
                  <div className="shrink-0 border-b border-border bg-muted/10">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground px-4 pt-3 pb-1">Receta actual</p>
                    <div className="divide-y divide-border/50">
                      {formData.recipe.map(item => (
                        <div key={item.ingredientId} className="flex items-center gap-3 px-4 py-2">
                          <p className="flex-1 text-sm font-medium truncate">{item.ingredientName}</p>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              inputMode="decimal"
                              className="h-8 w-20 text-sm text-center font-bold"
                              value={item.quantity}
                              onChange={(e) => updateRecipeQty(item.ingredientId, parseFloat(e.target.value) || 0)}
                            />
                            <span className="text-xs text-muted-foreground w-8">
                              {ingredients?.find(i => i.id === item.ingredientId)?.unit}
                            </span>
                            <button
                              onClick={() => toggleRecipeItem({ id: item.ingredientId })}
                              className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Search and Filters */}
                <div className="shrink-0 p-3 border-b border-border space-y-2 bg-muted/5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9 h-10 text-sm"
                      placeholder="Buscar insumo o preparado..."
                      value={ingredientSearch}
                      onChange={(e) => setIngredientSearch(e.target.value)}
                    />
                  </div>

                  {/* Filter Pills */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    <button
                      type="button"
                      onClick={() => setRecipeFilterType('all')}
                      className={cn(
                        "px-2.5 py-1 text-xs font-bold rounded-lg transition-colors shrink-0",
                        recipeFilterType === 'all' ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Todos ({ingredients?.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipeFilterType('subinsumos')}
                      className={cn(
                        "px-2.5 py-1 text-xs font-bold rounded-lg transition-colors shrink-0 flex items-center gap-1",
                        recipeFilterType === 'subinsumos' ? "bg-accent text-accent-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      🥘 Sub-insumos ({ingredients?.filter(i => i.isSubInsumo).length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipeFilterType('base')}
                      className={cn(
                        "px-2.5 py-1 text-xs font-bold rounded-lg transition-colors shrink-0 flex items-center gap-1",
                        recipeFilterType === 'base' ? "bg-muted text-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      📦 Insumos Base ({ingredients?.filter(i => !i.isSubInsumo).length || 0})
                    </button>
                  </div>
                </div>

                {/* Ingredient catalog */}
                <div className="flex-1 overflow-y-auto divide-y divide-border/50 pb-20">
                  {ingredients
                    ?.filter(i => {
                      const matchesSearch = (i.name || "").toLowerCase().includes(ingredientSearch.toLowerCase());
                      if (!matchesSearch) return false;
                      if (recipeFilterType === 'subinsumos') return !!i.isSubInsumo;
                      if (recipeFilterType === 'base') return !i.isSubInsumo;
                      return true;
                    })
                    .map(ing => {
                      const isAdded = !!formData.recipe.find(r => r.ingredientId === ing.id);
                      return (
                        <button
                          key={ing.id}
                          onClick={() => toggleRecipeItem(ing)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors active:opacity-70",
                            isAdded ? "bg-primary/10" : "hover:bg-muted/30"
                          )}
                        >
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                            isAdded ? "border-primary bg-primary" : "border-border"
                          )}>
                            {isAdded && <div className="w-2 h-2 bg-white rounded-full" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={cn("text-sm font-medium truncate", isAdded && "text-primary font-bold")}>{ing.name}</p>
                              {ing.isSubInsumo ? (
                                <Badge className="bg-accent/15 text-accent border-accent/30 text-[9px] px-1.5 py-0">Sub-insumo</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground">Insumo Base</Badge>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground uppercase mt-0.5">{ing.unit} {ing.category ? `• ${ing.category}` : ''}</p>
                          </div>
                          {isAdded && <span className="text-[10px] font-bold text-primary shrink-0">✓ En Receta</span>}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* COMBO TAB */}
            {activeTab === 'combo' && (
              <div className="flex flex-col h-full">
                {formData.comboItems.length > 0 && (
                  <div className="shrink-0 border-b border-border bg-muted/10">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground px-4 pt-3 pb-1">Items del combo</p>
                    <div className="divide-y divide-border/50">
                      {formData.comboItems.map(item => (
                        <div key={item.productId} className="flex items-center gap-3 px-4 py-2">
                          <p className="flex-1 text-sm font-medium truncate">{item.productName}</p>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              inputMode="numeric"
                              className="h-8 w-16 text-sm text-center font-bold"
                              value={item.quantity}
                              onChange={(e) => {
                                const qty = parseInt(e.target.value) || 1;
                                setFormData(prev => ({
                                  ...prev,
                                  comboItems: prev.comboItems.map(i =>
                                    i.productId === item.productId ? { ...i, quantity: qty } : i
                                  )
                                }));
                              }}
                            />
                            <span className="text-xs text-muted-foreground">und</span>
                            <button
                              onClick={() => toggleComboItem({ id: item.productId })}
                              className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="shrink-0 p-3 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9 h-10"
                      placeholder="Buscar producto..."
                      value={ingredientSearch}
                      onChange={(e) => setIngredientSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-border/50 pb-20">
                  {products
                    ?.filter(p => !p.isCombo && p.name.toLowerCase().includes(ingredientSearch.toLowerCase()))
                    .map(p => {
                      const isAdded = !!formData.comboItems.find(i => i.productId === p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => toggleComboItem(p)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors active:opacity-70",
                            isAdded ? "bg-accent/10" : "hover:bg-muted/30"
                          )}
                        >
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                            isAdded ? "border-accent bg-accent" : "border-border"
                          )}>
                            {isAdded && <div className="w-2 h-2 bg-white rounded-full" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm font-medium truncate", isAdded && "text-accent font-bold")}>{p.name}</p>
                            <p className="text-[10px] text-muted-foreground">${p.masterPriceUSD?.toFixed(2)}</p>
                          </div>
                          {isAdded && <span className="text-[10px] font-bold text-accent">✓ Añadido</span>}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
