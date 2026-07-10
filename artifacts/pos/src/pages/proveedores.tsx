import { useState } from "react";
import { 
  useListSuppliers, getListSuppliersQueryKey, useCreateSupplier, useUpdateSupplier, SupplierInput, Supplier,
  useListPurchaseOrders, getListPurchaseOrdersQueryKey,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit, ClipboardList } from "lucide-react";
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

function OrderHistoryDialog({ supplier, open, onClose }: { supplier: Supplier; open: boolean; onClose: () => void }) {
  const params = { supplierId: supplier.id };
  const { data: orders, isLoading } = useListPurchaseOrders(params as any, {
    query: { enabled: open, queryKey: [...getListPurchaseOrdersQueryKey(params as any), supplier.id] }
  });

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="border-amber-500 text-amber-600">Pendiente</Badge>;
      case 'partial': return <Badge variant="secondary">Parcial</Badge>;
      case 'received': return <Badge variant="outline" className="border-emerald-500 text-emerald-600">Recibido</Badge>;
      case 'cancelled': return <Badge variant="destructive">Cancelado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Historial de Órdenes — {supplier.name}
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Cargando...</p>
          ) : !orders?.length ? (
            <p className="text-center text-muted-foreground py-8">No hay órdenes para este proveedor</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Guía / Ref</TableHead>
                  <TableHead>Tipo Pago</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map(order => (
                  <TableRow key={order.id}>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(order.createdAt), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="font-mono text-xs">{order.guideNumber}</TableCell>
                    <TableCell className="capitalize text-sm">{order.paymentType}</TableCell>
                    <TableCell className="text-right font-serif font-bold">{formatCurrency(order.total)}</TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Proveedores() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [historySupplier, setHistorySupplier] = useState<Supplier | null>(null);
  const [page, setPage] = useState(1);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: suppliers, isLoading } = useListSuppliers({
    query: { queryKey: getListSuppliersQueryKey() }
  });

  const createSupp = useCreateSupplier();
  const updateSupp = useUpdateSupplier();

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: SupplierInput = {
      name: formData.get("name") as string,
      contact: formData.get("contact") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
    };

    if (editingSupplier) {
      updateSupp.mutate({ id: editingSupplier.id, data }, {
        onSuccess: () => {
          toast({ title: "Proveedor actualizado" });
          queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
          setIsDialogOpen(false);
        }
      });
    } else {
      createSupp.mutate({ data }, {
        onSuccess: () => {
          toast({ title: "Proveedor creado" });
          queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
          setIsDialogOpen(false);
        }
      });
    }
  };

  const paginated = (suppliers ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">Proveedores</h1>
          <p className="text-muted-foreground mt-1">Gestión de proveedores de mercancía</p>
        </div>
        <Button onClick={() => { setEditingSupplier(null); setIsDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo Proveedor
        </Button>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : paginated.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">No hay proveedores registrados</TableCell></TableRow>
            ) : (
              paginated.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium font-serif">{supplier.name}</TableCell>
                  <TableCell>{supplier.contact || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{supplier.email || "—"}</TableCell>
                  <TableCell>{supplier.phone || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setHistorySupplier(supplier)}>
                      <ClipboardList className="h-4 w-4" /> Órdenes
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { setEditingSupplier(supplier); setIsDialogOpen(true); }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {!isLoading && (suppliers?.length ?? 0) > PAGE_SIZE && (
          <div className="px-4 pb-4">
            <Pagination total={suppliers?.length ?? 0} page={page} onChange={setPage} />
          </div>
        )}
      </div>

      {/* Order history dialog */}
      {historySupplier && (
        <OrderHistoryDialog
          supplier={historySupplier}
          open={!!historySupplier}
          onClose={() => setHistorySupplier(null)}
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSupplier ? "Editar Proveedor" : "Nuevo Proveedor"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre de la Empresa</label>
              <Input name="name" defaultValue={editingSupplier?.name} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Persona de Contacto</label>
              <Input name="contact" defaultValue={editingSupplier?.contact || ""} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Correo Electrónico</label>
                <Input name="email" type="email" defaultValue={editingSupplier?.email || ""} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Teléfono</label>
                <Input name="phone" defaultValue={editingSupplier?.phone || ""} />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createSupp.isPending || updateSupp.isPending}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
