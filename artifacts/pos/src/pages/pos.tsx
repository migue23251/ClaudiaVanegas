import { useState, useMemo } from "react";
import {
  useListProducts, getListProductsQueryKey,
  useListCustomers, getListCustomersQueryKey,
  useCreateSale, useUpdateCustomer, useCreateCustomer,
  Product, Customer, CustomerInput
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Search, ShoppingCart, Plus, Minus, Trash2, UserSearch, Receipt,
  ShoppingBag, Edit, X, UserPlus, Package, CreditCard, Copy, CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const BOLD_FEE_RATE = 0.05;

interface CartItem extends Product {
  cartQty: number;
  cartPrice: number;
}

export default function Pos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState<"contado" | "credito">("contado");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [mobileTab, setMobileTab] = useState<"products" | "cart">("products");

  // Bold link state
  const [useBoldLink, setUseBoldLink] = useState(false);
  const [boldLinkOpen, setBoldLinkOpen] = useState(false);
  const [boldLinkUrl, setBoldLinkUrl] = useState<string | null>(null);
  const [boldFeeAmount, setBoldFeeAmount] = useState(0);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products } = useListProducts(
    { search: searchTerm },
    { query: { queryKey: getListProductsQueryKey({ search: searchTerm }) } }
  );

  const { data: customers } = useListCustomers(
    { search: customerSearch },
    { query: { queryKey: getListCustomersQueryKey({ search: customerSearch }) } }
  );

  const createSale = useCreateSale();
  const updateCustomer = useUpdateCustomer();
  const createCustomer = useCreateCustomer();

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  // ── Cart operations ────────────────────────────────────────────────────────

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(p => p.id === product.id);
      if (existing) {
        if (existing.cartQty >= product.stock) {
          toast({ title: "Stock insuficiente", variant: "destructive" });
          return prev;
        }
        return prev.map(p => p.id === product.id ? { ...p, cartQty: p.cartQty + 1 } : p);
      }
      if (product.stock <= 0) {
        toast({ title: "Producto sin stock", variant: "destructive" });
        return prev;
      }
      return [...prev, { ...product, cartQty: 1, cartPrice: product.salePrice }];
    });
  };

  const updateCartQty = (id: number, delta: number) => {
    setCart(prev => prev.map(p => {
      if (p.id !== id) return p;
      const newQty = p.cartQty + delta;
      if (newQty < 1) return p;
      if (newQty > p.stock) {
        toast({ title: "Stock máximo alcanzado", variant: "destructive" });
        return p;
      }
      return { ...p, cartQty: newQty };
    }));
  };

  const updateCartPrice = (id: number, price: number) => {
    setCart(prev => prev.map(p => p.id === id ? { ...p, cartPrice: price } : p));
  };

  const removeFromCart = (id: number) => {
    setCart(prev => prev.filter(p => p.id !== id));
  };

  const total = useMemo(() => cart.reduce((acc, item) => acc + (item.cartQty * item.cartPrice), 0), [cart]);
  const boldFee = useBoldLink ? Math.round(total * BOLD_FEE_RATE) : 0;
  const totalWithBold = total + boldFee;

  const resetCart = () => {
    setCart([]);
    setSelectedCustomer(null);
    setCustomerSearch("");
    setSearchTerm("");
    setPaymentType("contado");
    setAdvanceAmount(0);
    setMobileTab("products");
    setUseBoldLink(false);
    setBoldLinkUrl(null);
  };

  // ── Checkout ───────────────────────────────────────────────────────────────

  const handleCheckout = () => {
    if (cart.length === 0) return;
    if (paymentType === "credito" && !selectedCustomer) {
      toast({ title: "Seleccione un cliente para ventas a crédito", variant: "destructive" });
      return;
    }
    const advance = paymentType === "credito" ? Math.max(0, Math.min(advanceAmount, total)) : 0;

    createSale.mutate({
      data: {
        customerId: selectedCustomer?.id,
        paymentType,
        advanceAmount: advance > 0 ? advance : undefined,
        withBoldLink: useBoldLink || undefined,
        items: cart.map(item => ({
          productId: item.id,
          qty: item.cartQty,
          unitPrice: item.cartPrice
        }))
      } as any
    }, {
      onSuccess: (result: any) => {
        const hasLink = !!(result?.paymentLink);
        if (hasLink) {
          setBoldLinkUrl(result.paymentLink);
          setBoldFeeAmount(result.boldFee ? parseFloat(String(result.boldFee)) : 0);
          setBoldLinkOpen(true);
          toast({ title: "Venta registrada y link de pago generado", className: "bg-emerald-500 text-white border-none" });
        } else {
          toast({ title: "Venta registrada con éxito", className: "bg-emerald-500 text-white border-none" });
        }
        resetCart();
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Error registrando la venta", description: err.message, variant: "destructive" });
      }
    });
  };

  // ── Edit customer ──────────────────────────────────────────────────────────

  const handleEditCustomerSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const formData = new FormData(e.currentTarget);
    updateCustomer.mutate({
      id: selectedCustomer.id,
      data: {
        cedula: formData.get("cedula") as string,
        firstName: formData.get("firstName") as string,
        lastName: formData.get("lastName") as string,
        email: formData.get("email") as string,
        phone: formData.get("phone") as string,
      } as CustomerInput
    }, {
      onSuccess: (updated) => {
        setSelectedCustomer(updated);
        setIsEditingCustomer(false);
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        toast({ title: "Cliente actualizado" });
      }
    });
  };

  // ── Create customer ────────────────────────────────────────────────────────

  const handleCreateCustomerSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createCustomer.mutate({
      data: {
        cedula: formData.get("cedula") as string,
        firstName: formData.get("firstName") as string,
        lastName: formData.get("lastName") as string,
        email: formData.get("email") as string,
        phone: formData.get("phone") as string,
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

  const copyBoldLink = () => {
    if (boldLinkUrl) {
      navigator.clipboard.writeText(boldLinkUrl);
      toast({ title: "Link copiado" });
    }
  };

  // ── Panels ─────────────────────────────────────────────────────────────────

  const productsPanel = (
    <div className={`flex-1 flex flex-col gap-4 min-h-0 ${mobileTab === "cart" ? "hidden lg:flex" : "flex"}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar productos (código, nombre)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-12 text-base bg-card"
        />
      </div>

      <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {products?.map(product => (
          <Card
            key={product.id}
            className="cursor-pointer hover-elevate transition-all border-transparent hover:border-primary"
            onClick={() => addToCart(product)}
          >
            <div className="aspect-square w-full bg-muted rounded-t-xl overflow-hidden flex items-center justify-center">
              {product.images && product.images[0] ? (
                <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <Package className="h-7 w-7 text-muted-foreground/30" />
              )}
            </div>
            <CardContent className="p-2.5">
              <div className="text-[10px] text-muted-foreground mb-0.5 font-mono leading-none">{product.code}</div>
              <h3 className="font-semibold text-xs line-clamp-2 leading-tight mb-0.5 min-h-[2rem]">{product.name}</h3>
              {product.description && <p className="text-[10px] text-muted-foreground line-clamp-1 mb-1 leading-tight">{product.description}</p>}
              <div className="flex justify-between items-end gap-1">
                <span className="font-serif font-bold text-primary text-sm leading-none">{formatCurrency(product.salePrice)}</span>
                <span className={`text-[10px] shrink-0 ${product.stock > 0 ? "text-muted-foreground" : "text-destructive font-semibold"}`}>
                  ×{product.stock}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
        {products?.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            No se encontraron productos
          </div>
        )}
      </div>
    </div>
  );

  const cartPanel = (
    <div className={`flex flex-col gap-3 lg:w-96 min-h-0 ${mobileTab === "products" ? "hidden lg:flex" : "flex flex-1"}`}>
      {/* Customer */}
      <Card className="bg-card shrink-0">
        <CardContent className="p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <UserSearch className="h-4 w-4 text-primary shrink-0" />
            <h3 className="font-medium text-sm">Cliente</h3>
          </div>
          {selectedCustomer ? (
            <div className="flex items-center justify-between bg-accent p-3 rounded-md">
              <div className="min-w-0">
                <p className="font-medium text-sm">{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                <p className="text-xs text-muted-foreground font-mono">CC: {selectedCustomer.cedula}</p>
                <p className="text-xs text-muted-foreground font-mono">📱 {selectedCustomer.phone ?? "—"}</p>
                {selectedCustomer.email && (
                  <p className="text-xs text-muted-foreground truncate">{selectedCustomer.email}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsEditingCustomer(true)} title="Editar cliente">
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedCustomer(null); setAdvanceAmount(0); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
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
                      onClick={() => { setIsCreatingCustomer(true); }}
                    >
                      <UserPlus className="h-4 w-4" />
                      Crear cliente "{customerSearch}"
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cart items */}
      <Card className="flex-1 flex flex-col overflow-hidden bg-card min-h-0">
        <div className="p-3 border-b flex justify-between items-center bg-muted/30 shrink-0">
          <h3 className="font-serif font-bold flex items-center gap-2 text-sm">
            <ShoppingCart className="h-4 w-4" /> Orden Actual
          </h3>
          <Badge variant="secondary" className="text-xs">{cart.length} items</Badge>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
          {cart.map(item => (
            <div key={item.id} className="flex flex-col gap-2 p-3 border rounded-lg bg-background">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm leading-tight truncate">{item.name}</p>
                  {item.description && <p className="text-xs text-muted-foreground line-clamp-1 leading-tight">{item.description}</p>}
                  <p className="text-xs text-muted-foreground font-mono">{item.code}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeFromCart(item.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5 border rounded-md p-0.5">
                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-sm" onClick={() => updateCartQty(item.id, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="text-sm font-semibold w-5 text-center tabular-nums">{item.cartQty}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-sm" onClick={() => updateCartQty(item.id, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <Input
                  type="number"
                  value={item.cartPrice}
                  onChange={(e) => updateCartPrice(item.id, Number(e.target.value))}
                  className="w-28 h-8 text-right font-serif text-sm"
                />
              </div>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 space-y-3 py-10">
              <Receipt className="h-10 w-10" />
              <p className="text-sm">Carrito vacío</p>
            </div>
          )}
        </div>

        {/* Payment footer */}
        <div className="p-3 border-t bg-muted/30 space-y-3 shrink-0">
          <Select value={paymentType} onValueChange={(v: "contado" | "credito") => { setPaymentType(v); setAdvanceAmount(0); if (v === "credito") setUseBoldLink(false); }}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Tipo de Pago" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contado">Contado</SelectItem>
              <SelectItem value="credito">Crédito</SelectItem>
            </SelectContent>
          </Select>

          {paymentType === "credito" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Anticipo (opcional)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  type="number" min={0} max={total} step={1000}
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(Math.max(0, Math.min(Number(e.target.value), total)))}
                  className="pl-7 h-9 font-serif text-sm"
                  placeholder="0"
                />
              </div>
              {advanceAmount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Saldo: {formatCurrency(total - advanceAmount)} · Vence en 15 días
                </p>
              )}
            </div>
          )}

          {/* Bold link toggle — only for cash (contado) payments */}
          {paymentType === "contado" && (
            <div
              className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                useBoldLink ? "border-primary bg-primary/5" : "border-border bg-background"
              }`}
              onClick={() => setUseBoldLink(!useBoldLink)}
            >
              <div>
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-primary" />
                  Link de pago Bold
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">+5% comisión</p>
              </div>
              <div className={`relative h-5 w-9 rounded-full transition-colors ${useBoldLink ? "bg-primary" : "bg-muted"}`}>
                <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${useBoldLink ? "translate-x-4" : ""}`} />
              </div>
            </div>
          )}

          {/* Totals */}
          {useBoldLink ? (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between text-amber-600 font-medium">
                <span>Comisión Bold (5%)</span>
                <span className="tabular-nums">+ {formatCurrency(boldFee)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-border">
                <span className="font-semibold">Total</span>
                <span className="text-2xl font-serif font-bold text-primary tabular-nums">
                  {formatCurrency(totalWithBold)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">Total</span>
              <span className="text-2xl font-serif font-bold text-primary">{formatCurrency(total)}</span>
            </div>
          )}

          <Button
            className="w-full h-12 text-base font-bold"
            onClick={handleCheckout}
            disabled={cart.length === 0 || createSale.isPending}
          >
            {createSale.isPending
              ? "Procesando..."
              : useBoldLink
                ? <span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Cobrar + link Bold</span>
                : "Cobrar"
            }
          </Button>
        </div>
      </Card>
    </div>
  );

  return (
    <>
      {/* Mobile tab bar */}
      <div className="lg:hidden flex rounded-xl border border-border bg-card overflow-hidden mb-3 shrink-0">
        <button
          onClick={() => setMobileTab("products")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
            mobileTab === "products"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <ShoppingBag className="h-4 w-4" />
          Productos
        </button>
        <button
          onClick={() => setMobileTab("cart")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors relative ${
            mobileTab === "cart"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          Carrito
          {cart.length > 0 && (
            <span className={`flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-[10px] font-bold ${
              mobileTab === "cart" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary text-primary-foreground"
            }`}>
              {cart.length}
            </span>
          )}
        </button>
      </div>

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-[calc(100dvh-150px)] lg:h-[calc(100dvh-64px)]">
        {productsPanel}
        {cartPanel}
      </div>

      {/* Floating cart hint on mobile */}
      {mobileTab === "products" && cart.length > 0 && (
        <button
          className="lg:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-30 bg-primary text-primary-foreground rounded-full px-5 py-3 shadow-xl flex items-center gap-2.5 text-sm font-semibold active:scale-95 transition-transform"
          onClick={() => setMobileTab("cart")}
        >
          <ShoppingCart className="h-4 w-4" />
          {cart.length} {cart.length === 1 ? "producto" : "productos"} · {formatCurrency(total)}
        </button>
      )}

      {/* Edit Customer Dialog */}
      <Dialog open={isEditingCustomer} onOpenChange={setIsEditingCustomer}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditCustomerSave} className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Cédula</label>
              <Input name="cedula" defaultValue={selectedCustomer?.cedula} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombres</label>
                <Input name="firstName" defaultValue={selectedCustomer?.firstName} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Apellidos</label>
                <Input name="lastName" defaultValue={selectedCustomer?.lastName} required />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Correo Electrónico</label>
              <Input name="email" type="email" defaultValue={selectedCustomer?.email ?? ""} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Celular</label>
              <Input name="phone" type="tel" defaultValue={selectedCustomer?.phone ?? ""} placeholder="300 000 0000" />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsEditingCustomer(false)}>Cancelar</Button>
              <Button type="submit" disabled={updateCustomer.isPending}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Customer Dialog */}
      <Dialog open={isCreatingCustomer} onOpenChange={(open) => { setIsCreatingCustomer(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Nuevo Cliente
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateCustomerSave} className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Cédula <span className="text-destructive">*</span></label>
              <Input name="cedula" defaultValue={/^\d+$/.test(customerSearch) ? customerSearch : ""} placeholder="Número de cédula" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombres <span className="text-destructive">*</span></label>
                <Input name="firstName" defaultValue={!/^\d+$/.test(customerSearch) ? customerSearch.split(" ")[0] : ""} placeholder="Nombres" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Apellidos <span className="text-destructive">*</span></label>
                <Input name="lastName" defaultValue={!/^\d+$/.test(customerSearch) ? customerSearch.split(" ").slice(1).join(" ") : ""} placeholder="Apellidos" required />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Correo Electrónico</label>
              <Input name="email" type="email" placeholder="correo@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Teléfono</label>
              <Input name="phone" type="tel" placeholder="300 000 0000" />
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

      {/* Bold payment link result dialog */}
      <Dialog open={boldLinkOpen} onOpenChange={setBoldLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Link de pago Bold generado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Comparte este link con el cliente para que realice el pago en línea.
            </p>
            <div className="flex gap-2">
              <Input value={boldLinkUrl ?? ""} readOnly className="text-xs font-mono bg-muted" />
              <Button variant="outline" size="icon" onClick={copyBoldLink} title="Copiar link">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {boldFeeAmount > 0 && (
              <p className="text-xs text-muted-foreground">
                Incluye {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(boldFeeAmount)} de comisión Bold (5%)
              </p>
            )}
            {boldLinkUrl && (
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Aquí está tu link de pago: ${boldLinkUrl}`)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-[#25D366] hover:bg-[#20bf5b] text-white text-sm font-semibold transition-colors"
              >
                Compartir por WhatsApp
              </a>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setBoldLinkOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
