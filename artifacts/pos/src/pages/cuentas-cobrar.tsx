import { useState } from "react";
import { useListAccountsReceivable, getListAccountsReceivableQueryKey, useCreateArPayment } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function CuentasCobrar() {
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedAr, setSelectedAr] = useState<any>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryParams = { status: statusFilter !== "all" ? statusFilter as any : undefined };
  const { data: ars, isLoading } = useListAccountsReceivable(queryParams, { query: { queryKey: getListAccountsReceivableQueryKey(queryParams) } });

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  const createPayment = useCreateArPayment();

  const handlePaymentSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get("amount"));
    
    if (amount <= 0 || amount > (selectedAr.totalAmount - selectedAr.paidAmount)) {
      toast({ title: "Monto inválido", variant: "destructive" });
      return;
    }

    createPayment.mutate({ 
      id: selectedAr.id, 
      data: { amount, notes: formData.get("notes") as string } 
    }, {
      onSuccess: () => {
        toast({ title: "Pago recibido exitosamente" });
        queryClient.invalidateQueries({ queryKey: getListAccountsReceivableQueryKey() });
        setIsPaymentOpen(false);
      }
    });
  };

  const getStatusBadge = (status: string, dueDate: string | null) => {
    const isOverdue = dueDate && new Date(dueDate) < new Date() && status !== 'paid';
    
    if (isOverdue) return <Badge variant="destructive" className="animate-pulse"><AlertCircle className="w-3 h-3 mr-1"/> Vencida</Badge>;
    
    switch(status) {
      case 'pending': return <Badge variant="outline" className="border-amber-500 text-amber-600">Pendiente</Badge>;
      case 'partial': return <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">Abono Parcial</Badge>;
      case 'paid': return <Badge variant="success">Pagado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">Cuentas por Cobrar</h1>
          <p className="text-muted-foreground mt-1">Cartera de clientes (Ventas a crédito)</p>
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
              <TableHead>Fecha Venta</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Total Venta</TableHead>
              <TableHead className="text-right">Abonado</TableHead>
              <TableHead className="text-right">Saldo Deuda</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : ars?.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8">No hay cuentas por cobrar</TableCell></TableRow>
            ) : (
              ars?.map((ar) => {
                const balance = ar.totalAmount - ar.paidAmount;
                return (
                  <TableRow key={ar.id}>
                    <TableCell className="text-muted-foreground text-sm">{format(new Date(ar.createdAt), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-muted-foreground text-sm font-medium">
                      {ar.dueDate ? format(new Date(ar.dueDate), "dd/MM/yyyy") : "-"}
                    </TableCell>
                    <TableCell className="font-medium">{ar.customerName}</TableCell>
                    <TableCell className="text-right font-serif">{formatCurrency(ar.totalAmount)}</TableCell>
                    <TableCell className="text-right text-emerald-600">{formatCurrency(ar.paidAmount)}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">{formatCurrency(balance)}</TableCell>
                    <TableCell>{getStatusBadge(ar.status, ar.dueDate)}</TableCell>
                    <TableCell className="text-right">
                      {balance > 0 && (
                        <Button variant="outline" size="sm" className="h-8 border-emerald-500 text-emerald-600 hover:bg-emerald-50" onClick={() => { setSelectedAr(ar); setIsPaymentOpen(true); }}>
                          <DollarSign className="h-3.5 w-3.5 mr-1" /> Recibir Pago
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
            <DialogTitle>Recibir Pago de Cliente</DialogTitle>
          </DialogHeader>
          {selectedAr && (
            <form onSubmit={handlePaymentSubmit} className="space-y-4 py-4">
              <div className="bg-muted/50 p-4 rounded-md space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="font-medium">{selectedAr.customerName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Deuda actual:</span>
                  <span className="font-bold text-destructive">{formatCurrency(selectedAr.totalAmount - selectedAr.paidAmount)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Monto Recibido</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    name="amount" 
                    type="number" 
                    step="0.01"
                    min="1" 
                    max={selectedAr.totalAmount - selectedAr.paidAmount} 
                    defaultValue={selectedAr.totalAmount - selectedAr.paidAmount} 
                    required 
                    className="pl-9 font-serif text-lg"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notas</label>
                <Input name="notes" placeholder="Ej: Efectivo / Transferencia" />
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsPaymentOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createPayment.isPending} className="bg-emerald-600 hover:bg-emerald-700">Confirmar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
