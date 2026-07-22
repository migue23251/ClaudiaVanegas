import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Truck,
  FileText,
  DollarSign,
  Briefcase,
  Settings,
  UserCog,
  LogOut,
  Store,
  X,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrandSettings } from "@/hooks/use-brand-settings";

const menuItems = [
  { icon: LayoutDashboard, label: "Panel",              href: "/dashboard",       roles: ["admin", "cajero"] },
  { icon: ShoppingCart,    label: "Punto de Venta",     href: "/pos",             roles: ["admin", "cajero"] },
  { icon: FileText,        label: "Historial Ventas",   href: "/ventas",          roles: ["admin", "cajero"] },
  { icon: ClipboardList,   label: "Pedidos Catálogo",   href: "/pedidos",         roles: ["admin"] },
  { icon: Package,         label: "Inventario",         href: "/inventario",      roles: ["admin"] },
  { icon: Truck,           label: "Proveedores",        href: "/proveedores",     roles: ["admin"] },
  { icon: Briefcase,       label: "Cuentas por Cobrar", href: "/cuentas-cobrar",  roles: ["admin"] },
  { icon: DollarSign,      label: "Cuentas por Pagar",  href: "/cuentas-pagar",   roles: ["admin"] },
  { icon: Settings,        label: "Configuración",      href: "/configuracion",   roles: ["admin"] },
  { icon: UserCog,         label: "Usuarios",           href: "/usuarios",        roles: ["admin"] },
];

interface SidebarProps {
  onClose?: () => void;
  isMobileOpen?: boolean;
}

export function Sidebar({ onClose, isMobileOpen }: SidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  if (!user) return null;

  const logoUrl = useBrandSettings((s) => s.logoUrl);
  const filtered = menuItems.filter(item => item.roles.includes(user.role));

  return (
    <aside className="flex h-full w-[260px] flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Header */}
      <div className="flex h-[62px] shrink-0 items-center justify-between px-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 min-w-0">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-md object-contain shrink-0" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 shrink-0">
              <Store className="h-4 w-4 text-primary" />
            </div>
          )}
          <span className="font-serif text-[17px] font-semibold tracking-tight text-foreground truncate leading-tight">
            Claudia Vanegas
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0 ml-2"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {filtered.map((item) => {
          const isActive = location === item.href || location.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent/80"
              )}
            >
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-150",
                  isActive
                    ? "text-primary-foreground"
                    : "text-muted-foreground group-hover:text-foreground group-hover:scale-110"
                )}
              />
              <span className="truncate">{item.label}</span>
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-foreground/60" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2 mb-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-sm">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold leading-none truncate">{user.name}</span>
            <span className="text-xs text-muted-foreground capitalize mt-1">
              {user.role === "admin" ? "Administrador" : "Cajero"}
            </span>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-destructive/10 hover:text-destructive active:bg-destructive/15 group"
        >
          <LogOut className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
}
