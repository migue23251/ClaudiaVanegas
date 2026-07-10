import { useState } from "react";
import { useListSales, getListSalesQueryKey, useGetSale, getGetSaleQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Receipt, Search } from "lucide-react";
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

export default function Ventas() {
  const [paymentType, setPaymentType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const queryParams = {
    paymentType: paymentType !== "all" ? paymentType as any : undefined,
    search: search || undefined,
  };

  const { data: sales, isLoading } = useListSales(queryParams, {
    query: { queryKey: getListSalesQueryKey(queryParams) }
  });

  const { data: saleDetail } = useGetSale(selectedSaleId!, {
    query: { enabled: !!selectedSaleId, queryKey: getGetSaleQueryKey(selectedSaleId!) }
  });

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  // Reset page when filters change
  const handlePaymentType = (v: string) => { setPaymentType(v); setPage(1); };
  const handleSearch = (v: string) => { setSearch(v); setPage(1); };

  const paginated = (sales ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">Historial de Ventas</h1>
          <p className="text-muted-foreground mt-1">Registro de todas las transacciones</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cédula o nombre del cliente..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-48">
          <Select value={paymentType} onValueChange={handlePaymentType}>
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
              <TableHead>Ticket</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Cédula</TableHead>
              <TableHead>Cajero</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : paginated.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8">No hay ventas registradas</TableCell></TableRow>
            ) : (
              paginated.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-mono text-xs font-bold text-muted-foreground">{sale.id}</TableCell>
                  <TableCell className="text-sm">{format(new Date(sale.createdAt), "dd/MM/yyyy HH:mm")}</TableCell>
                  <TableCell className="font-medium">{sale.customerName || "Cliente Final"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{(sale as any).customerCedula || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{sale.userName}</TableCell>
                  <TableCell>
                    <Badge variant={sale.paymentType === 'contado' ? "outline" : "secondary"}>
                      {sale.paymentType === 'contado' ? 'Contado' : 'Crédito'}
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
        {!isLoading && (sales?.length ?? 0) > PAGE_SIZE && (
          <div className="px-4 pb-4">
            <Pagination total={sales?.length ?? 0} page={page} onChange={setPage} />
          </div>
        )}
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
                  <p className="text-muted-foreground mb-1">Ticket #</p>
                  <p className="font-mono font-bold text-lg">{saleDetail.id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Fecha</p>
                  <p className="font-medium">{format(new Date(saleDetail.createdAt), "dd/MM/yyyy HH:mm")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Cliente</p>
                  <p className="font-medium">{saleDetail.customerName || "Cliente Final"}</p>
                  {(saleDetail as any).customerCedula && (
                    <p className="text-xs text-muted-foreground font-mono">CC: {(saleDetail as any).customerCedula}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Cajero</p>
                  <p className="font-medium">{saleDetail.userName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Pago</p>
                  <Badge variant={saleDetail.paymentType === 'contado' ? "outline" : "secondary"}>
                    {saleDetail.paymentType === 'contado' ? 'Contado' : 'Crédito'}
                  </Badge>
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
                <span className="font-semibold text-lg">Total</span>
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
