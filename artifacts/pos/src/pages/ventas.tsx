import { useState } from "react";
import {
  useListSales, getListSalesQueryKey, useGetSale, getGetSaleQueryKey, useVoidSale, useUpdateSalePaymentType,
} from "@workspace/api-client-react";
import type { Sale, SaleItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Eye, Receipt, Search, Ban, Link2, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 15;

type PaymentType = "efectivo" | "credito" | "datafono" | "link";

const calcChargedTotal = (base: number, method: string): number => {
  if (method === "datafono") return Math.floor((base + 300) / 0.9451);
  if (method === "link") return Math.floor((base + 900) / 0.9421);
  return base;
};

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
  const [voidingSaleId, setVoidingSaleId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [changingPaymentType, setChangingPaymentType] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const voidSale = useVoidSale();
  const updatePaymentType = useUpdateSalePaymentType();

  const queryParams = {
    paymentType: paymentType !== "all" ? paymentType as any : undefined,
    search: search || undefined,
  };

  const { data: sales, isLoading } = useListSales(queryParams, {
    query: {
      queryKey: getListSalesQueryKey(queryParams),
      // Poll every 10 s while any sale has a pending Bold payment
      refetchInterval: (query): number | false => {
        const data = query.state.data as Sale[] | undefined;
        const hasPending = data?.some(
          (s) => s.boldPaymentStatus === "pending"
        );
        return hasPending ? 10_000 : false;
      },
    }
  });

  const { data: saleDetail } = useGetSale(selectedSaleId!, {
    query: {
      enabled: !!selectedSaleId,
      queryKey: getGetSaleQueryKey(selectedSaleId!),
      // Keep the detail dialog in sync while the selected sale is pending
      refetchInterval: (query): number | false => {
        const data = query.state.data as Sale | undefined;
        return data?.boldPaymentStatus === "pending" ? 10_000 : false;
      },
    }
  });

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  function BoldStatusBadge({ status }: { status: string | null | undefined }) {
    if (!status) return null;
    const map: Record<string, { label: string; className: string; Icon: React.ElementType }> = {
      pending:  { label: "Bold: pendiente", className: "bg-amber-100 text-amber-700 border-amber-200",   Icon: Clock },
      paid:     { label: "Bold: pagado",    className: "bg-emerald-100 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
      failed:   { label: "Bold: rechazado", className: "bg-red-100 text-red-700 border-red-200",         Icon: XCircle },
      expired:  { label: "Bold: expirado",  className: "bg-gray-100 text-gray-600 border-gray-200",      Icon: AlertTriangle },
    };
    const cfg = map[status];
    if (!cfg) return null;
    const { label, className, Icon } = cfg;
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${className}`}>
        <Icon className="h-3 w-3" />{label}
      </span>
    );
  }

  // Reset page when filters change
  const handlePaymentType = (v: string) => { setPaymentType(v); setPage(1); };
  const handleSearch = (v: string) => { setSearch(v); setPage(1); };

  const paginated = (sales ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handlePaymentTypeChange = (newType: string) => {
    if (!selectedSaleId) return;
    setChangingPaymentType(true);
    updatePaymentType.mutate({ id: selectedSaleId, data: { paymentType: newType as "efectivo" | "datafono" | "link" } }, {
      onSuccess: () => {
        toast({ title: "Método de pago actualizado" });
        queryClient.invalidateQueries({ queryKey: getListSalesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSaleQueryKey(selectedSaleId) });
        queryClient.invalidateQueries({
          predicate: (q) => {
            const key = q.queryKey[0];
            return typeof key === "string" && key.startsWith("/api/dashboard");
          },
        });
      },
      onError: (err: any) => {
        toast({ title: "No se pudo cambiar el método de pago", description: err?.response?.data?.error ?? "Intenta de nuevo", variant: "destructive" });
      },
      onSettled: () => setChangingPaymentType(false),
    });
  };

  const handleVoid = () => {
    if (!voidingSaleId || !voidReason.trim()) return;
    voidSale.mutate({ id: voidingSaleId, data: { reason: voidReason.trim() } }, {
      onSuccess: () => {
        toast({ title: "Venta anulada" });
        queryClient.invalidateQueries({ queryKey: getListSalesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSaleQueryKey(voidingSaleId) });
        queryClient.invalidateQueries({
          predicate: (q) => {
            const key = q.queryKey[0];
            return typeof key === "string" && (key.startsWith("/api/dashboard") || key.startsWith("/api/products") || key.startsWith("/api/accounts-receivable"));
          },
        });
        setVoidingSaleId(null);
        setVoidReason("");
      },
      onError: (err: any) => {
        toast({ title: "No se pudo anular la venta", description: err?.response?.data?.error ?? "Intenta de nuevo", variant: "destructive" });
      },
    });
  };

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
              <SelectItem value="efectivo">Efectivo / Transferencia</SelectItem>
              <SelectItem value="credito">Crédito</SelectItem>
              <SelectItem value="datafono">Datáfono</SelectItem>
              <SelectItem value="link">Link de pago</SelectItem>
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
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : paginated.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8">No hay ventas registradas</TableCell></TableRow>
            ) : (
              paginated.map((sale) => (
                <TableRow key={sale.id} className={sale.voided ? "opacity-60" : undefined}>
                  <TableCell className="font-mono text-xs font-bold text-muted-foreground">{sale.id}</TableCell>
                  <TableCell className="text-sm">{format(new Date(sale.createdAt), "dd/MM/yyyy HH:mm")}</TableCell>
                  <TableCell className="font-medium">{sale.customerName || "Cliente Final"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{(sale as any).customerCedula || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{sale.userName}</TableCell>
                  <TableCell className="space-y-1">
                    <Badge variant={sale.paymentType === 'credito' ? "secondary" : "outline"}>
                      {sale.paymentType === 'efectivo' ? 'Efectivo / Transf.' :
                       sale.paymentType === 'credito' ? 'Crédito' :
                       sale.paymentType === 'datafono' ? 'Datáfono' :
                       sale.paymentType === 'link' ? 'Link de pago' : sale.paymentType}
                    </Badge>
                    {(sale as any).paymentLink && (
                      <div className="flex items-center gap-1">
                        <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                        <BoldStatusBadge status={(sale as any).boldPaymentStatus} />
                      </div>
                    )}
                    {sale.voided && (
                      <Badge variant="destructive" className="block w-fit">Anulada</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-serif font-bold text-primary">{formatCurrency(sale.total)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setSelectedSaleId(sale.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {user?.role === "admin" && !sale.voided && (
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive" title="Anular venta" onClick={() => setVoidingSaleId(sale.id)}>
                        <Ban className="h-4 w-4" />
                      </Button>
                    )}
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
                  {saleDetail.customerCedula && (
                    <p className="text-xs text-muted-foreground font-mono">CC: {saleDetail.customerCedula}</p>
                  )}
                  {saleDetail.customerPhone && (
                    <p className="text-xs text-muted-foreground font-mono">📱 {saleDetail.customerPhone}</p>
                  )}
                  {saleDetail.customerEmail && (
                    <p className="text-xs text-muted-foreground truncate">{saleDetail.customerEmail}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Cajero</p>
                  <p className="font-medium">{saleDetail.userName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Pago</p>
                  {(() => {
                    const isLocked =
                      saleDetail.voided ||
                      (saleDetail.paymentType === "link" && saleDetail.boldPaymentStatus === "paid") ||
                      saleDetail.paymentType === "credito";
                    const paymentLabel = (t: string) =>
                      t === "efectivo" ? "Efectivo / Transf." :
                      t === "credito"  ? "Crédito" :
                      t === "datafono" ? "Datáfono" :
                      t === "link"     ? "Link de pago" : t;
                    if (!isLocked && user?.role === "admin") {
                      return (
                        <Select
                          value={saleDetail.paymentType}
                          onValueChange={handlePaymentTypeChange}
                          disabled={changingPaymentType}
                        >
                          <SelectTrigger className="h-8 w-44 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="efectivo">Efectivo / Transf.</SelectItem>
                            <SelectItem value="datafono">Datáfono</SelectItem>
                            <SelectItem value="link">Link de pago</SelectItem>
                          </SelectContent>
                        </Select>
                      );
                    }
                    return (
                      <div className="flex items-center gap-2">
                        <Badge variant={saleDetail.paymentType === "credito" ? "secondary" : "outline"}>
                          {paymentLabel(saleDetail.paymentType)}
                        </Badge>
                        {isLocked && saleDetail.paymentType === "link" && saleDetail.boldPaymentStatus === "paid" && (
                          <span className="text-[10px] text-muted-foreground">(bloqueado)</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {(saleDetail as any).paymentLink && (
                <div className="bg-muted/40 border rounded-lg p-4 text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Link2 className="h-4 w-4 text-primary" />
                      Link de Pago Bold
                    </p>
                    <BoldStatusBadge status={(saleDetail as any).boldPaymentStatus} />
                  </div>
                  <a
                    href={(saleDetail as any).paymentLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-primary underline break-all"
                  >
                    {(saleDetail as any).paymentLink}
                  </a>
                  {(saleDetail as any).boldFee != null && (
                    <p className="text-xs text-muted-foreground">
                      Comisión Bold: {formatCurrency((saleDetail as any).boldFee)}
                    </p>
                  )}
                </div>
              )}

              {saleDetail.voided && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm">
                  <p className="font-semibold text-destructive mb-1">Venta Anulada</p>
                  {saleDetail.voidedAt && (
                    <p className="text-muted-foreground">Fecha: {format(new Date(saleDetail.voidedAt), "dd/MM/yyyy HH:mm")}</p>
                  )}
                  {saleDetail.voidReason && <p className="text-muted-foreground">Motivo: {saleDetail.voidReason}</p>}
                </div>
              )}

              <div>
                <h4 className="font-serif font-semibold mb-3">Artículos</h4>
                <div className="space-y-3">
                  {saleDetail.items.map((item: SaleItem) => (
                    <div key={item.id} className="flex justify-between items-start text-sm border-b pb-2 last:border-0">
                      <div className="flex gap-3 min-w-0">
                        <span className="font-medium shrink-0">{item.qty}x</span>
                        <div className="min-w-0">
                          <span className="text-foreground font-medium">{item.productName}</span>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
                          )}
                        </div>
                      </div>
                      <span className="font-mono shrink-0 ml-3">{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {(saleDetail.paymentType === 'datafono' || saleDetail.paymentType === 'link') ? (
                <div className="border-t pt-4 bg-primary/5 p-4 rounded-lg space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatCurrency(saleDetail.total)}</span>
                  </div>
                  <div className="flex justify-between text-amber-600 font-medium">
                    <span>Recargo {saleDetail.paymentType === 'datafono' ? 'Datáfono' : 'Link de pago'}</span>
                    <span className="tabular-nums">+ {formatCurrency(calcChargedTotal(saleDetail.total, saleDetail.paymentType) - saleDetail.total)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="font-semibold text-lg">Total cobrado</span>
                    <span className="font-serif text-2xl font-bold text-primary tabular-nums">{formatCurrency(calcChargedTotal(saleDetail.total, saleDetail.paymentType))}</span>
                  </div>
                </div>
              ) : (
                <div className="border-t pt-4 flex justify-between items-center bg-primary/5 p-4 rounded-lg">
                  <span className="font-semibold text-lg">Total</span>
                  <span className="font-serif text-2xl font-bold text-primary">{formatCurrency(saleDetail.total)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">Cargando detalle...</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!voidingSaleId} onOpenChange={(open) => { if (!open) { setVoidingSaleId(null); setVoidReason(""); } }}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Anular Venta #{voidingSaleId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Esta acción restaurará el stock de los productos vendidos y, si la venta tenía crédito asociado,
              eliminará la deuda del cliente. No se puede deshacer.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Motivo de la anulación</label>
              <Textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Describe el motivo..."
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setVoidingSaleId(null); setVoidReason(""); }}>Cancelar</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!voidReason.trim() || voidSale.isPending}
              onClick={handleVoid}
            >
              Anular Venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
