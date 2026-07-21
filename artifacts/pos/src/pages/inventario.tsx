import { useState } from "react";
import {
  useListProducts, getListProductsQueryKey, useCreateProduct, useUpdateProduct, useDeleteProduct,
  useSetProductVisibility,
  useGetProductMovements, getGetProductMovementsQueryKey,
  useCreateProductVariant, useUpdateProductVariant, useDeleteProductVariant,
  ProductInput, Product, ProductVariant,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Edit, Trash2, History, Eye, EyeOff, Layers, Pencil } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const PAGE_SIZE = 15;

const CATEGORIES = [
  { value: "blusas",    label: "Blusas" },
  { value: "jeans",     label: "Jeans" },
  { value: "vestidos",  label: "Vestidos" },
  { value: "conjuntos", label: "Conjuntos" },
  { value: "faldas",    label: "Faldas" },
  { value: "chaquetas", label: "Chaquetas" },
  { value: "zapatos",   label: "Zapatos" },
  { value: "bolsos",    label: "Bolsos" },
  { value: "accesorios","label": "Accesorios" },
] as const;

const VARIANT_COLORS = [
  "blanco","negro","gris","beige","crema","rojo","rosa","fucsia","naranja",
  "amarillo","verde","azul","morado","vinotinto","café","multicolor",
] as const;

const VARIANT_SIZES = [
  "XS","S","M","L","XL","XXL",
  "34","35","36","37","38","39","40","41","42",
  "6","8","10","12","14","16","Única",
] as const;

const COLOR_HEX: Record<string, string> = {
  blanco: "#FFFFFF", negro: "#111111", gris: "#9CA3AF", beige: "#D4B896", crema: "#FFF8E7",
  rojo: "#EF4444", rosa: "#F9A8D4", fucsia: "#EC4899", naranja: "#F97316", amarillo: "#FACC15",
  verde: "#22C55E", azul: "#3B82F6", morado: "#A855F7", vinotinto: "#7F1D1D", café: "#78350F",
  multicolor: "#E879F9",
};

type CategoryValue = typeof CATEGORIES[number]["value"];

function Pagination({ total, page, onChange }: { total: number; page: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-4 border-t">
      <p className="text-sm text-muted-foreground">
        Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onChange(page - 1)}>Anterior</Button>
        <span className="text-sm font-medium">{page} / {pages}</span>
        <Button variant="outline" size="sm" disabled={page === pages} onClick={() => onChange(page + 1)}>Siguiente</Button>
      </div>
    </div>
  );
}

// ── Variant row component ─────────────────────────────────────────────────────

const NO_SIZE_CATEGORIES = ["bolsos", "accesorios"] as const;

interface VariantRowProps {
  variant: ProductVariant;
  productId: number;
  category: string;
  onUpdated: () => void;
}

function VariantRow({ variant, productId, category, onUpdated }: VariantRowProps) {
  const { toast } = useToast();
  const showSize = !NO_SIZE_CATEGORIES.includes(category as any);
  const [editing, setEditing] = useState(false);
  const [editStock, setEditStock] = useState(String(variant.stock));
  const [editColor, setEditColor] = useState(variant.color);
  const [editSize, setEditSize] = useState(variant.size ?? "");

  const updateVariant = useUpdateProductVariant();
  const deleteVariant = useDeleteProductVariant();

  const handleSave = () => {
    updateVariant.mutate({
      id: productId,
      variantId: variant.id,
      data: { stock: parseInt(editStock, 10), color: editColor, size: showSize ? editSize : null },
    }, {
      onSuccess: () => { setEditing(false); onUpdated(); },
      onError: () => toast({ title: "Error actualizando variante", variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (!confirm("¿Eliminar esta variante?")) return;
    deleteVariant.mutate({ id: productId, variantId: variant.id }, {
      onSuccess: () => onUpdated(),
      onError: () => toast({ title: "Error eliminando variante", variant: "destructive" }),
    });
  };

  return (
    <div className="flex items-center gap-2 p-2.5 border rounded-lg bg-background text-sm">
      <span className="w-4 h-4 rounded-full border shrink-0" style={{ background: COLOR_HEX[variant.color] ?? "#ccc" }} />
      {editing ? (
        <>
          <Select value={editColor} onValueChange={setEditColor}>
            <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VARIANT_COLORS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          {showSize && (
            <Select value={editSize} onValueChange={setEditSize}>
              <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VARIANT_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Input
            type="number" min="0"
            value={editStock}
            onChange={e => setEditStock(e.target.value)}
            className="h-7 w-16 text-xs"
          />
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={updateVariant.isPending}>Guardar</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancelar</Button>
        </>
      ) : (
        <>
          <span className="capitalize font-medium w-20">{variant.color}</span>
          {showSize && <span className="text-muted-foreground w-12">{variant.size ?? "—"}</span>}
          <span className="font-mono text-xs text-muted-foreground flex-1">{variant.sku}</span>
          <Badge variant={variant.stock <= 5 ? "destructive" : "outline"} className="text-xs">
            ×{variant.stock}
          </Badge>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={handleDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </>
      )}
    </div>
  );
}

// ── Add Variant Form ──────────────────────────────────────────────────────────

function AddVariantForm({ productId, category, onAdded }: { productId: number; category: string; onAdded: () => void }) {
  const { toast } = useToast();
  const showSize = !NO_SIZE_CATEGORIES.includes(category as any);
  const [color, setColor] = useState<string>("");
  const [size, setSize] = useState<string>("");
  const [stock, setStock] = useState("0");
  const createVariant = useCreateProductVariant();

  const handleAdd = () => {
    if (!color || (showSize && !size)) {
      toast({ title: showSize ? "Selecciona color y talla" : "Selecciona un color", variant: "destructive" });
      return;
    }
    createVariant.mutate({
      id: productId,
      data: { color, size: showSize ? size : undefined, stock: parseInt(stock, 10) },
    }, {
      onSuccess: () => { setColor(""); setSize(""); setStock("0"); onAdded(); },
      onError: (err: any) => toast({ title: "Error agregando variante", description: err?.response?.data?.error, variant: "destructive" }),
    });
  };

  return (
    <div className="flex items-end gap-2 p-3 bg-muted/30 rounded-lg border border-dashed">
      <div className="space-y-1 flex-1">
        <label className="text-xs font-medium">Color</label>
        <Select value={color} onValueChange={setColor}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Color..." /></SelectTrigger>
          <SelectContent>
            {VARIANT_COLORS.map(c => (
              <SelectItem key={c} value={c}>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border" style={{ background: COLOR_HEX[c] ?? "#ccc" }} />
                  <span className="capitalize">{c}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showSize && (
        <div className="space-y-1 w-24">
          <label className="text-xs font-medium">Talla</label>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Talla..." /></SelectTrigger>
            <SelectContent>
              {VARIANT_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1 w-16">
        <label className="text-xs font-medium">Stock</label>
        <Input type="number" min="0" value={stock} onChange={e => setStock(e.target.value)} className="h-8 text-xs" />
      </div>
      <Button size="sm" className="h-8 gap-1 shrink-0" onClick={handleAdd} disabled={createVariant.isPending}>
        <Plus className="h-3.5 w-3.5" /> Agregar
      </Button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Inventario() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [page, setPage] = useState(1);
  const [movementsProduct, setMovementsProduct] = useState<Product | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryParams = {
    search: search || undefined,
    category: category !== "all" ? category as any : undefined
  };

  const { data: products, isLoading } = useListProducts(
    queryParams,
    { query: { queryKey: getListProductsQueryKey(queryParams) } }
  );

  const createProd = useCreateProduct();
  const updateProd = useUpdateProduct();
  const deleteProd = useDeleteProduct();
  const setVisibility = useSetProductVisibility();

  const { data: movements, isLoading: movementsLoading } = useGetProductMovements(movementsProduct?.id!, {
    query: { enabled: !!movementsProduct, queryKey: getGetProductMovementsQueryKey(movementsProduct?.id!) },
  });

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleCategory = (v: string) => { setCategory(v); setPage(1); };

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const hasVariants = (editingProduct?.variants?.length ?? 0) > 0;
    const data: ProductInput = {
      name: formData.get("name") as string,
      description: formData.get("description") as string || undefined,
      category: formData.get("category") as CategoryValue,
      costPrice: Number(formData.get("costPrice")),
      salePrice: Number(formData.get("salePrice")),
      stock: hasVariants ? editingProduct!.stock : Number(formData.get("stock")),
      images: (formData.get("images") as string).split(",").map(s => s.trim()).filter(Boolean)
    };

    if (editingProduct) {
      updateProd.mutate({ id: editingProduct.id, data }, {
        onSuccess: (updated) => {
          toast({ title: "Producto actualizado" });
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          setEditingProduct(updated);
        }
      });
    } else {
      createProd.mutate({ data }, {
        onSuccess: () => {
          toast({ title: "Producto creado" });
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          setIsDialogOpen(false);
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("¿Estás seguro de eliminar este producto?")) {
      deleteProd.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Producto eliminado" });
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        }
      });
    }
  };

  const openEdit = (prod: Product) => { setEditingProduct(prod); setIsDialogOpen(true); };
  const openCreate = () => { setEditingProduct(null); setIsDialogOpen(true); };

  const handleToggleVisibility = (product: Product) => {
    setVisibility.mutate({ id: product.id, data: { isVisible: !product.isVisible } }, {
      onSuccess: () => {
        toast({ title: product.isVisible ? "Producto oculto del catálogo" : "Producto visible en el catálogo" });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      }
    });
  };

  const refreshProduct = () => {
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
    // Also refresh the editing product's variants by re-fetching product list
  };

  const paginated = (products ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const catLabel = (val: string) => CATEGORIES.find(c => c.value === val)?.label ?? val;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">Inventario</h1>
          <p className="text-muted-foreground mt-1">Gestión de productos y existencias</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo Producto
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código o nombre..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-52">
          <Select value={category} onValueChange={handleCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Venta</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-center">Variantes</TableHead>
              <TableHead className="text-center">Catálogo</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : paginated.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No se encontraron productos</TableCell></TableRow>
            ) : (
              paginated.map((product) => (
                <TableRow key={product.id} className={!product.isVisible ? "opacity-60" : undefined}>
                  <TableCell className="font-mono text-xs">{product.code}</TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{catLabel(product.category)}</Badge></TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatCurrency(product.costPrice)}</TableCell>
                  <TableCell className="text-right font-serif font-bold">{formatCurrency(product.salePrice)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={product.stock <= 5 ? "destructive" : "outline"}>{product.stock}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {product.variants && product.variants.length > 0 ? (
                      <div className="flex items-center justify-center gap-0.5">
                        {product.variants.slice(0, 5).map(v => (
                          <span key={v.id} className="w-3 h-3 rounded-full border border-border shrink-0" style={{ background: COLOR_HEX[v.color] ?? "#ccc" }} title={`${v.color} / ${v.size}: ×${v.stock}`} />
                        ))}
                        {product.variants.length > 5 && <span className="text-xs text-muted-foreground ml-0.5">+{product.variants.length - 5}</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={product.isVisible ? "Visible en el catálogo — clic para ocultar" : "Oculto del catálogo — clic para mostrar"}
                      disabled={setVisibility.isPending}
                      onClick={() => handleToggleVisibility(product)}
                    >
                      {product.isVisible ? (
                        <Eye className="h-4 w-4 text-primary" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" title="Historial de movimientos" onClick={() => setMovementsProduct(product)}>
                      <History className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(product)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(product.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {!isLoading && (products?.length ?? 0) > PAGE_SIZE && (
          <div className="px-4 pb-4">
            <Pagination total={products?.length ?? 0} page={page} onChange={setPage} />
          </div>
        )}
      </div>

      {/* Product dialog — create / edit */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingProduct(null); }}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="info" className="pt-1">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info">Información</TabsTrigger>
              <TabsTrigger value="variants" disabled={!editingProduct}>
                <Layers className="h-3.5 w-3.5 mr-1.5" />
                Variantes {editingProduct && editingProduct.variants && editingProduct.variants.length > 0 ? `(${editingProduct.variants.length})` : ""}
              </TabsTrigger>
            </TabsList>

            {/* ── Info tab ──────────────────────────────────────────────────── */}
            <TabsContent value="info">
              <form onSubmit={handleSave} className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  {editingProduct && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Código
                        <span className="text-xs text-muted-foreground ml-1">(no se puede modificar)</span>
                      </label>
                      <Input value={editingProduct.code} disabled readOnly />
                    </div>
                  )}
                  <div className="space-y-2 col-span-2 sm:col-span-1">
                    <label className="text-sm font-medium">Nombre</label>
                    <Input name="name" defaultValue={editingProduct?.name} required />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Descripción</label>
                  <Input name="description" defaultValue={editingProduct?.description || ""} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Categoría</label>
                    <Select name="category" defaultValue={editingProduct?.category || "blusas"}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Stock
                      {editingProduct && editingProduct.variants && editingProduct.variants.length > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">(calculado de variantes)</span>
                      )}
                    </label>
                    <Input
                      name="stock"
                      type="number"
                      min="0"
                      defaultValue={editingProduct?.stock || 0}
                      readOnly={!!(editingProduct && editingProduct.variants && editingProduct.variants.length > 0)}
                      className={editingProduct && editingProduct.variants && editingProduct.variants.length > 0 ? "bg-muted" : ""}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Precio de Costo</label>
                    <Input name="costPrice" type="number" min="0" defaultValue={editingProduct?.costPrice} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Precio de Venta</label>
                    <Input name="salePrice" type="number" min="0" defaultValue={editingProduct?.salePrice} required />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">URLs de Imágenes (separadas por coma)</label>
                  <Input name="images" defaultValue={editingProduct?.images?.join(", ") || ""} placeholder="https://..." />
                </div>

                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={createProd.isPending || updateProd.isPending}>
                    {editingProduct ? "Guardar cambios" : "Crear producto"}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            {/* ── Variants tab ───────────────────────────────────────────────── */}
            <TabsContent value="variants">
              {editingProduct && (
                <div className="py-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Cada variante tiene su propio stock. El stock total del producto es la suma de todas las variantes.
                  </p>

                  {(!editingProduct.variants || editingProduct.variants.length === 0) && (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      Sin variantes. Agrega la primera variante abajo.
                    </div>
                  )}

                  <div className="space-y-2">
                    {editingProduct.variants?.map(v => (
                      <VariantRow
                        key={v.id}
                        variant={v}
                        productId={editingProduct.id}
                        category={editingProduct.category}
                        onUpdated={() => {
                          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }).then(() => {
                            const queries = queryClient.getQueriesData<Product[]>({ queryKey: getListProductsQueryKey() });
                            for (const [, data] of queries) {
                              const found = data?.find(p => p.id === editingProduct.id);
                              if (found) { setEditingProduct(found); break; }
                            }
                          });
                        }}
                      />
                    ))}
                  </div>

                  <AddVariantForm
                    productId={editingProduct.id}
                    category={editingProduct.category}
                    onAdded={() => {
                      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }).then(() => {
                        const queries = queryClient.getQueriesData<Product[]>({ queryKey: getListProductsQueryKey() });
                        for (const [, data] of queries) {
                          const found = data?.find(p => p.id === editingProduct.id);
                          if (found) { setEditingProduct(found); break; }
                        }
                      });
                    }}
                  />

                  <DialogFooter className="pt-2">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cerrar</Button>
                  </DialogFooter>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Movements dialog */}
      <Dialog open={!!movementsProduct} onOpenChange={(open) => !open && setMovementsProduct(null)}>
        <DialogContent className="sm:max-w-[650px]">
          <DialogHeader>
            <DialogTitle>Historial de Movimientos — {movementsProduct?.name}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="incoming" className="pt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="incoming">Entradas</TabsTrigger>
              <TabsTrigger value="outgoing">Salidas</TabsTrigger>
            </TabsList>
            <TabsContent value="incoming">
              {movementsLoading ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Cargando...</p>
              ) : !movements?.incoming.length ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Sin entradas registradas</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">Costo Unit.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.incoming.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm">{format(new Date(m.date), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{m.supplierName}</TableCell>
                        <TableCell className="text-right">{m.qtyReceived}/{m.qtyOrdered}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(m.unitCost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
            <TabsContent value="outgoing">
              {movementsLoading ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Cargando...</p>
              ) : !movements?.outgoing.length ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Sin salidas registradas</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">Precio Venta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.outgoing.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm">{format(new Date(m.date), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{m.customerName}</TableCell>
                        <TableCell className="text-right">{m.qty}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(m.unitPrice)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
