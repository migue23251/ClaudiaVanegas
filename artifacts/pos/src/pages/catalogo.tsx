import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ShoppingBag, ChevronLeft, ChevronRight, LogIn, Tag,
  Phone, MapPin, X, ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { applyBrandColor } from "@/lib/brand-color";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoreInfo {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  phone: string | null;
  address: string | null;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  blusas: "Blusas", jeans: "Jeans", vestidos: "Vestidos",
  conjuntos: "Conjuntos", faldas: "Faldas", chaquetas: "Chaquetas",
  zapatos: "Zapatos", bolsos: "Bolsos", accesorios: "Accesorios",
};

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%23f3f4f6'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='64' fill='%23d1d5db'%3E👗%3C/text%3E%3C/svg%3E";

// ─── Image carousel (shared by card + modal) ──────────────────────────────────

function Carousel({
  images,
  name,
  aspectClass = "aspect-[3/4]",
  onClick,
}: {
  images: string[];
  name: string;
  aspectClass?: string;
  onClick?: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const srcs = images.length > 0 ? images : [PLACEHOLDER];
  const multi = srcs.length > 1;

  const prev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIdx((i) => (i - 1 + srcs.length) % srcs.length);
  };
  const next = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIdx((i) => (i + 1) % srcs.length);
  };

  return (
    <div
      className={`relative ${aspectClass} overflow-hidden bg-muted group/img ${onClick ? "cursor-zoom-in" : ""}`}
      onClick={onClick}
    >
      <img
        src={srcs[idx]}
        alt={name}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
      />

      {onClick && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/10">
          <ZoomIn className="w-8 h-8 text-white drop-shadow" />
        </div>
      )}

      {multi && (
        <>
          <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity">
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
            {srcs.map((_, i) => (
              <button key={i} onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? "bg-white scale-125" : "bg-white/50"}`}
              />
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
}: {
  product: CatalogProduct;
  onClose: () => void;
}) {
  const srcs = product.images.length > 0 ? product.images : [PLACEHOLDER];
  const [mainIdx, setMainIdx] = useState(0);

  const prev = useCallback(() => setMainIdx((i) => (i - 1 + srcs.length) % srcs.length), [srcs.length]);
  const next = useCallback(() => setMainIdx((i) => (i + 1) % srcs.length), [srcs.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prev, next]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden rounded-2xl gap-0">
        <div className="flex flex-col md:flex-row h-full max-h-[90vh]">

          {/* ── Left: image viewer ── */}
          <div className="md:w-1/2 bg-muted flex flex-col">
            {/* Main image */}
            <div className="relative flex-1 min-h-0 overflow-hidden group/main">
              <img
                src={srcs[mainIdx]}
                alt={`${product.name} ${mainIdx + 1}`}
                className="w-full h-full object-contain"
                style={{ maxHeight: "60vh" }}
                onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
              />
              {srcs.length > 1 && (
                <>
                  <button onClick={prev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-2 opacity-0 group-hover/main:opacity-100 transition-opacity">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button onClick={next}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-2 opacity-0 group-hover/main:opacity-100 transition-opacity">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-3 left-0 right-0 text-center text-white text-xs bg-black/30 mx-auto w-fit px-3 py-1 rounded-full">
                    {mainIdx + 1} / {srcs.length}
                  </div>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {srcs.length > 1 && (
              <div className="flex gap-2 p-3 overflow-x-auto bg-muted/50 border-t border-border">
                {srcs.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setMainIdx(i)}
                    className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                      i === mainIdx ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: product info ── */}
          <div className="md:w-1/2 flex flex-col p-6 overflow-y-auto gap-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold leading-tight">{product.name}</h2>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5">
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
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Descripción</p>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {product.description}
                </p>
              </div>
            )}
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
}: {
  product: CatalogProduct;
  onOpen: () => void;
}) {
  return (
    <div
      className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow duration-300 flex flex-col cursor-pointer group"
      onClick={onOpen}
    >
      <Carousel images={product.images} name={product.name} onClick={onOpen} />

      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 flex-1 group-hover:text-primary transition-colors">
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Catalogo() {
  const [, setLocation] = useLocation();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["catalog", activeCategory],
    queryFn: async (): Promise<CatalogData> => {
      const url = activeCategory
        ? `/api/catalog?category=${activeCategory}`
        : "/api/catalog";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error cargando catálogo");
      return res.json();
    },
    staleTime: 60_000,
  });

  // Apply brand color whenever settings load
  useEffect(() => {
    if (data?.store?.primaryColor) {
      applyBrandColor(data.store.primaryColor);
    }
  }, [data?.store?.primaryColor]);

  const store = data?.store;

  return (
    <div className="fixed inset-0 overflow-y-auto bg-background">

      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">

          {/* Logo + store name */}
          <div className="flex items-center gap-3 min-w-0">
            {store?.logoUrl ? (
              <img
                src={store.logoUrl}
                alt={store.name}
                className="h-10 w-10 object-contain rounded-lg shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <ShoppingBag className="w-7 h-7 text-primary shrink-0" />
            )}
            <span
              className="font-bold text-lg sm:text-xl tracking-tight truncate"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {store?.name ?? "Claudia Vanegas"}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/login")}
            className="shrink-0"
          >
            <LogIn className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:inline">Ingresar</span>
            <span className="sm:hidden">POS</span>
          </Button>
        </div>

        {/* ── Category filter ── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-3">
          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
            <button
              onClick={() => setActiveCategory(null)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCategory === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              Todo
            </button>
            {(data?.categories ?? Object.keys(CATEGORY_LABELS)).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {CATEGORY_LABELS[cat] ?? cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main content ──────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : isError ? (
          <div className="text-center py-24 text-muted-foreground">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No se pudo cargar el catálogo</p>
            <p className="text-sm mt-1">Intenta recargar la página</p>
          </div>
        ) : !data?.products.length ? (
          <div className="text-center py-24 text-muted-foreground">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">
              {activeCategory ? "No hay productos en esta categoría" : "El catálogo está vacío"}
            </p>
            {activeCategory && (
              <button onClick={() => setActiveCategory(null)} className="text-sm text-primary mt-2 hover:underline">
                Ver todo
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {data.products.length} {data.products.length === 1 ? "producto" : "productos"}
              {activeCategory && ` en ${CATEGORY_LABELS[activeCategory] ?? activeCategory}`}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {data.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onOpen={() => setSelectedProduct(product)}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-border mt-12 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="font-medium" style={{ fontFamily: "'Playfair Display', serif" }}>
            {store?.name ?? "Claudia Vanegas"}
          </span>
          <div className="flex flex-wrap justify-center sm:justify-end gap-4">
            {store?.phone && (
              <a href={`tel:${store.phone}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                <Phone className="w-4 h-4" />
                {store.phone}
              </a>
            )}
            {store?.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 shrink-0" />
                {store.address}
              </span>
            )}
          </div>
          <span className="text-xs">© {new Date().getFullYear()}</span>
        </div>
      </footer>

      {/* ── Product detail modal ──────────────────────────────────── */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
