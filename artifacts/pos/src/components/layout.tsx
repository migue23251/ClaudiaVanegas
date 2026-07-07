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
  BarChart3,
  Settings,
  UserCog,
  LogOut,
  Store
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  
  if (!user) return null;

  const isAdmin = user.role === 'admin';

  const menuItems = [
    { icon: LayoutDashboard, label: "Panel", href: "/dashboard", roles: ["admin", "cajero"] },
    { icon: ShoppingCart, label: "Punto de Venta", href: "/pos", roles: ["admin", "cajero"] },
    { icon: Users, label: "Clientes", href: "/clientes", roles: ["admin", "cajero"] },
    { icon: FileText, label: "Historial Ventas", href: "/ventas", roles: ["admin", "cajero"] },
    { icon: Briefcase, label: "Cuentas por Cobrar", href: "/cuentas-cobrar", roles: ["admin"] },
    { icon: Package, label: "Inventario", href: "/inventario", roles: ["admin"] },
    { icon: Truck, label: "Proveedores", href: "/proveedores", roles: ["admin"] },
    { icon: FileText, label: "Órdenes de Compra", href: "/ordenes-compra", roles: ["admin"] },
    { icon: DollarSign, label: "Cuentas por Pagar", href: "/cuentas-pagar", roles: ["admin"] },
    { icon: BarChart3, label: "Informes", href: "/informes", roles: ["admin"] },
    { icon: Settings, label: "Configuración", href: "/configuracion", roles: ["admin"] },
    { icon: UserCog, label: "Usuarios", href: "/usuarios", roles: ["admin"] },
  ];

  const filteredMenu = menuItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b px-6">
        <Store className="h-6 w-6 text-primary" />
        <span className="font-serif text-lg font-semibold tracking-tight text-foreground">Claudia Vanegas</span>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="grid gap-1 px-3">
          {filteredMenu.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t p-4">
        <div className="mb-4 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium leading-none">{user.name}</span>
            <span className="text-xs text-muted-foreground capitalize mt-1">{user.role}</span>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
}
