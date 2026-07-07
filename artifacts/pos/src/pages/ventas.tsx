import { useState } from "react";
import { useListSales, getListSalesQueryKey, useGetSale, getGetSaleQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Eye, Receipt } from "lucide-react";
import { format } from "date-fns";

export default function Ventas() {
  const [paymentType, setPaymentType] = useState<string>("all");
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);

  const queryParams = { 
    paymentType: paymentType !== "all" ? paymentType as any : undefined 
  };
  
  const { data: sales, isLoading } = useListSales(queryParams, { 
    query: { queryKey: getListSalesQueryKey(queryParams) } 
  });

  const { data: saleDetail } = useGetSale(selectedSaleId!, {
    query: { enabled: !!selectedSaleId, queryKey: getGetSaleQueryKey(selectedSaleId!) }
  });

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">Historial de Ventas</h1>
          <p className="text-muted-foreground mt-1">Registro de todas las transacciones</p>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="w-48">
          <Select value={paymentType} onValueChange={setPaymentType}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo de Pago" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="contado">Contado</SelectItem>
              <SelectItem value="credito">Crédito</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket ID</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Cajero</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : sales?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">No hay ventas registradas</TableCell></TableRow>
            ) : (
              sales?.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-mono text-xs font-bold text-muted-foreground">#VNT-{sale.id.toString().padStart(5, '0')}</TableCell>
                  <TableCell className="text-sm">{format(new Date(sale.createdAt), "dd/MM/yyyy HH:mm")}</TableCell>
                  <TableCell className="font-medium">{sale.customerName || "Cliente Final"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{sale.userName}</TableCell>
                  <TableCell>
                    <Badge variant={sale.paymentType === 'contado' ? "outline" : "secondary"}>
                      {sale.paymentType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-serif font-bold text-primary">{formatCurrency(sale.total)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setSelectedSaleId(sale.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedSaleId} onOpenChange={(open) => !open && setSelectedSaleId(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" /> Detalle de Venta
            </DialogTitle>
          </DialogHeader>
          
          {saleDetail ? (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-lg">
                <div>
                  <p className="text-muted-foreground mb-1">Ticket</p>
                  <p className="font-mono font-medium">#VNT-{saleDetail.id.toString().padStart(5, '0')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Fecha</p>
                  <p className="font-medium">{format(new Date(saleDetail.createdAt), "dd/MM/yyyy HH:mm")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Cliente</p>
                  <p className="font-medium">{saleDetail.customerName || "Cliente Final"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Cajero</p>
                  <p className="font-medium">{saleDetail.userName}</p>
                </div>
              </div>

              <div>
                <h4 className="font-serif font-semibold mb-3">Artículos</h4>
                <div className="space-y-3">
                  {saleDetail.items.map(item => (
                    <div key={item.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0">
                      <div className="flex gap-3">
                        <span className="font-medium">{item.qty}x</span>
                        <span className="text-muted-foreground">{item.productName}</span>
                      </div>
                      <span className="font-mono">{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4 flex justify-between items-center bg-primary/5 p-4 rounded-lg">
                <span className="font-semibold text-lg">Total PAGADO</span>
                <span className="font-serif text-2xl font-bold text-primary">{formatCurrency(saleDetail.total)}</span>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">Cargando detalle...</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
