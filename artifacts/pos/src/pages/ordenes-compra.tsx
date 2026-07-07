import { useState } from "react";
import { 
  useListPurchaseOrders, getListPurchaseOrdersQueryKey, 
  useCreatePurchaseOrder, 
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
import { Plus, Eye, Truck, PackageCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function OrdenesCompra() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryParams = { status: statusFilter !== "all" ? statusFilter as any : undefined };
  const { data: orders, isLoading } = useListPurchaseOrders(queryParams, { query: { queryKey: getListPurchaseOrdersQueryKey(queryParams) } });
  
  const { data: suppliers } = useListSuppliers({ query: { queryKey: getListSuppliersQueryKey() } });
  const { data: products } = useListProducts(undefined, { query: { queryKey: getListProductsQueryKey() } });

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'pending': return <Badge variant="warning">Pendiente</Badge>;
      case 'partial': return <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 border-none">Parcial</Badge>;
      case 'received': return <Badge variant="success">Recibido</Badge>;
      case 'cancelled': return <Badge variant="destructive">Cancelado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const createOrder = useCreatePurchaseOrder();
  const receiveOrder = useReceivePurchaseOrder();

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    // Simplification for the mockup: Just taking one item from the form
    // In a real app this would be a dynamic list
    const data: PurchaseOrderInput = {
      supplierId: Number(formData.get("supplierId")),
      guideNumber: formData.get("guideNumber") as string,
      paymentType: formData.get("paymentType") as "contado" | "credito",
      notes: formData.get("notes") as string,
      items: [{
        productId: Number(formData.get("productId")),
        qtyOrdered: Number(formData.get("qty")),
        unitCost: Number(formData.get("cost"))
      }]
    };

    createOrder.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Orden de compra creada" });
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        setIsCreateOpen(false);
      }
    });
  };

  const handleReceiveSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const items = selectedOrder.items.map((item: any) => {
      const rec = Number(formData.get(`qty_${item.id}`) || 0);
      return { purchaseOrderItemId: item.id, qtyReceived: rec };
    }).filter((i: any) => i.qtyReceived > 0);

    if (items.length === 0) {
      toast({ title: "Debe recibir al menos 1 unidad", variant: "destructive" });
      return;
    }

    receiveOrder.mutate({ id: selectedOrder.id, data: { items } }, {
      onSuccess: () => {
        toast({ title: "Mercancía recibida" });
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        setIsReceiveOpen(false);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">Órdenes de Compra</h1>
          <p className="text-muted-foreground mt-1">Compras a proveedores y recepción de mercancía</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Crear Orden
        </Button>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
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
            ) : orders?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">No hay órdenes</TableCell></TableRow>
            ) : (
              orders?.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="text-muted-foreground text-sm">{format(new Date(order.createdAt), "dd/MM/yyyy")}</TableCell>
                  <TableCell className="font-mono text-xs">{order.guideNumber}</TableCell>
                  <TableCell className="font-medium">{order.supplierName}</TableCell>
                  <TableCell className="capitalize">{order.paymentType}</TableCell>
                  <TableCell className="text-right font-serif font-bold">{formatCurrency(order.total)}</TableCell>
                  <TableCell>{getStatusBadge(order.status)}</TableCell>
                  <TableCell className="text-right">
                    {(order.status === 'pending' || order.status === 'partial') && (
                      <Button variant="outline" size="sm" className="mr-2 h-8" onClick={() => { setSelectedOrder(order); setIsReceiveOpen(true); }}>
                        <PackageCheck className="h-3.5 w-3.5 mr-1.5" /> Recibir
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Nueva Orden de Compra</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Proveedor</label>
                <Select name="supplierId" required>
                  <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                  <SelectContent>
                    {suppliers?.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Nº Guía / Ref</label>
                <Input name="guideNumber" required />
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

            <div className="border rounded-md p-4 bg-muted/30 space-y-4">
              <h4 className="font-medium text-sm flex items-center"><Truck className="h-4 w-4 mr-2"/> Item a comprar</h4>
              <div className="space-y-2">
                <label className="text-xs font-medium">Producto</label>
                <Select name="productId" required>
                  <SelectTrigger><SelectValue placeholder="Seleccione producto..." /></SelectTrigger>
                  <SelectContent>
                    {products?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium">Cantidad</label>
                  <Input name="qty" type="number" min="1" required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Costo Unitario</label>
                  <Input name="cost" type="number" min="1" required />
                </div>
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

      {/* Receive Dialog */}
      <Dialog open={isReceiveOpen} onOpenChange={setIsReceiveOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Recibir Mercancía - {selectedOrder?.guideNumber}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <form onSubmit={handleReceiveSubmit} className="space-y-4 py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Pedido</TableHead>
                    <TableHead className="text-right">Ya Recibido</TableHead>
                    <TableHead className="text-right">A Recibir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedOrder.items.map((item: any) => {
                    const remaining = item.qtyOrdered - item.qtyReceived;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="text-right">{item.qtyOrdered}</TableCell>
                        <TableCell className="text-right">{item.qtyReceived}</TableCell>
                        <TableCell className="text-right">
                          <Input 
                            name={`qty_${item.id}`} 
                            type="number" 
                            min="0" 
                            max={remaining} 
                            defaultValue={remaining > 0 ? remaining : 0} 
                            disabled={remaining === 0}
                            className="w-20 ml-auto h-8 text-right"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
