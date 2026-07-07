import { useState } from "react";
import { useListAccountsPayable, getListAccountsPayableQueryKey, useCreateApPayment } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function CuentasPagar() {
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedAp, setSelectedAp] = useState<any>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryParams = { status: statusFilter !== "all" ? statusFilter as any : undefined };
  const { data: aps, isLoading } = useListAccountsPayable(queryParams, { query: { queryKey: getListAccountsPayableQueryKey(queryParams) } });

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  const createPayment = useCreateApPayment();

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

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'pending': return <Badge variant="destructive">Pendiente</Badge>;
      case 'partial': return <Badge variant="warning">Abono Parcial</Badge>;
      case 'paid': return <Badge variant="success">Pagado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">Cuentas por Pagar</h1>
          <p className="text-muted-foreground mt-1">Obligaciones con proveedores</p>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
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
              <TableHead>Proveedor / Guía</TableHead>
              <TableHead className="text-right">Total Deuda</TableHead>
              <TableHead className="text-right">Abonado</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : aps?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">No hay cuentas por pagar</TableCell></TableRow>
            ) : (
              aps?.map((ap) => {
                const balance = ap.totalAmount - ap.paidAmount;
                return (
                  <TableRow key={ap.id}>
                    <TableCell className="text-muted-foreground text-sm">{format(new Date(ap.createdAt), "dd/MM/yyyy")}</TableCell>
                    <TableCell>
                      <div className="font-medium">{ap.supplierName}</div>
                      <div className="text-xs text-muted-foreground font-mono">Ref: {ap.guideNumber}</div>
                    </TableCell>
                    <TableCell className="text-right font-serif">{formatCurrency(ap.totalAmount)}</TableCell>
                    <TableCell className="text-right text-emerald-600">{formatCurrency(ap.paidAmount)}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">{formatCurrency(balance)}</TableCell>
                    <TableCell>{getStatusBadge(ap.status)}</TableCell>
                    <TableCell className="text-right">
                      {balance > 0 && (
                        <Button variant="outline" size="sm" className="h-8" onClick={() => { setSelectedAp(ap); setIsPaymentOpen(true); }}>
                          <DollarSign className="h-3.5 w-3.5 mr-1" /> Pagar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Registrar Pago a Proveedor</DialogTitle>
          </DialogHeader>
          {selectedAp && (
            <form onSubmit={handlePaymentSubmit} className="space-y-4 py-4">
              <div className="bg-muted/50 p-4 rounded-md space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Proveedor:</span>
                  <span className="font-medium">{selectedAp.supplierName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Saldo pendiente:</span>
                  <span className="font-bold text-destructive">{formatCurrency(selectedAp.totalAmount - selectedAp.paidAmount)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Monto a Abonar</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    name="amount" 
                    type="number" 
                    step="0.01"
                    min="1" 
                    max={selectedAp.totalAmount - selectedAp.paidAmount} 
                    defaultValue={selectedAp.totalAmount - selectedAp.paidAmount} 
                    required 
                    className="pl-9 font-serif text-lg"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Referencia / Notas</label>
                <Input name="notes" placeholder="Ej: Transferencia Bancolombia #1234" />
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsPaymentOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createPayment.isPending}>Confirmar Pago</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
