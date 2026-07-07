import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, useGetDashboardTopProducts, getGetDashboardTopProductsQueryKey, useGetDashboardBillingVsCollection, getGetDashboardBillingVsCollectionQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, CreditCard, UserPlus, ShoppingBag, PackageOpen } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { data: topProducts, isLoading: isLoadingProducts } = useGetDashboardTopProducts({ query: { queryKey: getGetDashboardTopProductsQueryKey() } });
  const { data: billing, isLoading: isLoadingBilling } = useGetDashboardBillingVsCollection({ query: { queryKey: getGetDashboardBillingVsCollectionQueryKey() } });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
  };

  if (isLoadingSummary || isLoadingProducts || isLoadingBilling) {
    return <div className="flex h-full items-center justify-center"><div className="animate-pulse h-8 w-32 bg-muted rounded"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Panel de Control</h1>
        <p className="text-muted-foreground mt-1">Resumen del rendimiento mensual</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Facturación Mes</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">{formatCurrency(summary?.totalBilling || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recaudo Mes</CardTitle>
            <CreditCard className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">{formatCurrency(summary?.totalCollection || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes Nuevos</CardTitle>
            <UserPlus className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">{summary?.newCustomers || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ventas Completadas</CardTitle>
            <ShoppingBag className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">{summary?.totalSales || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="font-serif">Facturación vs Recaudo (6 meses)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={billing}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value/1000000}M`} />
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                />
                <Legend />
                <Line type="monotone" name="Facturación" dataKey="billing" stroke="hsl(var(--primary))" strokeWidth={2} activeDot={{ r: 8 }} />
                <Line type="monotone" name="Recaudo" dataKey="collection" stroke="hsl(var(--chart-2))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="font-serif">Productos Más Vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topProducts?.map((product) => (
                <div key={product.productId} className="flex items-center">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center mr-4">
                    <PackageOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">{product.productName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{product.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{product.totalQty} unid.</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(product.totalRevenue)}</p>
                  </div>
                </div>
              ))}
              {(!topProducts || topProducts.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">No hay datos suficientes.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
