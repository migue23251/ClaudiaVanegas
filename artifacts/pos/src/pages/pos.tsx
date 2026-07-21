import { useState, useMemo } from "react";
import {
  useListProducts, getListProductsQueryKey,
  useListCustomers, getListCustomersQueryKey,
  useCreateSale, useUpdateCustomer, useCreateCustomer,
  Product, ProductVariant, Customer, CustomerInput
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

const COLOR_HEX: Record<string, string> = {
  blanco: "#FFFFFF", negro: "#111111", gris: "#9CA3AF", beige: "#D4B896", crema: "#FFF8E7",
  rojo: "#EF4444", rosa: "#F9A8D4", fucsia: "#EC4899", naranja: "#F97316", amarillo: "#FACC15",
  verde: "#22C55E", azul: "#3B82F6", morado: "#A855F7", vinotinto: "#7F1D1D", café: "#78350F",
  multicolor: "#E879F9",
};

// Cart item keyed by productId + variantId so same product with different variants can coexist
interface CartItem {
  cartKey: string;          // `${productId}-${variantId ?? "none"}`
  productId: number;
  variantId?: number;
  variantColor?: string;
  variantSize?: string;
  variantSku?: string;
  variantStock?: number;    // max available for this variant
  name: string;
  code: string;
  description?: string | null;
  images?: string[];
  stock: number;            // total product stock (for simple products)
  salePrice: number;
  cartQty: number;
  cartPrice: number;
}

function makeCartKey(productId: number, variantId?: number) {
  return `${productId}-${variantId ?? "none"}`;
}

function maxStock(item: CartItem) {
  return item.variantId !== undefined ? (item.variantStock ?? 0) : item.stock;
}

export default function Pos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType>("efectivo");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [mobileTab, setMobileTab] = useState<"products" | "cart">("products");

  // Variant picker
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);
  const [pickerColor, setPickerColor] = useState<string | null>(null);
  const [pickerSize, setPickerSize] = useState<string | null>(null);

  // Bold link state
  const [boldLinkOpen, setBoldLinkOpen] = useState(false);
  const [boldLinkUrl, setBoldLinkUrl] = useState<string | null>(null);
  const [boldLinkFee, setBoldLinkFee] = useState(0);
  const [boldLinkError, setBoldLinkError] = useState<string | null>(null);

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

  // ── Variant picker helpers ──────────────────────────────────────────────────

  const availableColors = useMemo(() => {
    if (!variantPickerProduct?.variants) return [];
    return [...new Set(variantPickerProduct.variants.map(v => v.color))];
  }, [variantPickerProduct]);

  const availableSizes = useMemo(() => {
    if (!variantPickerProduct?.variants || !pickerColor) return [];
    return variantPickerProduct.variants
      .filter(v => v.color === pickerColor && v.size)
      .map(v => v.size!);
  }, [variantPickerProduct, pickerColor]);

  const hasSizes = availableSizes.length > 0;

  const selectedVariant = useMemo((): ProductVariant | null => {
    if (!variantPickerProduct?.variants || !pickerColor) return null;
    if (hasSizes && pickerSize)
      return variantPickerProduct.variants.find(v => v.color === pickerColor && v.size === pickerSize) ?? null;
    if (!hasSizes)
      return variantPickerProduct.variants.find(v => v.color === pickerColor) ?? null;
    return null;
  }, [variantPickerProduct, pickerColor, pickerSize, hasSizes]);

  const openVariantPicker = (product: Product) => {
    setVariantPickerProduct(product);
    setPickerColor(null);
    setPickerSize(null);
  };

  const confirmVariantAdd = () => {
    if (!variantPickerProduct || !selectedVariant) return;
    if (selectedVariant.stock <= 0) {
      toast({ title: "Esta variante no tiene stock disponible", variant: "destructive" });
      return;
    }
    addToCartDirectly(variantPickerProduct, selectedVariant);
    setVariantPickerProduct(null);
  };

  // ── Cart operations ────────────────────────────────────────────────────────

  const addToCart = (product: Product) => {
    if (product.variants && product.variants.length > 0) {
      openVariantPicker(product);
      return;
    }
    addToCartDirectly(product, undefined);
  };

  const addToCartDirectly = (product: Product, variant?: ProductVariant) => {
    const cartKey = makeCartKey(product.id, variant?.id);
    const stockAvailable = variant ? variant.stock : product.stock;

    setCart(prev => {
      const existing = prev.find(p => p.cartKey === cartKey);
      if (existing) {
        if (existing.cartQty >= stockAvailable) {
          toast({ title: "Stock insuficiente", variant: "destructive" });
          return prev;
        }
        return prev.map(p => p.cartKey === cartKey ? { ...p, cartQty: p.cartQty + 1 } : p);
      }
      if (stockAvailable <= 0) {
        toast({ title: "Producto sin stock", variant: "destructive" });
        return prev;
      }
      const newItem: CartItem = {
        cartKey,
        productId: product.id,
        variantId: variant?.id,
        variantColor: variant?.color,
        variantSize: variant?.size,
        variantSku: variant?.sku,
        variantStock: variant?.stock,
        name: product.name,
        code: product.code,
        description: product.description,
        images: product.images,
        stock: product.stock,
        salePrice: product.salePrice,
        cartQty: 1,
        cartPrice: product.salePrice,
      };
      return [...prev, newItem];
    });
  };

  const updateCartQty = (cartKey: string, delta: number) => {
    setCart(prev => prev.map(p => {
      if (p.cartKey !== cartKey) return p;
      const newQty = p.cartQty + delta;
      if (newQty < 1) return p;
      if (newQty > maxStock(p)) {
        toast({ title: "Stock máximo alcanzado", variant: "destructive" });
        return p;
      }
      return { ...p, cartQty: newQty };
    }));
  };

  const updateCartPrice = (cartKey: string, price: number) => {
    setCart(prev => prev.map(p => p.cartKey === cartKey ? { ...p, cartPrice: price } : p));
  };

  const removeFromCart = (cartKey: string) => {
    setCart(prev => prev.filter(p => p.cartKey !== cartKey));
  };

  const total = useMemo(() => cart.reduce((acc, item) => acc + (item.cartQty * item.cartPrice), 0), [cart]);
  const chargedTotal = useMemo(() => calcChargedTotal(total, paymentType), [total, paymentType]);
  const surcharge = chargedTotal - total;

  const resetCart = () => {
    setCart([]);
    setSelectedCustomer(null);
    setCustomerSearch("");
    setSearchTerm("");
    setPaymentType("efectivo");
    setAdvanceAmount(0);
    setMobileTab("products");
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
        chargedAmount: surcharge > 0 ? chargedTotal : undefined,
        items: cart.map(item => ({
          productId: item.productId,
          variantId: item.variantId,
          qty: item.cartQty,
          unitPrice: item.cartPrice,
        }))
      } as any
    }, {
      onSuccess: (result: any) => {
        const hasLink = !!(result?.paymentLink);
        const hasBoldError = !!(result?.boldError);
        if (hasLink) {
          setBoldLinkUrl(result.paymentLink);
          setBoldLinkFee(result.boldFee ? parseFloat(String(result.boldFee)) : 0);
          setBoldLinkError(null);
          setBoldLinkOpen(true);
          toast({ title: "Venta registrada y link de pago generado", className: "bg-emerald-500 text-white border-none" });
        } else if (hasBoldError) {
          setBoldLinkUrl(null);
          setBoldLinkError(result.boldError);
          setBoldLinkOpen(true);
          toast({ title: "Venta registrada, pero el link Bold falló", variant: "destructive" });
        } else {
          toast({ title: "Venta registrada con éxito", className: "bg-emerald-500 text-white border-none" });
        }
        resetCart();
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Error registrando la venta", description: err?.response?.data?.error ?? err.message, variant: "destructive" });
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
              {/* Color swatches for variants */}
              {product.variants && product.variants.length > 0 && (
                <div className="flex gap-0.5 mb-1 flex-wrap">
                  {[...new Set(product.variants.map(v => v.color))].slice(0, 6).map(color => (
                    <span key={color} className="w-2.5 h-2.5 rounded-full border border-border" style={{ background: COLOR_HEX[color] ?? "#ccc" }} title={color} />
                  ))}
                </div>
              )}
              <div className="flex justify-between items-end gap-1">
                <span className="font-serif font-bold text-primary text-sm leading-none">{formatCurrency(product.salePrice)}</span>
                {product.variants && product.variants.length > 0 ? (
                  <Badge variant="secondary" className="text-[9px] h-4 px-1">Variantes</Badge>
                ) : (
                  <span className={`text-[10px] shrink-0 ${product.stock > 0 ? "text-muted-foreground" : "text-destructive font-semibold"}`}>
                    ×{product.stock}
                  </span>
                )}
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
            <div key={item.cartKey} className="flex flex-col gap-2 p-3 border rounded-lg bg-background">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm leading-tight truncate">{item.name}</p>
                  {item.variantColor && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-2.5 h-2.5 rounded-full border" style={{ background: COLOR_HEX[item.variantColor] ?? "#ccc" }} />
                      <span className="text-xs text-muted-foreground capitalize">{item.variantColor} / {item.variantSize}</span>
                    </div>
                  )}
                  {!item.variantColor && item.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 leading-tight">{item.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground font-mono">{item.variantSku ?? item.code}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeFromCart(item.cartKey)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5 border rounded-md p-0.5">
                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-sm" onClick={() => updateCartQty(item.cartKey, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="text-sm font-semibold w-5 text-center tabular-nums">{item.cartQty}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-sm" onClick={() => updateCartQty(item.cartKey, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <Input
                  type="number"
                  value={item.cartPrice}
                  onChange={(e) => updateCartPrice(item.cartKey, Number(e.target.value))}
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
          <Select value={paymentType} onValueChange={(v: PaymentType) => { setPaymentType(v); setAdvanceAmount(0); }}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Método de pago" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="efectivo">Efectivo / Transferencia</SelectItem>
              <SelectItem value="credito">Crédito</SelectItem>
              <SelectItem value="datafono">Datáfono</SelectItem>
              <SelectItem value="link">Link de pago</SelectItem>
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

          {surcharge > 0 ? (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between text-amber-600 font-medium">
                <span>Recargo {PAYMENT_LABELS[paymentType]}</span>
                <span className="tabular-nums">+ {formatCurrency(surcharge)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-border">
                <span className="font-semibold">Total a cobrar</span>
                <span className="text-2xl font-serif font-bold text-primary tabular-nums">
                  {formatCurrency(chargedTotal)}
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
              : paymentType === "link"
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

      {/* Variant Picker Dialog */}
      <Dialog open={!!variantPickerProduct} onOpenChange={(open) => { if (!open) setVariantPickerProduct(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="leading-tight">{variantPickerProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Color selection */}
            <div className="space-y-2.5">
              <label className="text-sm font-semibold">Color</label>
              <div className="flex flex-wrap gap-2">
                {availableColors.map(color => (
                  <button
                    key={color}
                    onClick={() => { setPickerColor(color); setPickerSize(null); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                      pickerColor === color
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full border border-white/50" style={{ background: COLOR_HEX[color] ?? "#ccc" }} />
                    <span className="capitalize">{color}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Size selection (solo cuando el color elegido tiene tallas reales) */}
            {pickerColor && hasSizes && (
              <div className="space-y-2.5">
                <label className="text-sm font-semibold">Talla</label>
                <div className="flex flex-wrap gap-2">
                  {availableSizes.map(size => {
                    const v = variantPickerProduct?.variants?.find(v => v.color === pickerColor && v.size === size);
                    const outOfStock = !v || v.stock <= 0;
                    return (
                      <button
                        key={size}
                        onClick={() => !outOfStock && setPickerSize(size)}
                        disabled={outOfStock}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          pickerSize === size
                            ? "border-primary bg-primary text-primary-foreground"
                            : outOfStock
                              ? "border-border text-muted-foreground opacity-40 cursor-not-allowed line-through"
                              : "border-border hover:border-primary/50"
                        }`}
                      >
                        {size}
                        {!outOfStock && v && <span className="ml-1 text-muted-foreground">({v.stock})</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selected variant info */}
            {selectedVariant && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg text-sm">
                <span className="w-4 h-4 rounded-full border" style={{ background: COLOR_HEX[selectedVariant.color] ?? "#ccc" }} />
                <div>
                  <span className="font-medium capitalize">{selectedVariant.color}{selectedVariant.size ? ` / ${selectedVariant.size}` : ""}</span>
                  <span className="text-muted-foreground ml-2">— {selectedVariant.stock} disponibles</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVariantPickerProduct(null)}>Cancelar</Button>
            <Button onClick={confirmVariantAdd} disabled={!selectedVariant}>
              <Plus className="h-4 w-4 mr-1.5" /> Agregar al carrito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      <Dialog open={boldLinkOpen} onOpenChange={(open) => { setBoldLinkOpen(open); if (!open) { setBoldLinkUrl(null); setBoldLinkError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {boldLinkError ? (
                <><span className="h-5 w-5 text-destructive">⚠️</span>Error al generar link Bold</>
              ) : (
                <><CheckCircle2 className="h-5 w-5 text-emerald-500" />Link de pago Bold generado</>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {boldLinkError ? (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-sm space-y-1">
                <p className="font-semibold text-destructive">La venta se registró correctamente, pero no se pudo generar el link de pago.</p>
                <p className="text-muted-foreground font-mono text-xs break-all">{boldLinkError}</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Comparte este link con el cliente para que realice el pago en línea.</p>
                <div className="flex gap-2">
                  <Input value={boldLinkUrl ?? ""} readOnly className="text-xs font-mono bg-muted" />
                  <Button variant="outline" size="icon" onClick={copyBoldLink} title="Copiar link">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {boldLinkFee > 0 && (
                  <p className="text-xs text-muted-foreground">Incluye {formatCurrency(boldLinkFee)} de recargo bold</p>
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
              </>
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
