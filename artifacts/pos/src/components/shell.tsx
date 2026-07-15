import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { Menu, Store } from "lucide-react";
import { useBrandSettings } from "@/hooks/use-brand-settings";

export function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();

  // Logo + brand color are kept in sync with the database by the global
  // store (synced once at app boot in App.tsx) — no per-page fetch needed.
  const logo = useBrandSettings((s) => s.logoUrl);
  const storeName = useBrandSettings((s) => s.storeName);

  // Close sidebar on Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (sidebarOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [sidebarOpen, handleKeyDown]);

  // Close sidebar when window resizes to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setSidebarOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* ── Desktop sidebar (always visible ≥1024px) ── */}
      <div className="hidden lg:flex lg:shrink-0 lg:h-full">
        <Sidebar />
      </div>

      {/* ── Mobile sidebar overlay ── */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] lg:hidden transition-opacity duration-300 ${
          sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 h-full lg:hidden sidebar-transition ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} isMobileOpen={sidebarOpen} />
      </div>

      {/* ── Main content area ── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden flex h-[62px] shrink-0 items-center gap-3 border-b border-border bg-card/95 backdrop-blur-sm px-4 shadow-sm z-10 sticky top-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent/80 transition-all duration-150"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            {logo ? (
              <img src={logo} alt="Logo" className="h-7 w-7 rounded-md object-contain shrink-0" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/12 shrink-0">
                <Store className="h-3.5 w-3.5 text-primary" />
              </div>
            )}
            <span className="font-serif text-base font-semibold text-foreground truncate">
              {storeName ?? "Claudia Vanegas"}
            </span>
          </div>

          {user && (
            <div className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
