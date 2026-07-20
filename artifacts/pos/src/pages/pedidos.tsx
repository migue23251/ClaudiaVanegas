import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList, Phone, Mail, Calendar, MapPin, MessageSquare,
  Receipt, X, ChevronDown, ChevronUp, CheckCircle2, CreditCard, Copy,
  UserSearch, UserPlus, Edit, Search, Package, Loader2, Trash2, Plus, Save,
} from "lucide-react";
import {
  useListCustomers, getListCustomersQueryKey, useCreateCustomer,
  useListProducts,
  Customer, CustomerInput,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOR_HEX: Record<string, string> = {
  blanco: "#FFFFFF", negro: "#111111", gris: "#9CA3AF", beige: "#D4B896",
  crema: "#FFF8DC", rojo: "#EF4444", rosa: "#F9A8D4", fucsia: "#EC4899",
  naranja: "#F97316", amarillo: "#EAB308", verde: "#22C55E", azul: "#3B82F6",
  morado: "#A855F7", vinotinto: "#7F1D1D", café: "#92400E", multicolor: "linear-gradient(135deg,#f00,#0f0,#00f)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: number;
  productId: number | null;
  productName: string;
  description: string | null;
  qty: number;
  unitPrice: number;
  subtotal: number;
  variantId: number | null;
  variantColor: string | null;
  variantSize: string | null;
}

interface CatalogOrder {
  id: number;
  status: "pending" | "invoiced" | "cancelled";
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerAddress: string | null;
  notes: string | null;
  total: number;
  invoicedSaleId: number | null;
  createdAt: string;
  items: OrderItem[];
}

interface EditableItem extends OrderItem {
  editQty: number;
  editPrice: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("es-CO", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

type PaymentType = "efectivo" | "credito" | "datafono" | "link";

const calcChargedTotal = (base: number, method: PaymentType): number => {
  if (method === "datafono") return Math.floor((base + 300) / 0.9451);
  if (method === "link") return Math.floor((base + 900) / 0.9421);
  return base;
};

const PAYMENT_LABELS: Record<PaymentType, string> = {
  efectivo: "Efectivo / Transferencia",
  credito: "Crédito",
  datafono: "Datáfono",
  link: "Link de pago",
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    pending:   { label: "Pendiente", cls: "bg-amber-100 text-amber-700 border-amber-200" },
    invoiced:  { label: "Facturado", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    cancelled: { label: "Cancelado", cls: "bg-red-100 text-red-700 border-red-200" },
  };
  const { label, cls } = cfg[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Pedidos() {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("pending");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<CatalogOrder | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<EditableItem[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType>("efectivo");
  const [isInvoicing, setIsInvoicing] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);
  const [boldResult, setBoldResult] = useState<{ url: string; fee: number; saleId: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [addProductSearch, setAddProductSearch] = useState("");
  const [showAddProduct, setShowAddProduct] = useState(false);

  // ── Stock lookup (for order detail view + invoicing table) ────────────────
  const { data: allProducts = [] } = useListProducts(undefined, {
    query: { queryKey: ["catalog-order-invoice-products"], enabled: !!invoiceOrder || !!expandedId },
  });
  const stockByProductId = useMemo(
    () => new Map(allProducts.map(p => [p.id, p.stock])),
    [allProducts]
  );
  const stockByVariantId = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of allProducts) {
      for (const v of (p as any).variants ?? []) m.set(v.id, v.stock);
    }
    return m;
  }, [allProducts]);

  // ── Product picker expanded variant state ──────────────────────────────────
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);


  // ── Customer selection (for invoicing) ────────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  const { data: customers } = useListCustomers(
    { search: customerSearch },
    { query: { queryKey: getListCustomersQueryKey({ search: customerSearch }), enabled: !!invoiceOrder } }
  );
  const createCustomer = useCreateCustomer();

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: allOrders = [], isLoading, refetch } = useQuery({
    queryKey: ["catalog-orders"],
    queryFn: async (): Promise<CatalogOrder[]> => {
      const res = await fetch("/api/catalog-orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error cargando pedidos");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const filteredOrders = useMemo(
    () => statusFilter === "all" ? allOrders : allOrders.filter(o => o.status === statusFilter),
    [allOrders, statusFilter]
  );

  const counts = useMemo(() => ({
    pending:   allOrders.filter(o => o.status === "pending").length,
    invoiced:  allOrders.filter(o => o.status === "invoiced").length,
    cancelled: allOrders.filter(o => o.status === "cancelled").length,
    all: allOrders.length,
  }), [allOrders]);

  // ── Invoice calculations ───────────────────────────────────────────────────

  const invoiceSubtotal    = invoiceItems.reduce((s, i) => s + i.editQty * i.editPrice, 0);
  const invoiceChargedTotal = calcChargedTotal(invoiceSubtotal, paymentType);
  const invoiceSurcharge    = invoiceChargedTotal - invoiceSubtotal;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openInvoice = (order: CatalogOrder) => {
    setInvoiceOrder(order);
    setInvoiceItems(order.items.map(i => ({ ...i, editQty: i.qty, editPrice: i.unitPrice })));
    setPaymentType("efectivo");
    setAdvanceAmount(0);
    setSelectedCustomer(null);
    setCustomerSearch("");
    setIsCreatingCustomer(false);
    setAddProductSearch("");
    setShowAddProduct(false);
  };

  const handleSaveOrder = async () => {
    if (!invoiceOrder) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/catalog-orders/${invoiceOrder.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          items: invoiceItems.map(i => ({ productId: i.productId, qty: i.editQty, unitPrice: i.editPrice })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error guardando");
      setInvoiceOrder(null);
      refetch();
      toast({ title: `Pedido #${invoiceOrder.id} guardado`, description: "Los artículos fueron actualizados." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Create customer (prefilled from the order's own data) ─────────────────

  const handleCreateCustomerSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createCustomer.mutate({
      data: {
        cedula: formData.get("cedula") as string,
        firstName: formData.get("firstName") as string,
        lastName: formData.get("lastName") as string,
        email: (formData.get("email") as string) || undefined,
        phone: (formData.get("phone") as string) || undefined,
      } as CustomerInput
    }, {
      onSuccess: (created) => {
        setSelectedCustomer(created);
        setCustomerSearch("");
        setIsCreatingCustomer(false);
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        toast({ title: "Cliente creado y seleccionado" });
      },
      onError: (err: any) => {
        toast({ title: "Error creando cliente", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleInvoice = async () => {
    if (!invoiceOrder) return;
    if (paymentType === "credito" && !selectedCustomer) {
      toast({ title: "Selecciona o crea un cliente para facturar a crédito", variant: "destructive" });
      return;
    }
    setIsInvoicing(true);
    try {
      const res = await fetch(`/api/catalog-orders/${invoiceOrder.id}/invoice`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          items: invoiceItems.map(i => ({ productId: i.productId, qty: i.editQty, unitPrice: i.editPrice })),
          paymentType,
          chargedAmount: invoiceSurcharge > 0 ? invoiceChargedTotal : undefined,
          customerId: selectedCustomer?.id,
          advanceAmount: paymentType === "credito" && advanceAmount > 0 ? advanceAmount : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error facturando");

      setInvoiceOrder(null);
      setSelectedCustomer(null);
      setCustomerSearch("");
      refetch();

      if (data.paymentLink) {
        setBoldResult({ url: data.paymentLink, fee: data.boldFee ?? 0, saleId: data.saleId });
      } else {
        toast({ title: `Pedido #${invoiceOrder.id} facturado con éxito`, className: "bg-emerald-500 text-white border-none" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsInvoicing(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelOrderId) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/catalog-orders/${cancelOrderId}/cancel`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error cancelando");
      toast({ title: `Pedido #${cancelOrderId} cancelado` });
      setCancelOrderId(null);
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsCancelling(false);
    }
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Link copiado al portapapeles" });
  };

  // ── Tabs config ───────────────────────────────────────────────────────────

  const TABS = [
    { key: "pending",   label: "Pendientes", count: counts.pending },
    { key: "invoiced",  label: "Facturados", count: counts.invoiced },
    { key: "cancelled", label: "Cancelados", count: counts.cancelled },
    { key: "all",       label: "Todos",      count: counts.all },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif">Pedidos del Catálogo</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Solicitudes de clientes desde el catálogo público</p>
        </div>
        {counts.pending > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 w-fit">
            <div className="h-2 w-2 bg-amber-500 rounded-full animate-pulse" />
            <span className="text-sm font-semibold text-amber-700">
              {counts.pending} pendiente{counts.pending !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0 border-b border-border overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              statusFilter === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              statusFilter === tab.key
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Orders list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium text-base">
            {statusFilter === "pending" ? "No hay pedidos pendientes" :
             statusFilter === "invoiced" ? "No hay pedidos facturados" :
             statusFilter === "cancelled" ? "No hay pedidos cancelados" :
             "No hay pedidos"}
          </p>
          <p className="text-sm mt-1">Los pedidos del catálogo aparecerán aquí</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(order => (
            <div key={order.id} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              {/* Card header */}
              <div className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="font-semibold text-base">{order.customerName}</span>
                      <StatusBadge status={order.status} />
                      <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                        #{order.id}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" />{order.customerPhone}
                      </span>
                      {order.customerEmail && (
                        <span className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" />{order.customerEmail}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />{fmtDate(order.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Right: total + actions */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="font-bold text-lg text-primary">{fmt(order.total)}</div>
                      <div className="text-xs text-muted-foreground">
                        {order.items.length} artículo{order.items.length !== 1 ? "s" : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                        className="h-8 w-8 p-0"
                      >
                        {expandedId === order.id
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />
                        }
                      </Button>

                      {order.status === "pending" && (
                        <>
                          <Button size="sm" onClick={() => openInvoice(order)} className="gap-1.5 h-8">
                            <Receipt className="h-3.5 w-3.5" /> Facturar
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            className="text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5 h-8"
                            onClick={() => setCancelOrderId(order.id)}
                          >
                            <X className="h-3.5 w-3.5" /> Cancelar
                          </Button>
                        </>
                      )}

                      {order.status === "invoiced" && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <CheckCircle2 className="h-4 w-4" /> Factura #{order.invoicedSaleId}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === order.id && (
                <div className="border-t border-border bg-muted/20 p-4 space-y-3">
                  {/* Extra contact info */}
                  {(order.customerAddress || order.notes) && (
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      {order.customerAddress && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />{order.customerAddress}
                        </span>
                      )}
                      {order.notes && (
                        <span className="flex items-start gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5 shrink-0 mt-0.5" />{order.notes}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Items table */}
                  <div className="rounded-lg border border-border overflow-hidden bg-background text-sm">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Producto</th>
                          <th className="text-center px-3 py-2 font-medium">Cant.</th>
                          <th className="text-right px-3 py-2 font-medium">Precio</th>
                          <th className="text-right px-3 py-2 font-medium">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {order.items.map(item => (
                          <tr key={item.id}>
                            <td className="px-3 py-2">
                              <span className="block">{item.productName}</span>
                              {(item.variantColor || item.variantSize) && (
                                <span className="flex items-center gap-1 mt-0.5">
                                  {item.variantColor && (
                                    <span
                                      className="inline-block w-2.5 h-2.5 rounded-full border border-border shrink-0"
                                      style={{ background: COLOR_HEX[item.variantColor] ?? "#ccc" }}
                                    />
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {[item.variantColor, item.variantSize].filter(Boolean).join(" / ")}
                                  </span>
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums">{item.qty}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmt(item.unitPrice)}</td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums">{fmt(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-border bg-muted/30">
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-right font-bold">Total pedido</td>
                          <td className="px-3 py-2 text-right font-bold text-primary">{fmt(order.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Invoice modal ──────────────────────────────────────────────────── */}
      <Dialog open={!!invoiceOrder} onOpenChange={open => { if (!open) setInvoiceOrder(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Facturar Pedido #{invoiceOrder?.id}
            </DialogTitle>
            <DialogDescription>
              <strong>{invoiceOrder?.customerName}</strong> · {invoiceOrder?.customerPhone}
              {invoiceOrder?.customerEmail && ` · ${invoiceOrder.customerEmail}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Customer */}
            <div>
              <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                <UserSearch className="h-4 w-4 text-primary" />
                Cliente
                {paymentType === "credito" && <span className="text-destructive">*</span>}
              </p>
              {selectedCustomer ? (
                <div className="flex items-center justify-between bg-accent p-3 rounded-lg">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                    <p className="text-xs text-muted-foreground font-mono">CC: {selectedCustomer.cedula}</p>
                    <p className="text-xs text-muted-foreground font-mono">📱 {selectedCustomer.phone ?? "—"}</p>
                    {selectedCustomer.email && (
                      <p className="text-xs text-muted-foreground truncate">{selectedCustomer.email}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setSelectedCustomer(null); setCustomerSearch(""); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre o cédula..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                  {customerSearch && customers && customers.length > 0 && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-popover border shadow-md rounded-md z-50 max-h-48 overflow-y-auto">
                      {customers.map(c => (
                        <div
                          key={c.id}
                          className="p-2.5 hover:bg-accent cursor-pointer text-sm"
                          onClick={() => { setSelectedCustomer(c); setCustomerSearch(""); }}
                        >
                          <div className="font-medium">{c.firstName} {c.lastName}</div>
                          <div className="text-xs text-muted-foreground">{c.cedula}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {customerSearch.length > 1 && customers?.length === 0 && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-popover border shadow-md rounded-md z-50">
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        No se encontró ningún cliente
                      </div>
                      <div className="border-t p-2">
                        <Button
                          variant="ghost" size="sm"
                          className="w-full gap-2 text-primary hover:text-primary hover:bg-primary/10"
                          onClick={() => setIsCreatingCustomer(true)}
                        >
                          <UserPlus className="h-4 w-4" />
                          Crear cliente con los datos del pedido
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!selectedCustomer && (
                <p className={`text-xs mt-1.5 ${paymentType === "credito" ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {paymentType === "credito"
                    ? "Debes seleccionar un cliente para facturar a crédito."
                    : "Puedes facturar sin seleccionar un cliente si el pago es de contado."}
                </p>
              )}
            </div>

            {/* Items editable */}
            <div>
              <p className="text-sm font-semibold mb-2">Artículos — ajusta cantidades, precios o agrega/elimina artículos</p>
              <div className="rounded-lg border border-border overflow-hidden text-sm">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Producto</th>
                      <th className="text-center px-3 py-2 font-medium">Stock</th>
                      <th className="text-center px-3 py-2 font-medium">Cant.</th>
                      <th className="text-right px-3 py-2 font-medium">Precio</th>
                      <th className="text-right px-3 py-2 font-medium">Subtotal</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoiceItems.map((item, idx) => {
                      const stock = item.variantId != null
                        ? stockByVariantId.get(item.variantId)
                        : item.productId != null ? stockByProductId.get(item.productId) : undefined;
                      return (
                      <tr key={item.id}>
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium">{item.productName}</div>
                          {(item.variantColor || item.variantSize) && (
                            <span className="flex items-center gap-1 mt-0.5">
                              {item.variantColor && (
                                <span
                                  className="inline-block w-2.5 h-2.5 rounded-full border border-border shrink-0"
                                  style={{ background: COLOR_HEX[item.variantColor] ?? "#ccc" }}
                                />
                              )}
                              <span className="text-xs text-muted-foreground">
                                {[item.variantColor, item.variantSize].filter(Boolean).join(" / ")}
                              </span>
                            </span>
                          )}
                          {item.description && (
                            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top text-center">
                          {stock == null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                              stock <= 5
                                ? "bg-red-100 text-red-700 border-red-200"
                                : "bg-muted text-muted-foreground border-border"
                            }`}>
                              <Package className="h-3 w-3" />
                              {stock}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <Input
                            type="number" min={1} value={item.editQty}
                            onChange={e => setInvoiceItems(prev => prev.map((it, i) =>
                              i === idx ? { ...it, editQty: Math.max(1, parseInt(e.target.value) || 1) } : it
                            ))}
                            className="h-8 w-16 text-center text-sm mx-auto"
                          />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <Input
                            type="number" min={0} step={1000} value={item.editPrice}
                            onChange={e => setInvoiceItems(prev => prev.map((it, i) =>
                              i === idx ? { ...it, editPrice: parseFloat(e.target.value) || 0 } : it
                            ))}
                            className="h-8 w-28 text-right text-sm ml-auto"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums align-top">
                          {fmt(item.editQty * item.editPrice)}
                        </td>
                        <td className="px-1 py-1.5 align-top text-center">
                          <Button
                            type="button" variant="ghost" size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setInvoiceItems(prev => prev.filter((_, i) => i !== idx))}
                            disabled={invoiceItems.length <= 1}
                            title="Eliminar artículo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Add product picker */}
              {showAddProduct ? (
                <div className="mt-2 border border-border rounded-lg p-3 bg-muted/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        autoFocus
                        placeholder="Buscar producto..."
                        value={addProductSearch}
                        onChange={e => setAddProductSearch(e.target.value)}
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => { setShowAddProduct(false); setAddProductSearch(""); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {addProductSearch.length > 0 && (() => {
                    const filtered = allProducts
                      .filter(p => p.name.toLowerCase().includes(addProductSearch.toLowerCase()))
                      .slice(0, 8);
                    if (filtered.length === 0)
                      return <p className="text-xs text-muted-foreground text-center py-2">Sin resultados</p>;
                    return (
                      <div className="space-y-1 max-h-56 overflow-y-auto">
                        {filtered.map(p => {
                          const variants = (p as any).variants ?? [];
                          const hasVariants = variants.length > 0;
                          const isExpanded = expandedProductId === p.id;
                          const allVariantsAdded = hasVariants && variants.every((v: any) => invoiceItems.some(i => i.variantId === v.id));
                          const alreadyAdded = !hasVariants && invoiceItems.some(i => i.productId === p.id && i.variantId == null);
                          const salePrice = parseFloat((p as any).salePrice ?? "0");

                          return (
                            <div key={p.id}>
                              {/* Product row */}
                              <button
                                type="button"
                                disabled={hasVariants ? allVariantsAdded : alreadyAdded}
                                onClick={() => {
                                  if (hasVariants) {
                                    setExpandedProductId(isExpanded ? null : p.id);
                                    return;
                                  }
                                  if (alreadyAdded) return;
                                  setInvoiceItems(prev => [...prev, {
                                    id: -(Date.now()),
                                    productId: p.id,
                                    productName: p.name,
                                    description: (p as any).description ?? null,
                                    qty: 1,
                                    unitPrice: salePrice,
                                    subtotal: salePrice,
                                    variantId: null,
                                    variantColor: null,
                                    variantSize: null,
                                    editQty: 1,
                                    editPrice: salePrice,
                                  }]);
                                  setAddProductSearch("");
                                  setShowAddProduct(false);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors text-left ${
                                  (hasVariants ? allVariantsAdded : alreadyAdded)
                                    ? "opacity-40 cursor-not-allowed"
                                    : "hover:bg-accent cursor-pointer"
                                } ${isExpanded ? "bg-accent/50" : ""}`}
                              >
                                <div>
                                  <span className="font-medium">{p.name}</span>
                                  {alreadyAdded && <span className="ml-2 text-xs text-muted-foreground">ya agregado</span>}
                                  {(p as any).description && (
                                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{(p as any).description}</div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-muted-foreground text-xs tabular-nums shrink-0">
                                  {!hasVariants && (
                                    <span className="flex items-center gap-1">
                                      <Package className="h-3 w-3" />{p.stock}
                                    </span>
                                  )}
                                  <span>{fmt(salePrice)}</span>
                                  {hasVariants && (
                                    <span className="text-xs text-muted-foreground ml-1">
                                      {isExpanded ? "▲" : "▼"} {variants.length} variantes
                                    </span>
                                  )}
                                </div>
                              </button>

                              {/* Variant rows */}
                              {hasVariants && isExpanded && (
                                <div className="ml-3 mt-0.5 space-y-0.5 border-l-2 border-border pl-2">
                                  {variants.map((v: any) => {
                                    const variantAdded = invoiceItems.some(i => i.variantId === v.id);
                                    return (
                                      <button
                                        key={v.id}
                                        type="button"
                                        disabled={variantAdded}
                                        onClick={() => {
                                          if (variantAdded) return;
                                          setInvoiceItems(prev => [...prev, {
                                            id: -(Date.now()),
                                            productId: p.id,
                                            productName: p.name,
                                            description: (p as any).description ?? null,
                                            qty: 1,
                                            unitPrice: salePrice,
                                            subtotal: salePrice,
                                            variantId: v.id,
                                            variantColor: v.color,
                                            variantSize: v.size,
                                            editQty: 1,
                                            editPrice: salePrice,
                                          }]);
                                          setAddProductSearch("");
                                          setShowAddProduct(false);
                                          setExpandedProductId(null);
                                        }}
                                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors text-left ${
                                          variantAdded
                                            ? "opacity-40 cursor-not-allowed"
                                            : "hover:bg-accent cursor-pointer"
                                        }`}
                                      >
                                        <span className="flex items-center gap-1.5">
                                          <span
                                            className="inline-block w-2.5 h-2.5 rounded-full border border-border shrink-0"
                                            style={{ background: COLOR_HEX[v.color] ?? "#ccc" }}
                                          />
                                          <span className="capitalize">{v.color}</span>
                                          {v.size && <span className="text-muted-foreground">/ {v.size}</span>}
                                          {variantAdded && <span className="text-muted-foreground">ya agregado</span>}
                                        </span>
                                        <span className="flex items-center gap-2 text-muted-foreground shrink-0">
                                          <span className={`flex items-center gap-1 ${v.stock <= 5 ? "text-red-600" : ""}`}>
                                            <Package className="h-3 w-3" />{v.stock}
                                          </span>
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <Button
                  type="button" variant="outline" size="sm"
                  className="mt-2 gap-2 w-full border-dashed text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAddProduct(true)}
                >
                  <Plus className="h-4 w-4" /> Agregar artículo
                </Button>
              )}
            </div>

            {/* Payment type */}
            <div>
              <p className="text-sm font-semibold mb-2">Método de pago</p>
              <Select value={paymentType} onValueChange={(v: PaymentType) => { setPaymentType(v); setAdvanceAmount(0); }}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Método de pago" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo / Transferencia</SelectItem>
                  <SelectItem value="credito">Crédito (15 días)</SelectItem>
                  <SelectItem value="datafono">Datáfono</SelectItem>
                  <SelectItem value="link">Link de pago</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Advance amount — only for credit payments */}
            {paymentType === "credito" && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Anticipo (opcional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    type="number" min={0} max={invoiceSubtotal} step={1000}
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(Math.max(0, Math.min(Number(e.target.value), invoiceSubtotal)))}
                    className="pl-7 h-9 text-sm"
                    placeholder="0"
                  />
                </div>
                {advanceAmount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Saldo pendiente: {fmt(invoiceSubtotal - advanceAmount)} · Vence en 15 días
                  </p>
                )}
              </div>
            )}


            {/* Total breakdown */}
            <div className="rounded-xl border border-border bg-card p-3.5 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{fmt(invoiceSubtotal)}</span>
              </div>
              {invoiceSurcharge > 0 && (
                <div className="flex justify-between text-amber-600 font-medium">
                  <span>Recargo {PAYMENT_LABELS[paymentType]}</span>
                  <span className="tabular-nums">+ {fmt(invoiceSurcharge)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-2 border-t border-border">
                <span>Total a cobrar</span>
                <span className="text-primary tabular-nums">{fmt(invoiceChargedTotal)}</span>
              </div>
              {paymentType === "credito" && advanceAmount > 0 && (
                <>
                  <div className="flex justify-between text-emerald-600 font-medium pt-1 border-t border-border">
                    <span>Anticipo</span>
                    <span className="tabular-nums">− {fmt(advanceAmount)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Saldo pendiente (15 días)</span>
                    <span className="tabular-nums">{fmt(invoiceSubtotal - advanceAmount)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setInvoiceOrder(null)} className="mr-auto">Cancelar</Button>
            <Button
              variant="outline"
              onClick={handleSaveOrder}
              disabled={isSaving || isInvoicing || invoiceItems.length === 0}
              className="gap-2"
            >
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : <><Save className="h-4 w-4" /> Guardar para después</>}
            </Button>
            <Button
              onClick={handleInvoice}
              disabled={isInvoicing || isSaving || invoiceItems.length === 0 || (paymentType === "credito" && !selectedCustomer)}
              className="gap-2"
            >
              {isInvoicing
                ? "Procesando..."
                : paymentType === "link"
                  ? <><CreditCard className="h-4 w-4" /> Facturar + link Bold</>
                  : <><Receipt className="h-4 w-4" /> Facturar</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create customer from order data ───────────────────────────────── */}
      <Dialog open={isCreatingCustomer} onOpenChange={setIsCreatingCustomer}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Nuevo Cliente
            </DialogTitle>
            <DialogDescription>
              Prellenado con la información que envió el cliente en su pedido.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCustomerSave} className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Cédula <span className="text-destructive">*</span></label>
              <Input name="cedula" placeholder="Número de cédula" required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombres <span className="text-destructive">*</span></label>
                <Input name="firstName" defaultValue={invoiceOrder?.customerName.split(" ")[0] ?? ""} placeholder="Nombres" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Apellidos <span className="text-destructive">*</span></label>
                <Input name="lastName" defaultValue={invoiceOrder?.customerName.split(" ").slice(1).join(" ") ?? ""} placeholder="Apellidos" required />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Correo Electrónico</label>
              <Input name="email" type="email" defaultValue={invoiceOrder?.customerEmail ?? ""} placeholder="correo@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Teléfono</label>
              <Input name="phone" type="tel" defaultValue={invoiceOrder?.customerPhone ?? ""} placeholder="300 000 0000" />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreatingCustomer(false)}>Cancelar</Button>
              <Button type="submit" disabled={createCustomer.isPending}>
                {createCustomer.isPending ? "Creando..." : "Crear cliente"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Cancel confirmation ────────────────────────────────────────────── */}
      <Dialog open={!!cancelOrderId} onOpenChange={open => { if (!open) setCancelOrderId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cancelar pedido #{cancelOrderId}?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. El cliente no recibirá notificación automática.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelOrderId(null)}>Volver</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isCancelling}>
              {isCancelling ? "Cancelando..." : "Sí, cancelar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bold link result dialog ────────────────────────────────────────── */}
      <Dialog open={!!boldResult} onOpenChange={open => { if (!open) setBoldResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Link de pago generado
            </DialogTitle>
            <DialogDescription>
              Factura #{boldResult?.saleId} creada. Comparte este link con el cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-2">
              <Input
                value={boldResult?.url ?? ""}
                readOnly
                className="text-xs font-mono bg-muted"
              />
              <Button variant="outline" size="icon" onClick={() => copyLink(boldResult?.url ?? "")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {!!boldResult?.fee && (
              <p className="text-xs text-muted-foreground">
                Incluye {fmt(boldResult.fee)} de recargo bold
              </p>
            )}
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Hola! Tu link de pago es: ${boldResult?.url ?? ""}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-[#25D366] hover:bg-[#20bf5b] text-white text-sm font-semibold transition-colors"
            >
              Compartir por WhatsApp
            </a>
          </div>
          <DialogFooter>
            <Button onClick={() => setBoldResult(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
}
