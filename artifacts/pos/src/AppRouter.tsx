import { useLocation, Route, Switch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import Login from "@/pages/login";
import Catalogo from "@/pages/catalogo";
import Dashboard from "@/pages/dashboard";
import Pos from "@/pages/pos";
import Inventario from "@/pages/inventario";
import Proveedores from "@/pages/proveedores";
import CuentasPagar from "@/pages/cuentas-pagar";
import Ventas from "@/pages/ventas";
import Pedidos from "@/pages/pedidos";
import CuentasCobrar from "@/pages/cuentas-cobrar";
import Configuracion from "@/pages/configuracion";
import Usuarios from "@/pages/usuarios";
import NotFound from "@/pages/not-found";
import { Shell } from "@/components/shell";

export function ProtectedRoute({ component: Component, adminOnly = false }: { component: any, adminOnly?: boolean }) {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    } else if (adminOnly && user?.role !== "admin") {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, user, setLocation, adminOnly]);

  if (!isAuthenticated) return null;
  if (adminOnly && user?.role !== "admin") return null;

  return (
    <Shell>
      <Component />
    </Shell>
  );
}

export function AppRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />

      <Route path="/" component={Catalogo} />

      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/pos"><ProtectedRoute component={Pos} /></Route>
      <Route path="/ventas"><ProtectedRoute component={Ventas} /></Route>

      {/* Admin Only */}
      <Route path="/pedidos"><ProtectedRoute component={Pedidos} adminOnly /></Route>
      <Route path="/inventario"><ProtectedRoute component={Inventario} adminOnly /></Route>
      <Route path="/proveedores"><ProtectedRoute component={Proveedores} adminOnly /></Route>
      <Route path="/cuentas-pagar"><ProtectedRoute component={CuentasPagar} adminOnly /></Route>
      <Route path="/cuentas-cobrar"><ProtectedRoute component={CuentasCobrar} adminOnly /></Route>
      <Route path="/configuracion"><ProtectedRoute component={Configuracion} adminOnly /></Route>
      <Route path="/usuarios"><ProtectedRoute component={Usuarios} adminOnly /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}
