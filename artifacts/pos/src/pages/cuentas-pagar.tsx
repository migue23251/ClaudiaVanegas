import { useState } from "react";
import { useListAccountsPayable, getListAccountsPayableQueryKey, useCreateApPayment, useCreateFixedExpense, useUpdateAccountPayableStatus } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Plus, RotateCcw } from "lucide-react";
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

export default function CuentasPagar() {
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isRevertOpen, setIsRevertOpen] = useState(false);
  const [selectedAp, setSelectedAp] = useState<any>(null);
  const [revertDueDate, setRevertDueDate] = useState("");
  const [page, setPage] = useState(1);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryParams = { status: statusFilter !== "all" ? statusFilter as any : undefined };
  const { data: aps, isLoading } = useListAccountsPayable(queryParams, {
    query: { queryKey: getListAccountsPayableQueryKey(queryParams) }
  });

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  const createPayment = useCreateApPayment();
  const createFixedExpense = useCreateFixedExpense();
  const updateStatus = useUpdateAccountPayableStatus();

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const description = (formData.get("description") as string).trim();
    const totalAmount = Number(formData.get("totalAmount"));
    const dueDate = formData.get("dueDate") as string;

    if (!description || totalAmount <= 0) {
      toast({ title: "Complete la descripción y un monto válido", variant: "destructive" });
      return;
    }

    createFixedExpense.mutate({
      data: { description, totalAmount, dueDate: dueDate || undefined },
    }, {
      onSuccess: () => {
        toast({ title: "Cuenta por pagar creada" });
        queryClient.invalidateQueries({ queryKey: getListAccountsPayableQueryKey() });
        setIsCreateOpen(false);
      },
    });
  };

  const handlePaymentSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get("amount"));

    if (amount <= 0 || amount > (selectedAp.totalAmount - selectedAp.paidAmount)) {
      toast({ title: "Monto inválido", variant: "destructive" });
      return;
    }

    createPayment.mutate({
      id: selectedAp.id,
      data: { amount, notes: formData.get("notes") as string }
    }, {
      onSuccess: () => {
        toast({ title: "Pago registrado exitosamente" });
        queryClient.invalidateQueries({ queryKey: getListAccountsPayableQueryKey() });
        setIsPaymentOpen(false);
      }
    });
  };

  const handleRevertSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    updateStatus.mutate({
      id: selectedAp.id,
      data: { status: "pending", dueDate: revertDueDate || undefined },
    }, {
      onSuccess: () => {
        toast({ title: "Cuenta revertida a pendiente" });
        queryClient.invalidateQueries({ queryKey: getListAccountsPayableQueryKey() });
        setIsRevertOpen(false);
        setRevertDueDate("");
      },
      onError: (err: any) => {
        toast({
          title: "Error al revertir",
          description: err?.response?.data?.error ?? "Error desconocido",
          variant: "destructive",
        });
      },
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="destructive">Pendiente</Badge>;
      case 'partial': return <Badge variant="outline" className="border-amber-500 text-amber-600">Abono Parcial</Badge>;
      case 'paid': return <Badge variant="outline" className="border-emerald-500 text-emerald-600">Pagado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Returns the main display name for an AP record
  const apDisplayName = (ap: any) =>
    ap.type === "fixed_expense" || ap.type === "inventory_entry"
      ? ap.description
      : (ap.supplierName ?? "Desconocido");

  // Returns a subtitle for an AP record
  const apSubtitle = (ap: any) => {
    const due = ap.dueDate ? ` · Vence ${format(new Date(ap.dueDate), "dd/MM/yyyy")}` : "";
    if (ap.type === "fixed_expense") return `Gasto fijo${due}`;
    if (ap.type === "inventory_entry") return `Compra inventario${due}`;
    return ap.guideNumber ? `Ref: ${ap.guideNumber}` : null;
  };

  const handleStatusChange = (v: string) => { setStatusFilter(v); setPage(1); };
  const paginated = (aps ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">Cuentas por Pagar</h1>
          <p className="text-muted-foreground mt-1">Obligaciones con proveedores y gastos fijos</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nueva Cuenta
        </Button>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="w-48">
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="partial">Parciales</SelectItem>
              <SelectItem value="paid">Pagadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Abonado</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : paginated.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No hay cuentas por pagar</TableCell></TableRow>
            ) : (
              paginated.map((ap) => {
                const balance = ap.totalAmount - ap.paidAmount;
                const subtitle = apSubtitle(ap);
                const canRevert = ap.type === "inventory_entry" && (ap.status === "paid" || ap.status === "partial");
                return (
                  <TableRow key={ap.id}>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {format(new Date(ap.createdAt), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{apDisplayName(ap)}</div>
                      {subtitle && (
                        <div className="text-xs text-muted-foreground">{subtitle}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-serif">{formatCurrency(ap.totalAmount)}</TableCell>
                    <TableCell className="text-right text-emerald-600">{formatCurrency(ap.paidAmount)}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">{formatCurrency(balance)}</TableCell>
                    <TableCell>{getStatusBadge(ap.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {balance > 0 && (
                          <Button
                            variant="outline" size="sm" className="h-8"
                            onClick={() => { setSelectedAp(ap); setIsPaymentOpen(true); }}
                          >
                            <DollarSign className="h-3.5 w-3.5 mr-1" /> Pagar
                          </Button>
                        )}
                        {canRevert && (
                          <Button
                            variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground"
                            title="Pasar a pendiente"
                            onClick={() => { setSelectedAp(ap); setRevertDueDate(""); setIsRevertOpen(true); }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {!isLoading && (aps?.length ?? 0) > PAGE_SIZE && (
          <div className="px-4 pb-4">
            <Pagination total={aps?.length ?? 0} page={page} onChange={setPage} />
          </div>
        )}
      </div>

      {/* Register payment dialog */}
      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
          </DialogHeader>
          {selectedAp && (
            <form onSubmit={handlePaymentSubmit} className="space-y-4 py-4">
              <div className="bg-muted/50 p-4 rounded-md space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Concepto:</span>
                  <span className="font-medium text-right max-w-[200px]">{apDisplayName(selectedAp)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Saldo pendiente:</span>
                  <span className="font-bold text-destructive">{formatCurrency(selectedAp.totalAmount - selectedAp.paidAmount)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Monto a Pagar</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    name="amount" type="number" step="0.01" min="1"
                    max={selectedAp.totalAmount - selectedAp.paidAmount}
                    defaultValue={selectedAp.totalAmount - selectedAp.paidAmount}
                    required className="pl-9 font-serif text-lg"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notas</label>
                <Input name="notes" placeholder="Ej: Transferencia / Efectivo" />
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsPaymentOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createPayment.isPending}>Confirmar Pago</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Revert to pending dialog */}
      <Dialog open={isRevertOpen} onOpenChange={setIsRevertOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" /> Pasar a Pendiente
            </DialogTitle>
          </DialogHeader>
          {selectedAp && (
            <form onSubmit={handleRevertSubmit} className="space-y-4 py-4">
              <div className="bg-muted/50 p-4 rounded-md text-sm space-y-1">
                <div className="font-medium">{apDisplayName(selectedAp)}</div>
                <div className="text-muted-foreground">{formatCurrency(selectedAp.totalAmount)}</div>
              </div>
              <p className="text-sm text-muted-foreground">
                El pago registrado se eliminará y la cuenta quedará como <strong>pendiente</strong>. Podrás registrar el pago cuando se realice.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium">Fecha límite de pago <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <Input
                  type="date"
                  value={revertDueDate}
                  onChange={e => setRevertDueDate(e.target.value)}
                />
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setIsRevertOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="destructive" disabled={updateStatus.isPending}>
                  Pasar a pendiente
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Create fixed expense dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Nueva Cuenta por Pagar</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Descripción</label>
              <Input name="description" placeholder="Ej: Arriendo local, Servicios públicos..." required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Monto</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input name="totalAmount" type="number" step="0.01" min="1" required className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha límite de pago</label>
              <Input name="dueDate" type="date" />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createFixedExpense.isPending}>Crear</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
