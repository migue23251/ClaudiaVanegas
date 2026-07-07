import { useState } from "react";
import { 
  useGetReportSalesByMonth, 
  useGetReportSalesByCategory, 
  useGetReportPaymentTypeBreakdown, 
  useGetReportTopProducts 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function Informes() {
  const currentYear = new Date().getFullYear();
  const { data: salesByMonth } = useGetReportSalesByMonth({ year: currentYear });
  const { data: salesByCategory } = useGetReportSalesByCategory();
  const { data: paymentBreakdown } = useGetReportPaymentTypeBreakdown();
  const { data: topProducts } = useGetReportTopProducts({ limit: 10 });

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Informes</h1>
        <p className="text-muted-foreground mt-1">Análisis y métricas del negocio</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Sales by Month */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Ventas Anuales ({currentYear})</CardTitle>
            <CardDescription>Evolución de ingresos mes a mes</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            {salesByMonth && salesByMonth.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByMonth}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} tickFormatter={v => `$${v/1000000}M`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px' }} />
                  <Bar dataKey="total" name="Ingresos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">Sin datos suficientes</div>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Ventas por Categoría</CardTitle>
            <CardDescription>Distribución del ingreso</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {salesByCategory && salesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={salesByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="total"
                    nameKey="category"
                  >
                    {salesByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">Sin datos suficientes</div>
            )}
          </CardContent>
        </Card>

        {/* Payment Type Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Tipos de Pago</CardTitle>
            <CardDescription>Contado vs Crédito</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {paymentBreakdown && paymentBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentBreakdown}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="total"
                    nameKey="paymentType"
                  >
                    {paymentBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.paymentType === 'contado' ? 'hsl(var(--primary))' : 'hsl(var(--chart-2))'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">Sin datos suficientes</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
