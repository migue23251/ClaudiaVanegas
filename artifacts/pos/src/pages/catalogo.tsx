import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ShoppingBag, ChevronLeft, ChevronRight, LogIn, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const CATEGORIES = [
  { value: "blusas",     label: "Blusas" },
  { value: "jeans",      label: "Jeans" },
  { value: "vestidos",   label: "Vestidos" },
  { value: "conjuntos",  label: "Conjuntos" },
  { value: "faldas",     label: "Faldas" },
  { value: "chaquetas",  label: "Chaquetas" },
  { value: "zapatos",    label: "Zapatos" },
  { value: "bolsos",     label: "Bolsos" },
  { value: "accesorios", label: "Accesorios" },
] as const;

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect width='400' height='400' fill='%23f3f4f6'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='64' fill='%23d1d5db'%3E👗%3C/text%3E%3C/svg%3E";

interface CatalogProduct {
  id: number;
  name: string;
  description: string | null;
  salePrice: number;
  category: string;
  images: string[];
}

function ImageGallery({ images, name }: { images: string[]; name: string }) {
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
    <div className="relative aspect-[3/4] overflow-hidden bg-muted group/img">
      <img
        src={srcs[idx]}
        alt={name}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        onError={(e) => {
          (e.target as HTMLImageElement).src = PLACEHOLDER;
        }}
      />

      {multi && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
            {srcs.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === idx ? "bg-white scale-125" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        </>
      )}

      {multi && (
        <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
          {idx + 1}/{srcs.length}
        </div>
      )}
    </div>
  );
}

function ProductCard({ product }: { product: CatalogProduct }) {
  const cat = CATEGORIES.find((c) => c.value === product.category);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow duration-300 group flex flex-col">
      <ImageGallery images={product.images} name={product.name} />

      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 flex-1">
            {product.name}
          </h3>
          <span className="text-sm font-bold text-primary whitespace-nowrap">
            ${product.salePrice.toLocaleString("es-CO")}
          </span>
        </div>

        {cat && (
          <Badge variant="secondary" className="w-fit text-xs capitalize">
            <Tag className="w-3 h-3 mr-1" />
            {cat.label}
          </Badge>
        )}

        {product.description && (
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {product.description}
          </p>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden animate-pulse">
      <div className="aspect-[3/4] bg-muted" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="h-3 bg-muted rounded w-full" />
      </div>
    </div>
  );
}

export default function Catalogo() {
  const [, setLocation] = useLocation();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["catalog", activeCategory],
    queryFn: async () => {
      const url = activeCategory
        ? `/api/catalog?category=${activeCategory}`
        : "/api/catalog";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error cargando catálogo");
      return res.json() as Promise<{
        categories: string[];
        products: CatalogProduct[];
      }>;
    },
    staleTime: 60_000,
  });

  return (
    <div className="fixed inset-0 overflow-y-auto bg-background">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-6 h-6 text-primary shrink-0" />
            <span
              className="font-bold text-lg sm:text-xl tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Claudia Vanegas
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
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() =>
                  setActiveCategory(
                    activeCategory === cat.value ? null : cat.value
                  )
                }
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === cat.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
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
              {activeCategory
                ? "No hay productos en esta categoría"
                : "El catálogo está vacío"}
            </p>
            {activeCategory && (
              <button
                onClick={() => setActiveCategory(null)}
                className="text-sm text-primary mt-2 hover:underline"
              >
                Ver todo
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {data.products.length}{" "}
              {data.products.length === 1 ? "producto" : "productos"}
              {activeCategory &&
                ` en ${CATEGORIES.find((c) => c.value === activeCategory)?.label}`}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {data.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border mt-12 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Claudia Vanegas · Bogotá, Colombia
      </footer>
    </div>
  );
}
