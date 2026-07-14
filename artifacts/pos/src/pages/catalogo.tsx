import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ShoppingBag, ChevronLeft, ChevronRight, Tag,
  Phone, MapPin, X, ZoomIn, ShoppingCart, Plus, Minus, Trash2,
  CheckCircle2, ArrowLeft, Instagram, Music2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { applyBrandColor } from "@/lib/brand-color";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoreInfo {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  phone: string | null;
  address: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
}

interface CatalogProduct {
  id: number;
  name: string;
  description: string | null;
  salePrice: number;
  category: string;
  images: string[];
}

interface CatalogData {
  store: StoreInfo;
  categories: string[];
  products: CatalogProduct[];
}

interface CartItem {
  productId: number;
  productName: string;
  description: string | null;
  unitPrice: number;
  qty: number;
  image: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  blusas: "Blusas", jeans: "Jeans", vestidos: "Vestidos",
  conjuntos: "Conjuntos", faldas: "Faldas", chaquetas: "Chaquetas",
  zapatos: "Zapatos", bolsos: "Bolsos", accesorios: "Accesorios",
};

/** WhatsApp glyph — lucide-react has no brand icons, so it's inlined here. */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12.004 2.003c-5.514 0-9.997 4.483-9.997 9.997 0 1.762.462 3.484 1.34 5.003l-1.424 5.198a.75.75 0 0 0 .918.918l5.198-1.424a9.94 9.94 0 0 0 3.965.822c5.514 0 9.997-4.483 9.997-9.997 0-5.514-4.483-9.997-9.997-9.997zm0 18.244a8.21 8.21 0 0 1-4.19-1.15.75.75 0 0 0-.577-.078l-3.79 1.038 1.038-3.79a.75.75 0 0 0-.078-.577 8.21 8.21 0 0 1-1.15-4.19c0-4.549 3.7-8.248 8.247-8.248 4.548 0 8.247 3.699 8.247 8.248 0 4.548-3.699 8.247-8.247 8.247z"/>
    </svg>
  );
}

/** Builds a wa.me link for a Colombian number, always prefixing the +57 country code. */
function toWhatsAppLink(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("57") ? digits.slice(2) : digits;
  const url = `https://wa.me/57${local}`;
  return text ? `${url}?text=${encodeURIComponent(text)}` : url;
}

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%23f3f4f6'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='64' fill='%23d1d5db'%3E👗%3C/text%3E%3C/svg%3E";

// ─── Image carousel ───────────────────────────────────────────────────────────

function Carousel({
  images,
  name,
  aspectClass = "aspect-[3/4]",
  large = false,
}: {
  images: string[];
  name: string;
  aspectClass?: string;
  large?: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const srcs = images.length > 0 ? images : [PLACEHOLDER];
  const multi = srcs.length > 1;

  const prev = (e: React.MouseEvent) => { e.stopPropagation(); setIdx(i => (i - 1 + srcs.length) % srcs.length); };
  const next = (e: React.MouseEvent) => { e.stopPropagation(); setIdx(i => (i + 1) % srcs.length); };

  return (
    <div className={`relative ${aspectClass} overflow-hidden bg-muted group/img`}>
      <img
        src={srcs[idx]} alt={name}
        className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105"
        onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
      />
      {multi && (
        <>
          <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity">
            <ChevronLeft className={large ? "w-5 h-5" : "w-4 h-4"} />
          </button>
          <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity">
            <ChevronRight className={large ? "w-5 h-5" : "w-4 h-4"} />
          </button>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
            {srcs.map((_, i) => (
              <button key={i} onClick={e => { e.stopPropagation(); setIdx(i); }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? "bg-white scale-125" : "bg-white/50"}`} />
            ))}
          </div>
          <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
            {idx + 1}/{srcs.length}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Product detail modal ─────────────────────────────────────────────────────

function ProductModal({
  product,
  onClose,
  onAddToCart,
  cartQty,
}: {
  product: CatalogProduct;
  onClose: () => void;
  onAddToCart: (product: CatalogProduct) => void;
  cartQty: number;
}) {
  const srcs = product.images.length > 0 ? product.images : [PLACEHOLDER];
  const [mainIdx, setMainIdx] = useState(0);

  const prev = useCallback(() => setMainIdx(i => (i - 1 + srcs.length) % srcs.length), [srcs.length]);
  const next = useCallback(() => setMainIdx(i => (i + 1) % srcs.length), [srcs.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [prev, next]);

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden rounded-2xl gap-0">
        <div className="flex flex-col md:flex-row max-h-[90vh]">
          {/* Left: images */}
          <div className="md:w-1/2 bg-muted flex flex-col">
            <div className="relative flex-1 min-h-0 overflow-hidden group/main" style={{ maxHeight: "60vh" }}>
              <img
                src={srcs[mainIdx]} alt={product.name}
                className="w-full h-full object-contain"
                onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
              />
              {srcs.length > 1 && (
                <>
                  <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-2 opacity-0 group-hover/main:opacity-100 transition-opacity">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-2 opacity-0 group-hover/main:opacity-100 transition-opacity">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-3 left-0 right-0 text-center">
                    <span className="text-white text-xs bg-black/30 px-3 py-1 rounded-full">
                      {mainIdx + 1} / {srcs.length}
                    </span>
                  </div>
                </>
              )}
            </div>
            {srcs.length > 1 && (
              <div className="flex gap-2 p-3 overflow-x-auto bg-muted/50 border-t border-border">
                {srcs.map((src, i) => (
                  <button key={i} onClick={() => setMainIdx(i)}
                    className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                      i === mainIdx ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: info */}
          <div className="md:w-1/2 flex flex-col p-6 overflow-y-auto gap-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold leading-tight">{product.name}</h2>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-3xl font-bold text-primary">
              ${product.salePrice.toLocaleString("es-CO")}
            </div>
            <Badge variant="secondary" className="w-fit">
              <Tag className="w-3 h-3 mr-1" />
              {CATEGORY_LABELS[product.category] ?? product.category}
            </Badge>
            {product.description && (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            )}
            <Button
              className="mt-auto w-full gap-2"
              onClick={() => { onAddToCart(product); onClose(); }}
            >
              <ShoppingCart className="w-4 h-4" />
              {cartQty > 0 ? `Añadir otro (${cartQty} en carrito)` : "Añadir al carrito"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onOpen,
  onAddToCart,
  cartQty,
}: {
  product: CatalogProduct;
  onOpen: () => void;
  onAddToCart: (e: React.MouseEvent) => void;
  cartQty: number;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow duration-300 flex flex-col group">
      {/* Image */}
      <div className="relative aspect-[3/4] overflow-hidden bg-muted cursor-pointer" onClick={onOpen}>
        {product.images.length > 0 ? (
          <img
            src={product.images[0]} alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl select-none">👗</div>
        )}
        {product.images.length > 1 && (
          <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
            1/{product.images.length}
          </div>
        )}
        {/* Quick add button */}
        <button
          onClick={onAddToCart}
          className="absolute bottom-2 right-2 bg-primary text-primary-foreground rounded-full w-9 h-9 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 active:scale-95"
          title="Añadir al carrito"
        >
          <Plus className="w-4 h-4" />
        </button>
        {/* Zoom hint */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <ZoomIn className="w-6 h-6 text-white drop-shadow opacity-60" />
        </div>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="font-semibold text-sm leading-snug line-clamp-2 flex-1 cursor-pointer hover:text-primary transition-colors"
            onClick={onOpen}
          >
            {product.name}
          </h3>
          <span className="text-sm font-bold text-primary whitespace-nowrap">
            ${product.salePrice.toLocaleString("es-CO")}
          </span>
        </div>
        <Badge variant="secondary" className="w-fit text-xs">
          <Tag className="w-3 h-3 mr-1" />
          {CATEGORY_LABELS[product.category] ?? product.category}
        </Badge>
        {product.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden animate-pulse">
      <div className="aspect-[3/4] bg-muted" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/3" />
        <div className="h-3 bg-muted rounded w-full" />
      </div>
    </div>
  );
}

// ─── Cart drawer ──────────────────────────────────────────────────────────────

type CartStep = "cart" | "form" | "success";

interface CheckoutForm {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  notes: string;
}

function CartDrawer({
  open,
  onClose,
  cart,
  onUpdateQty,
  onRemove,
  onClearCart,
  store,
}: {
  open: boolean;
  onClose: () => void;
  cart: CartItem[];
  onUpdateQty: (productId: number, delta: number) => void;
  onRemove: (productId: number) => void;
  onClearCart: () => void;
  store?: StoreInfo;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<CartStep>("cart");
  const [orderId, setOrderId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CheckoutForm>({
    customerName: "", customerPhone: "", customerEmail: "",
    notes: "",
  });

  const total = cart.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const fmt = (n: number) => `$${n.toLocaleString("es-CO")}`;

  // Reset step when drawer opens/closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => { if (!open) { setStep("cart"); setForm({ customerName: "", customerPhone: "", customerEmail: "", notes: "" }); } }, 300);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName.trim() || !form.customerPhone.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/catalog/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          customerEmail: form.customerEmail.trim() || undefined,
          notes: form.notes.trim() || undefined,
          items: cart.map(i => ({ productId: i.productId, qty: i.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error enviando pedido");
      setOrderId(data.id);
      setStep("success");
      onClearCart();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-30 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div className={`fixed inset-y-0 right-0 z-40 w-full sm:w-[420px] bg-background border-l border-border shadow-2xl flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}>

        {/* Cart step */}
        {step === "cart" && (
          <>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-primary" /> Mi pedido
              </h2>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 p-8">
                <ShoppingBag className="w-12 h-12 opacity-20" />
                <p className="font-medium">Tu carrito está vacío</p>
                <p className="text-sm text-center">Agrega productos desde el catálogo</p>
                <Button variant="outline" onClick={onClose}>Ver catálogo</Button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {cart.map(item => (
                    <div key={item.productId} className="flex gap-3 p-3 bg-card border border-border rounded-xl">
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                        {item.image ? (
                          <img src={item.image} alt={item.productName} className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">👗</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm line-clamp-2 leading-snug">{item.productName}</p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.description}</p>
                        )}
                        <p className="text-sm font-bold text-primary mt-1">${item.unitPrice.toLocaleString("es-CO")}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={() => onUpdateQty(item.productId, -1)} className="h-7 w-7 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-semibold tabular-nums">{item.qty}</span>
                          <button onClick={() => onUpdateQty(item.productId, 1)} className="h-7 w-7 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors">
                            <Plus className="w-3 h-3" />
                          </button>
                          <button onClick={() => onRemove(item.productId)} className="ml-auto text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 border-t border-border space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total estimado</span>
                    <span className="text-2xl font-bold text-primary">{fmt(total)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    El precio final puede variar. Un asesor confirmará tu pedido.
                  </p>
                  <Button className="w-full h-11 font-semibold gap-2" onClick={() => setStep("form")}>
                    Continuar con mi pedido →
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        {/* Checkout form step */}
        {step === "form" && (
          <>
            <div className="flex items-center gap-3 p-4 border-b border-border">
              <button onClick={() => setStep("cart")} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="font-bold text-lg">Tus datos de contacto</h2>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-auto">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
              <div className="flex-1 p-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Nombre completo <span className="text-destructive">*</span></label>
                  <Input
                    required placeholder="Tu nombre"
                    value={form.customerName}
                    onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Celular <span className="text-destructive">*</span></label>
                  <Input
                    required type="tel" placeholder="3XX XXX XXXX"
                    value={form.customerPhone}
                    onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Correo electrónico <span className="text-muted-foreground font-normal">(opcional)</span></label>
                  <Input
                    type="email" placeholder="correo@ejemplo.com"
                    value={form.customerEmail}
                    onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Notas <span className="text-muted-foreground font-normal">(opcional)</span></label>
                  <textarea
                    placeholder="Talla, color, instrucciones especiales..."
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full h-20 px-3 py-2 text-sm border border-input rounded-md resize-none bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Order summary */}
                <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resumen del pedido</p>
                  {cart.map(i => (
                    <div key={i.productId} className="flex justify-between gap-2 text-sm">
                      <span className="text-muted-foreground min-w-0">
                        <span className="block">{i.productName} ×{i.qty}</span>
                        {i.description && (
                          <span className="block text-xs line-clamp-1 opacity-80">{i.description}</span>
                        )}
                      </span>
                      <span className="font-medium shrink-0">${(i.unitPrice * i.qty).toLocaleString("es-CO")}</span>
                    </div>
                  ))}
                  <div className="border-t border-border pt-2 flex justify-between font-bold">
                    <span>Total estimado</span>
                    <span className="text-primary">{fmt(total)}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-border">
                <Button type="submit" className="w-full h-11 font-semibold gap-2" disabled={loading}>
                  {loading ? "Enviando pedido..." : "Enviar pedido"}
                </Button>
              </div>
            </form>
          </>
        )}

        {/* Success step */}
        {step === "success" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-9 h-9 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold">¡Pedido recibido!</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Tu pedido <strong>#{orderId}</strong> fue enviado con éxito.
              Pronto te contactaremos al número que indicaste para confirmar la disponibilidad.
            </p>
            {store?.phone && (
              <a
                href={toWhatsAppLink(store.phone, `Hola, acabo de hacer el pedido #${orderId} por el catálogo`)}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-[#25D366] hover:bg-[#20bf5b] text-white text-sm font-semibold transition-colors"
              >
                Escribir por WhatsApp
              </a>
            )}
            <Button variant="outline" className="w-full" onClick={() => { setStep("cart"); onClose(); }}>
              Seguir viendo el catálogo
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Catalogo() {
  const [, setLocation] = useLocation();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["catalog", activeCategory],
    queryFn: async (): Promise<CatalogData> => {
      const url = activeCategory ? `/api/catalog?category=${activeCategory}` : "/api/catalog";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error cargando catálogo");
      return res.json();
    },
    staleTime: 60_000,
  });

  // Apply brand color from settings
  useEffect(() => {
    if (data?.store?.primaryColor) applyBrandColor(data.store.primaryColor);
  }, [data?.store?.primaryColor]);

  const store = data?.store;

  // ── Cart operations ────────────────────────────────────────────────────────

  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);

  const addToCart = useCallback((product: CatalogProduct) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => i.productId === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        description: product.description,
        unitPrice: product.salePrice,
        qty: 1,
        image: product.images[0] ?? null,
      }];
    });
    toast({ title: `${product.name} añadido al carrito`, className: "bg-emerald-500 text-white border-none" });
  }, [toast]);

  const updateQty = useCallback((productId: number, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.productId !== productId) return i;
      const newQty = i.qty + delta;
      return newQty < 1 ? i : { ...i, qty: newQty };
    }));
  }, []);

  const removeFromCart = useCallback((productId: number) => {
    setCart(prev => prev.filter(i => i.productId !== productId));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const cartQtyFor = (productId: number) => cart.find(i => i.productId === productId)?.qty ?? 0;

  return (
    <div className="fixed inset-0 overflow-y-auto bg-background">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border">
        {/* Brand banner — mirrors the login screen's brand panel treatment */}
        <div className="relative overflow-hidden bg-primary">
          <div className="absolute -top-16 -left-16 w-48 h-48 rounded-full bg-white/5" />
          <div className="absolute -bottom-20 -right-10 w-56 h-56 rounded-full bg-white/5" />

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-7 flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-center sm:items-center gap-3 text-center sm:text-left">
              {store?.logoUrl ? (
                <img src={store.logoUrl} alt={store.name} className="h-14 w-14 sm:h-16 sm:w-16 object-contain rounded-2xl bg-white/10 p-1.5 shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-white/15 shadow-lg backdrop-blur-sm shrink-0">
                  <ShoppingBag className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                </div>
              )}
              <div>
                <h1 className="font-bold text-2xl sm:text-3xl tracking-tight text-white leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {store?.name ?? "Claudia Vanegas"}
                </h1>
                {store?.address && (
                  <p className="flex items-center justify-center sm:justify-start gap-1.5 text-white/70 text-xs sm:text-sm mt-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    {store.address}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Social buttons */}
              {store?.instagramUrl && (
                <a href={store.instagramUrl} target="_blank" rel="noopener noreferrer" title="Instagram"
                  className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors">
                  <Instagram className="w-4 h-4" />
                </a>
              )}
              {store?.tiktokUrl && (
                <a href={store.tiktokUrl} target="_blank" rel="noopener noreferrer" title="TikTok"
                  className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors">
                  <Music2 className="w-4 h-4" />
                </a>
              )}
              {store?.phone && (
                <a href={toWhatsAppLink(store.phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp"
                  className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors">
                  <WhatsAppIcon className="w-4 h-4" />
                </a>
              )}

              {/* Cart button */}
              <button
                onClick={() => setCartOpen(true)}
                className="relative h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
                title="Ver carrito"
              >
                <ShoppingCart className="w-4 h-4" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-white text-primary text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Category pills */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-3">
          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
            <button
              onClick={() => setActiveCategory(null)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCategory === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              Todo
            </button>
            {(data?.categories ?? Object.keys(CATEGORY_LABELS)).map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {CATEGORY_LABELS[cat] ?? cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : isError ? (
          <div className="text-center py-24 text-muted-foreground">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No se pudo cargar el catálogo</p>
          </div>
        ) : !data?.products.length ? (
          <div className="text-center py-24 text-muted-foreground">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">{activeCategory ? "No hay productos en esta categoría" : "El catálogo está vacío"}</p>
            {activeCategory && (
              <button onClick={() => setActiveCategory(null)} className="text-sm text-primary mt-2 hover:underline">Ver todo</button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {data.products.length} {data.products.length === 1 ? "producto" : "productos"}
              {activeCategory && ` en ${CATEGORY_LABELS[activeCategory] ?? activeCategory}`}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {data.products.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  cartQty={cartQtyFor(product.id)}
                  onOpen={() => setSelectedProduct(product)}
                  onAddToCart={e => { e.stopPropagation(); addToCart(product); }}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border mt-12 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="font-medium" style={{ fontFamily: "'Playfair Display', serif" }}>
            {store?.name ?? "Claudia Vanegas"}
          </span>
          <div className="flex flex-wrap justify-center sm:justify-end gap-4">
            {store?.phone && (
              <a href={`tel:${store.phone}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                <Phone className="w-4 h-4" />{store.phone}
              </a>
            )}
            {store?.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 shrink-0" />{store.address}
              </span>
            )}
          </div>
          <span className="text-xs">© {new Date().getFullYear()}</span>
        </div>
      </footer>

      {/* ── Product modal ── */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={p => { addToCart(p); }}
          cartQty={cartQtyFor(selectedProduct.id)}
        />
      )}

      {/* ── Cart drawer ── */}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onUpdateQty={updateQty}
        onRemove={removeFromCart}
        onClearCart={clearCart}
        store={store}
      />

      {/* ── Floating cart CTA ── */}
      {cartCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-6 right-6 z-20 bg-primary text-primary-foreground rounded-full px-5 py-3 shadow-xl flex items-center gap-2.5 text-sm font-semibold hover:shadow-2xl hover:scale-105 active:scale-95 transition-all"
        >
          <ShoppingCart className="h-4 w-4" />
          {cartCount} {cartCount === 1 ? "producto" : "productos"} · ${cart.reduce((s, i) => s + i.qty * i.unitPrice, 0).toLocaleString("es-CO")}
        </button>
      )}
    </div>
  );
}
