import { useState } from "react";
import {
  useListProducts, getListProductsQueryKey, useCreateProduct, useUpdateProduct, useDeleteProduct,
  useSetProductVisibility,
  useGetProductMovements, getGetProductMovementsQueryKey,
  useCreateProductVariant, useUpdateProductVariant, useDeleteProductVariant,
  useCreateInventoryEntry,
  useListSuppliers,
  getProduct,
  ProductInput, Product, ProductVariant,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Edit, Trash2, History, Eye, EyeOff, Layers, Pencil, PackagePlus } from "lucide-react";
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

/** Categorías donde la talla se oculta completamente */
const HIDE_SIZE_CATEGORIES = ["bolsos"] as const;
/** Categorías donde la talla se muestra pero es opcional */
const OPTIONAL_SIZE_CATEGORIES = ["accesorios"] as const;

interface VariantRowProps {
  variant: ProductVariant;
  productId: number;
  category: string;
  onUpdated: () => void;
}

function VariantRow({ variant, productId, category, onUpdated }: VariantRowProps) {
  const { toast } = useToast();
  const showSize = !HIDE_SIZE_CATEGORIES.includes(category as any);
  const sizeOptional = OPTIONAL_SIZE_CATEGORIES.includes(category as any);
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
      data: { stock: parseInt(editStock, 10), color: editColor, size: showSize ? (editSize || null) : null },
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
              <SelectTrigger className="h-7 text-xs w-20"><SelectValue placeholder="Talla..." /></SelectTrigger>
              <SelectContent>
                {sizeOptional && <SelectItem value="">Sin talla</SelectItem>}
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
          {showSize && <span className="text-muted-foreground w-12">{variant.size || "—"}</span>}
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
  const showSize = !HIDE_SIZE_CATEGORIES.includes(category as any);
  const sizeOptional = OPTIONAL_SIZE_CATEGORIES.includes(category as any);
  const sizeRequired = showSize && !sizeOptional;
  const [color, setColor] = useState<string>("");
  const [size, setSize] = useState<string>("");
  const [stock, setStock] = useState("0");
  const createVariant = useCreateProductVariant();

  const handleAdd = () => {
    if (!color || (sizeRequired && !size)) {
      toast({ title: sizeRequired ? "Selecciona color y talla" : "Selecciona un color", variant: "destructive" });
      return;
    }
    createVariant.mutate({
      id: productId,
      data: { color, size: showSize ? (size || null) : undefined, stock: parseInt(stock, 10) },
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
          <label className="text-xs font-medium">Talla{sizeOptional && <span className="text-muted-foreground"> (opcional)</span>}</label>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Talla..." /></SelectTrigger>
            <SelectContent>
              {sizeOptional && <SelectItem value="">Sin talla</SelectItem>}
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

// ── Receive Merchandise Modal (multi-row) ────────────────────────────────────

interface EntryRow {
  _key: string;
  productId: string;
  variantId: string;
  supplierId: string;
  qty: string;
  unitCost: string;
}

const mkRow = (): EntryRow => ({
  _key: Math.random().toString(36).slice(2),
  productId: "", variantId: "", supplierId: "", qty: "1", unitCost: "",
});

const fmtCOP = (v: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);

function ReceiveMerchandiseModal({
  products,
  open,
  onOpenChange,
  onSuccess,
}: {
  products: Product[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<EntryRow[]>([mkRow()]);
  const { data: suppliers } = useListSuppliers();
  const createEntry = useCreateInventoryEntry();

  // Reset rows when modal opens
  const handleOpenChange = (o: boolean) => {
    if (!o) setRows([mkRow()]);
    onOpenChange(o);
  };

  const updateRow = (key: string, patch: Partial<EntryRow>) =>
    setRows(prev => prev.map(r => r._key === key ? { ...r, ...patch } : r));

  const setProduct = (key: string, productId: string) => {
    const prod = products.find(p => String(p.id) === productId);
    updateRow(key, {
      productId,
      variantId: "",
      unitCost: prod ? String(prod.costPrice) : "",
    });
  };

  const addRow = () => setRows(prev => [...prev, mkRow()]);
  const removeRow = (key: string) =>
    setRows(prev => prev.length === 1 ? prev : prev.filter(r => r._key !== key));

  const grandTotal = rows.reduce((sum, r) => {
    const q = Number(r.qty) || 0;
    const c = Number(r.unitCost) || 0;
    return sum + q * c;
  }, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const n = i + 1;
      if (!r.productId) {
        toast({ title: `Fila ${n}: selecciona un producto`, variant: "destructive" }); return;
      }
      const prod = products.find(p => String(p.id) === r.productId);
      if (prod && (prod.variants?.length ?? 0) > 0 && !r.variantId) {
        toast({ title: `Fila ${n}: selecciona una variante`, variant: "destructive" }); return;
      }
      if (!r.qty || Number(r.qty) < 1) {
        toast({ title: `Fila ${n}: cantidad inválida`, variant: "destructive" }); return;
      }
      if (!r.unitCost || Number(r.unitCost) <= 0) {
        toast({ title: `Fila ${n}: costo inválido`, variant: "destructive" }); return;
      }
    }

    createEntry.mutate({
      data: {
        entries: rows.map(r => ({
          productId: Number(r.productId),
          variantId: r.variantId ? Number(r.variantId) : undefined,
          supplierId: r.supplierId ? Number(r.supplierId) : undefined,
          qty: Number(r.qty),
          unitCost: Number(r.unitCost),
        })),
      } as any,
    }, {
      onSuccess: () => {
        const n = rows.length;
        toast({ title: `${n} ${n === 1 ? "producto ingresado" : "productos ingresados"} al inventario` });
        setRows([mkRow()]);
        onOpenChange(false);
        onSuccess();
      },
      onError: (err: any) => {
        toast({
          title: "Error al ingresar mercancía",
          description: err?.response?.data?.error ?? "Error desconocido",
          variant: "destructive",
        });
      },
    });
  };

  const supplierList = suppliers ?? [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" />
            Recibir Mercancía
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Agrega uno o varios productos. Cada fila puede tener su propio proveedor.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          {/* Scrollable rows */}
          <div className="overflow-y-auto flex-1 space-y-3 pr-1 py-2">
            {rows.map((row, idx) => {
              const prod = products.find(p => String(p.id) === row.productId) ?? null;
              const variants = prod?.variants ?? [];
              const hasVariants = variants.length > 0;
              const rowTotal = (Number(row.qty) || 0) * (Number(row.unitCost) || 0);

              return (
                <div key={row._key} className="rounded-lg border bg-card p-3 space-y-2.5 relative group">
                  {/* Row number + delete */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Ítem {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeRow(row._key)}
                      disabled={rows.length === 1}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Line 1: product + variant */}
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      <Select value={row.productId} onValueChange={v => setProduct(row._key, v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Producto..." />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map(p => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              <span className="font-mono text-xs text-muted-foreground mr-1.5">{p.code}</span>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {hasVariants && (
                      <div className="w-44 shrink-0">
                        <Select value={row.variantId} onValueChange={v => updateRow(row._key, { variantId: v })}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Variante..." />
                          </SelectTrigger>
                          <SelectContent>
                            {variants.map(v => (
                              <SelectItem key={v.id} value={String(v.id)}>
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 rounded-full border shrink-0" style={{ background: COLOR_HEX[v.color] ?? "#ccc" }} />
                                  <span className="capitalize text-sm">{v.color}</span>
                                  {v.size && <span className="text-muted-foreground text-xs">/ {v.size}</span>}
                                  <span className="font-mono text-xs text-muted-foreground ml-0.5">×{v.stock}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Line 2: supplier + qty + unit cost + row total */}
                  <div className="flex gap-2 items-center">
                    {/* Supplier */}
                    <div className="flex-1 min-w-0">
                      <Select value={row.supplierId} onValueChange={v => updateRow(row._key, { supplierId: v })}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Sin proveedor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Sin proveedor</SelectItem>
                          {supplierList.map(s => (
                            <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Qty */}
                    <div className="w-20 shrink-0">
                      <Input
                        type="number" min="1" placeholder="Cant."
                        className="h-9 text-center"
                        value={row.qty}
                        onChange={e => updateRow(row._key, { qty: e.target.value })}
                      />
                    </div>

                    {/* Unit cost */}
                    <div className="w-32 shrink-0">
                      <Input
                        type="number" min="0" step="1" placeholder="Costo unit."
                        className="h-9"
                        value={row.unitCost}
                        onChange={e => updateRow(row._key, { unitCost: e.target.value })}
                      />
                    </div>

                    {/* Row total */}
                    <div className="w-28 shrink-0 text-right">
                      {rowTotal > 0
                        ? <span className="font-mono text-sm font-medium">{fmtCOP(rowTotal)}</span>
                        : <span className="text-muted-foreground text-sm">—</span>
                      }
                    </div>
                  </div>

                  {/* Prev cost hint */}
                  {prod && (
                    <p className="text-xs text-muted-foreground">
                      Costo anterior: <span className="font-medium">{fmtCOP(prod.costPrice)}</span>
                    </p>
                  )}
                </div>
              );
            })}

            {/* Add row button */}
            <button
              type="button"
              onClick={addRow}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
            >
              <Plus className="h-4 w-4" />
              Agregar producto
            </button>
          </div>

          {/* Footer: grand total + actions */}
          <div className="shrink-0 pt-3 mt-1 border-t space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-muted-foreground">
                {rows.length} {rows.length === 1 ? "producto" : "productos"} · Total del ingreso
              </span>
              <span className="font-serif font-bold text-xl">{fmtCOP(grandTotal)}</span>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={createEntry.isPending} className="gap-2">
                <PackagePlus className="h-4 w-4" />
                {createEntry.isPending ? "Ingresando..." : "Ingresar mercancía"}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);

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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsReceiveModalOpen(true)} className="gap-2">
            <PackagePlus className="h-4 w-4" /> Recibir Mercancía
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Nuevo Producto
          </Button>
        </div>
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
                        onUpdated={async () => {
                          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
                          const fresh = await getProduct(editingProduct.id);
                          setEditingProduct(fresh);
                        }}
                      />
                    ))}
                  </div>

                  <AddVariantForm
                    productId={editingProduct.id}
                    category={editingProduct.category}
                    onAdded={async () => {
                      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
                      const fresh = await getProduct(editingProduct.id);
                      setEditingProduct(fresh);
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

      {/* Receive Merchandise Modal */}
      <ReceiveMerchandiseModal
        products={products ?? []}
        open={isReceiveModalOpen}
        onOpenChange={setIsReceiveModalOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() })}
      />
    </div>
  );
}
