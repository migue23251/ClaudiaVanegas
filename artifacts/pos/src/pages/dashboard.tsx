import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetDashboardTopProducts, getGetDashboardTopProductsQueryKey,
  useGetDashboardBillingVsCollection, getGetDashboardBillingVsCollectionQueryKey,
} from "@workspace/api-client-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";
import { DollarSign, TrendingUp, Users, ShoppingBag, ArrowUpRight } from "lucide-react";

const formatCOP = (v: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);

const formatShort = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4 shadow-xs hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div>
        <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</div>
        {sub && (
          <div className="flex items-center gap-1 mt-1">
            <ArrowUpRight className="h-3 w-3 text-emerald-500" />
            <span className="text-xs text-muted-foreground">{sub}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const CHART_COLORS = {
  primary: "hsl(var(--primary))",
  chart2: "hsl(var(--chart-5))",
  grid: "hsl(var(--border))",
  muted: "hsl(var(--muted-foreground))",
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-md text-xs">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground">{formatCOP(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: ls } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { data: topProducts, isLoading: lp } = useGetDashboardTopProducts({ query: { queryKey: getGetDashboardTopProductsQueryKey() } });
  const { data: billing, isLoading: lb } = useGetDashboardBillingVsCollection({ query: { queryKey: getGetDashboardBillingVsCollectionQueryKey() } });

  if (ls || lp || lb) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-7 w-48 rounded-lg bg-muted" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-muted" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-7">
          <div className="lg:col-span-4 h-80 rounded-xl bg-muted" />
          <div className="lg:col-span-3 h-80 rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  // Max revenue for bar scale
  const maxRevenue = Math.max(...(topProducts ?? []).map(p => p.totalRevenue), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Panel de Control</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Resumen del mes actual</p>
        </div>
        <span className="hidden sm:inline-flex text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1">
          En vivo
        </span>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Facturación"
          value={formatCOP(summary?.totalBilling ?? 0)}
          icon={DollarSign}
          color="bg-primary/10 text-primary"
          sub="Este mes"
        />
        <StatCard
          label="Recaudo"
          value={formatCOP(summary?.totalCollection ?? 0)}
          icon={TrendingUp}
          color="bg-emerald-50 text-emerald-600"
          sub="Pagos recibidos"
        />
        <StatCard
          label="Clientes Nuevos"
          value={summary?.newCustomers ?? 0}
          icon={Users}
          color="bg-blue-50 text-blue-600"
          sub="Registrados"
        />
        <StatCard
          label="Ventas"
          value={summary?.totalSales ?? 0}
          icon={ShoppingBag}
          color="bg-amber-50 text-amber-600"
          sub="Completadas"
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-7">
        {/* Area chart */}
        <div className="lg:col-span-4 rounded-xl border border-border bg-card p-5 shadow-xs">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-foreground">Facturación vs. Recaudo</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Últimos 6 meses</p>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={billing ?? []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorBilling" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorCollection" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.chart2} stopOpacity={0.12} />
                    <stop offset="95%" stopColor={CHART_COLORS.chart2} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatShort}
                  width={52}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="billing"
                  name="Facturación"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2}
                  fill="url(#colorBilling)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="collection"
                  name="Recaudo"
                  stroke={CHART_COLORS.chart2}
                  strokeWidth={2}
                  fill="url(#colorCollection)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="flex gap-5 mt-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS.primary }} />
              <span className="text-xs text-muted-foreground">Facturación</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS.chart2 }} />
              <span className="text-xs text-muted-foreground">Recaudo</span>
            </div>
          </div>
        </div>

        {/* Top products */}
        <div className="lg:col-span-3 rounded-xl border border-border bg-card p-5 shadow-xs">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-foreground">Productos más vendidos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Por ingresos totales</p>
          </div>

          {(!topProducts || topProducts.length === 0) ? (
            <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">
              Sin datos disponibles
            </div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((product, idx) => {
                const pct = Math.round((product.totalRevenue / maxRevenue) * 100);
                return (
                  <div key={product.productId} className="group">
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className="text-xs font-bold text-muted-foreground w-4 text-right tabular-nums">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate leading-none">
                          {product.productName}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 capitalize">{product.category} · {product.totalQty} unid.</p>
                      </div>
                      <span className="text-xs font-semibold text-foreground tabular-nums shrink-0">
                        {formatShort(product.totalRevenue)}
                      </span>
                    </div>
                    <div className="ml-7 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
