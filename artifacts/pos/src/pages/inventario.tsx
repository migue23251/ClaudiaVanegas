import { useState } from "react";
import { useListProducts, getListProductsQueryKey, useCreateProduct, useUpdateProduct, useDeleteProduct, ProductInput, Product } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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
  { value: "accesorios",label: "Accesorios" },
] as const;

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

export default function Inventario() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [page, setPage] = useState(1);

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

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleCategory = (v: string) => { setCategory(v); setPage(1); };

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const codeVal = (formData.get("code") as string).trim();
    const data: ProductInput = {
      code: codeVal || undefined as any, // API auto-generates if blank
      name: formData.get("name") as string,
      description: formData.get("description") as string || undefined,
      category: formData.get("category") as CategoryValue,
      costPrice: Number(formData.get("costPrice")),
      salePrice: Number(formData.get("salePrice")),
      stock: Number(formData.get("stock")),
      images: (formData.get("images") as string).split(",").map(s => s.trim()).filter(Boolean)
    };

    if (editingProduct) {
      updateProd.mutate({ id: editingProduct.id, data }, {
        onSuccess: () => {
          toast({ title: "Producto actualizado" });
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          setIsDialogOpen(false);
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
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : paginated.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No se encontraron productos</TableCell></TableRow>
            ) : (
              paginated.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-xs">{product.code}</TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{catLabel(product.category)}</Badge></TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatCurrency(product.costPrice)}</TableCell>
                  <TableCell className="text-right font-serif font-bold">{formatCurrency(product.salePrice)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={product.stock <= 5 ? "destructive" : "outline"}>{product.stock}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Código
                  {!editingProduct && <span className="text-xs text-muted-foreground ml-1">(se genera automáticamente)</span>}
                </label>
                <Input name="code" defaultValue={editingProduct?.code} placeholder={editingProduct ? "" : "Dejar en blanco para auto-generar"} />
              </div>
              <div className="space-y-2">
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
                <label className="text-sm font-medium">Stock</label>
                <Input name="stock" type="number" min="0" defaultValue={editingProduct?.stock || 0} required />
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
              <Button type="submit" disabled={createProd.isPending || updateProd.isPending}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
