import { useState } from "react";
import { 
  useListPurchaseOrders, getListPurchaseOrdersQueryKey, 
  useCreatePurchaseOrder,
  useUpdatePurchaseOrder,
  useListSuppliers, getListSuppliersQueryKey,
  useListProducts, getListProductsQueryKey,
  useReceivePurchaseOrder,
  PurchaseOrderInput
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, PackageCheck, Search, Pencil, Ban, Eye } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const PAGE_SIZE = 15;

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

interface LineItem {
  productId: number;
  qty: number;
  unitCost: number;
}

export default function OrdenesCompra() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<any>(null);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [page, setPage] = useState(1);

  // Multi-item form state
  const [lineItems, setLineItems] = useState<LineItem[]>([{ productId: 0, qty: 1, unitCost: 0 }]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryParams = {
    status: statusFilter !== "all" ? statusFilter as any : undefined,
    supplierSearch: supplierSearch || undefined,
  };
  const { data: orders, isLoading } = useListPurchaseOrders(queryParams as any, {
    query: { queryKey: [...getListPurchaseOrdersQueryKey(queryParams as any), supplierSearch] }
  });

  const { data: suppliers } = useListSuppliers({ query: { queryKey: getListSuppliersQueryKey() } });
  const { data: products } = useListProducts(undefined, { query: { queryKey: getListProductsQueryKey() } });

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="border-amber-500 text-amber-600">Pendiente</Badge>;
      case 'partial': return <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 border-none">Parcial</Badge>;
      case 'received': return <Badge variant="outline" className="border-emerald-500 text-emerald-600">Recibido</Badge>;
      case 'cancelled': return <Badge variant="destructive">Cancelado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendiente';
      case 'partial': return 'Parcial';
      case 'received': return 'Recibido';
      case 'cancelled': return 'Cancelado';
      default: return status;
    }
  };

  const createOrder = useCreatePurchaseOrder();
  const receiveOrder = useReceivePurchaseOrder();
  const updateOrder = useUpdatePurchaseOrder();

  const addLineItem = () => setLineItems(prev => [...prev, { productId: 0, qty: 1, unitCost: 0 }]);
  const removeLineItem = (idx: number) => setLineItems(prev => prev.filter((_, i) => i !== idx));
  const updateLineItem = (idx: number, field: keyof LineItem, val: number) => {
    setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  };

  const orderTotal = lineItems.reduce((sum, i) => sum + (i.qty * i.unitCost), 0);

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if (!selectedSupplierId) {
      toast({ title: "Seleccione un proveedor", variant: "destructive" });
      return;
    }
    const validItems = lineItems.filter(i => i.productId > 0 && i.qty > 0 && i.unitCost > 0);
    if (!validItems.length) {
      toast({ title: "Agregue al menos un producto", variant: "destructive" });
      return;
    }

    const data: PurchaseOrderInput = {
      supplierId: Number(selectedSupplierId),
      guideNumber: (formData.get("guideNumber") as string) || undefined,
      paymentType: formData.get("paymentType") as "contado" | "credito",
      notes: formData.get("notes") as string || undefined,
      items: validItems.map(i => ({ productId: i.productId, qtyOrdered: i.qty, unitCost: i.unitCost }))
    };

    createOrder.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Orden de compra creada" });
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        setIsCreateOpen(false);
        setLineItems([{ productId: 0, qty: 1, unitCost: 0 }]);
        setSelectedSupplierId("");
      }
    });
  };

  const openEdit = (order: any) => {
    setEditingOrder(order);
    setSelectedSupplierId(order.supplierId.toString());
    setLineItems(order.items.map((i: any) => ({ productId: i.productId, qty: i.qtyOrdered, unitCost: i.unitCost })));
    setIsEditOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if (!selectedSupplierId) {
      toast({ title: "Seleccione un proveedor", variant: "destructive" });
      return;
    }
    const validItems = lineItems.filter(i => i.productId > 0 && i.qty > 0 && i.unitCost > 0);
    if (!validItems.length) {
      toast({ title: "Agregue al menos un producto", variant: "destructive" });
      return;
    }

    updateOrder.mutate({
      id: editingOrder.id,
      data: {
        supplierId: Number(selectedSupplierId),
        guideNumber: (formData.get("guideNumber") as string) || undefined,
        paymentType: formData.get("paymentType") as "contado" | "credito",
        notes: formData.get("notes") as string || undefined,
        items: validItems.map(i => ({ productId: i.productId, qtyOrdered: i.qty, unitCost: i.unitCost })),
      },
    }, {
      onSuccess: () => {
        toast({ title: "Orden de compra actualizada" });
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        queryClient.invalidateQueries({
          predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/accounts-payable"),
        });
        setIsEditOpen(false);
        setEditingOrder(null);
        setLineItems([{ productId: 0, qty: 1, unitCost: 0 }]);
        setSelectedSupplierId("");
      },
      onError: (err: any) => {
        toast({ title: "No se pudo actualizar la orden", description: err?.response?.data?.error ?? "Intenta de nuevo", variant: "destructive" });
      },
    });
  };

  const handleCancelOrder = (order: any) => {
    if (!confirm(`¿Anular la orden de compra "${order.guideNumber || order.id}"? Esta acción no se puede deshacer.`)) return;
    updateOrder.mutate({ id: order.id, data: { status: "cancelled" } }, {
      onSuccess: () => {
        toast({ title: "Orden de compra anulada" });
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        queryClient.invalidateQueries({
          predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/accounts-payable"),
        });
      },
      onError: (err: any) => {
        toast({ title: "No se pudo anular la orden", description: err?.response?.data?.error ?? "Intenta de nuevo", variant: "destructive" });
      },
    });
  };

  const handleReceiveSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const items = selectedOrder.items.map((item: any) => {
      const rec = Number(formData.get(`qty_${item.id}`) || 0);
      const salePriceVal = formData.get(`salePrice_${item.id}`);
      const salePrice = salePriceVal ? Number(salePriceVal) : undefined;
      return { purchaseOrderItemId: item.id, qtyReceived: rec, ...(salePrice && salePrice > 0 ? { salePrice } : {}) };
    }).filter((i: any) => i.qtyReceived > 0);

    if (!items.length) {
      toast({ title: "Debe recibir al menos 1 unidad", variant: "destructive" });
      return;
    }
    receiveOrder.mutate({ id: selectedOrder.id, data: { items } }, {
      onSuccess: () => {
        toast({ title: "Mercancía recibida" });
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        setIsReceiveOpen(false);
      }
    });
  };

  const handleStatusChange = (v: string) => { setStatusFilter(v); setPage(1); };
  const handleSupplierSearch = (v: string) => { setSupplierSearch(v); setPage(1); };

  const paginated = (orders ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">Órdenes de Compra</h1>
          <p className="text-muted-foreground mt-1">Compras a proveedores y recepción de mercancía</p>
        </div>
        <Button onClick={() => { setLineItems([{ productId: 0, qty: 1, unitCost: 0 }]); setSelectedSupplierId(""); setIsCreateOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Crear Orden
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por proveedor..."
            value={supplierSearch}
            onChange={(e) => handleSupplierSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-48">
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="partial">Parciales</SelectItem>
              <SelectItem value="received">Recibidos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Guía / Ref</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : paginated.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">No hay órdenes</TableCell></TableRow>
            ) : (
              paginated.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="text-muted-foreground text-sm">{format(new Date(order.createdAt), "dd/MM/yyyy")}</TableCell>
                  <TableCell className="font-mono text-xs">{order.guideNumber}</TableCell>
                  <TableCell className="font-medium">{order.supplierName}</TableCell>
                  <TableCell className="capitalize text-sm">{order.paymentType}</TableCell>
                  <TableCell className="text-right font-serif font-bold">{formatCurrency(order.total)}</TableCell>
                  <TableCell>{getStatusBadge(order.status)}</TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    {/* View button — always visible */}
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver detalle" onClick={() => { setViewingOrder(order); setIsViewOpen(true); }}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {(order.status === 'pending' || order.status === 'partial') && (
                      <Button variant="outline" size="sm" className="h-8" onClick={() => { setSelectedOrder(order); setIsReceiveOpen(true); }}>
                        <PackageCheck className="h-3.5 w-3.5 mr-1.5" /> Recibir
                      </Button>
                    )}
                    {order.status !== 'received' && order.status !== 'cancelled' && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(order)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {order.status === 'pending' && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Anular orden" onClick={() => handleCancelOrder(order)}>
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {!isLoading && (orders?.length ?? 0) > PAGE_SIZE && (
          <div className="px-4 pb-4">
            <Pagination total={orders?.length ?? 0} page={page} onChange={setPage} />
          </div>
        )}
      </div>

      {/* View Order Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Orden de Compra</DialogTitle>
          </DialogHeader>
          {viewingOrder && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Proveedor</p>
                  <p className="font-medium">{viewingOrder.supplierName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Guía / Ref</p>
                  <p className="font-mono">{viewingOrder.guideNumber ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Fecha</p>
                  <p>{format(new Date(viewingOrder.createdAt), "dd/MM/yyyy HH:mm")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Estado</p>
                  {getStatusBadge(viewingOrder.status)}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Tipo de Pago</p>
                  <p className="capitalize">{viewingOrder.paymentType}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Total</p>
                  <p className="font-serif font-bold text-primary">{formatCurrency(viewingOrder.total)}</p>
                </div>
              </div>
              {viewingOrder.notes && (
                <div className="bg-muted/30 rounded-md p-3 text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Notas</p>
                  <p>{viewingOrder.notes}</p>
                </div>
              )}
              <div>
                <p className="text-sm font-medium mb-2">Productos</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Costo Unit.</TableHead>
                      <TableHead className="text-right">Pedido</TableHead>
                      <TableHead className="text-right">Recibido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewingOrder.items.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{item.productName}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(item.unitCost)}</TableCell>
                        <TableCell className="text-right">{item.qtyOrdered}</TableCell>
                        <TableCell className="text-right">
                          <span className={item.qtyReceived >= item.qtyOrdered ? "text-emerald-600 font-medium" : item.qtyReceived > 0 ? "text-blue-600 font-medium" : "text-muted-foreground"}>
                            {item.qtyReceived}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsViewOpen(false)}>Cerrar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Order Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Orden de Compra</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Proveedor</label>
                <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId} required>
                  <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                  <SelectContent>
                    {suppliers?.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Nº Guía / Ref
                  <span className="text-xs text-muted-foreground ml-1">(opcional)</span>
                </label>
                <Input name="guideNumber" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Pago</label>
              <Select name="paymentType" defaultValue="credito">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contado">Contado</SelectItem>
                  <SelectItem value="credito">Crédito (Cuenta por pagar)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Line items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Productos a comprar</label>
                <Button type="button" variant="outline" size="sm" onClick={addLineItem} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> Agregar
                </Button>
              </div>
              {lineItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-end p-3 bg-muted/30 rounded-lg">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Producto</label>
                    <Select
                      value={item.productId ? item.productId.toString() : ""}
                      onValueChange={(v) => {
                        const prod = products?.find(p => p.id === Number(v));
                        updateLineItem(idx, "productId", Number(v));
                        if (prod) updateLineItem(idx, "unitCost", prod.costPrice);
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>
                        {products?.map(p => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            <span>{p.name}</span>
                            {p.description && <span className="text-muted-foreground ml-1 text-xs">— {p.description}</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Cant.</label>
                    <Input
                      type="number" min="1"
                      value={item.qty}
                      onChange={(e) => updateLineItem(idx, "qty", Number(e.target.value))}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Costo Unit.</label>
                    <Input
                      type="number" min="0"
                      value={item.unitCost}
                      onChange={(e) => updateLineItem(idx, "unitCost", Number(e.target.value))}
                      className="h-9"
                    />
                  </div>
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-9 w-8 text-destructive hover:bg-destructive/10"
                    disabled={lineItems.length === 1}
                    onClick={() => removeLineItem(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex justify-end text-sm font-semibold text-foreground">
                Total: <span className="ml-2 font-serif text-primary">{formatCurrency(orderTotal)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notas</label>
              <Input name="notes" />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createOrder.isPending}>Crear Orden</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Order Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingOrder(null); setLineItems([{ productId: 0, qty: 1, unitCost: 0 }]); setSelectedSupplierId(""); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Orden de Compra</DialogTitle>
          </DialogHeader>
          {editingOrder && (
            <form onSubmit={handleEditSubmit} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Proveedor</label>
                  <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId} required>
                    <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                    <SelectContent>
                      {suppliers?.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Nº Guía / Ref
                    <span className="text-xs text-muted-foreground ml-1">(opcional)</span>
                  </label>
                  <Input name="guideNumber" defaultValue={editingOrder.guideNumber ?? ""} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo de Pago</label>
                <Select name="paymentType" defaultValue={editingOrder.paymentType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contado">Contado</SelectItem>
                    <SelectItem value="credito">Crédito (Cuenta por pagar)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Productos a comprar</label>
                  <Button type="button" variant="outline" size="sm" onClick={addLineItem} className="gap-1">
                    <Plus className="h-3.5 w-3.5" /> Agregar
                  </Button>
                </div>
                {lineItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-end p-3 bg-muted/30 rounded-lg">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Producto</label>
                      <Select
                        value={item.productId ? item.productId.toString() : ""}
                        onValueChange={(v) => {
                          const prod = products?.find(p => p.id === Number(v));
                          updateLineItem(idx, "productId", Number(v));
                          if (prod) updateLineItem(idx, "unitCost", prod.costPrice);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                        <SelectContent>
                          {products?.map(p => (
                            <SelectItem key={p.id} value={p.id.toString()}>
                              <span>{p.name}</span>
                              {p.description && <span className="text-muted-foreground ml-1 text-xs">— {p.description}</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Cant.</label>
                      <Input
                        type="number" min="1"
                        value={item.qty}
                        onChange={(e) => updateLineItem(idx, "qty", Number(e.target.value))}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Costo Unit.</label>
                      <Input
                        type="number" min="0"
                        value={item.unitCost}
                        onChange={(e) => updateLineItem(idx, "unitCost", Number(e.target.value))}
                        className="h-9"
                      />
                    </div>
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="h-9 w-8 text-destructive hover:bg-destructive/10"
                      disabled={lineItems.length === 1}
                      onClick={() => removeLineItem(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-end text-sm font-semibold text-foreground">
                  Total: <span className="ml-2 font-serif text-primary">{formatCurrency(orderTotal)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notas</label>
                <Input name="notes" defaultValue={editingOrder.notes ?? ""} />
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={updateOrder.isPending}>Guardar Cambios</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Receive Dialog */}
      <Dialog open={isReceiveOpen} onOpenChange={setIsReceiveOpen}>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recibir Mercancía — {selectedOrder?.guideNumber ?? `Orden #${selectedOrder?.id}`}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <form onSubmit={handleReceiveSubmit} className="space-y-4 py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Pedido</TableHead>
                    <TableHead className="text-right">Ya Recibido</TableHead>
                    <TableHead className="text-right w-24">A Recibir</TableHead>
                    <TableHead className="text-right w-32">Precio Venta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedOrder.items.map((item: any) => {
                    const remaining = item.qtyOrdered - item.qtyReceived;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{item.productName}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{item.qtyOrdered}</TableCell>
                        <TableCell className="text-right">{item.qtyReceived}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            name={`qty_${item.id}`}
                            type="number" min="0" max={remaining}
                            defaultValue={remaining > 0 ? remaining : 0}
                            disabled={remaining === 0}
                            className="w-20 ml-auto h-8 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            name={`salePrice_${item.id}`}
                            type="number" min="0" step="100"
                            defaultValue={item.salePrice ?? ""}
                            placeholder={item.salePrice ? String(item.salePrice) : "Sin cambio"}
                            disabled={remaining === 0}
                            className="w-28 ml-auto h-8 text-right"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">💡 El precio de venta se actualizará en el inventario si lo modificas aquí.</p>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsReceiveOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={receiveOrder.isPending}>Confirmar Recepción</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
