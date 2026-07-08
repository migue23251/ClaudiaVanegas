import { useState, useCallback } from "react";
import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetDashboardTopProducts, getGetDashboardTopProductsQueryKey,
  useGetDashboardBillingVsCollection, getGetDashboardBillingVsCollectionQueryKey,
  useGetDashboardSalesByCategory, getGetDashboardSalesByCategoryQueryKey,
  useGetDashboardPaymentTypeBreakdown, getGetDashboardPaymentTypeBreakdownQueryKey,
  useGetDashboardInventoryCostByCategory, getGetDashboardInventoryCostByCategoryQueryKey,
  useGetDashboardExpensesVsIncome, getGetDashboardExpensesVsIncomeQueryKey,
} from "@workspace/api-client-react";
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell, Sector,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  DollarSign, TrendingUp, Users, ShoppingBag, ArrowUpRight,
  Calendar, ChevronDown,
} from "lucide-react";

// ── Formatters ────────────────────────────────────────────────────────────────

const formatCOP = (v: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);

const formatShort = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

const CATEGORY_LABELS: Record<string, string> = {
  ropa: "Ropa",
  zapatos: "Zapatos",
  accesorios: "Accesorios",
  "Sin categoría": "Sin cat.",
};

const PAYMENT_LABELS: Record<string, string> = {
  contado: "Contado",
  credito: "Crédito",
};

// ── Colors ────────────────────────────────────────────────────────────────────

const CHART = {
  primary: "hsl(var(--primary))",
  chart2: "hsl(var(--chart-5))",
  chart3: "hsl(var(--chart-3))",
  chart4: "hsl(var(--chart-4))",
  chart5: "hsl(var(--chart-2))",
  grid: "hsl(var(--border))",
  muted: "hsl(var(--muted-foreground))",
};

const PIE_COLORS = [CHART.primary, CHART.chart2, CHART.chart3, CHART.chart4];

// ── Date range presets ────────────────────────────────────────────────────────

type Preset = "3m" | "6m" | "12m" | "ytd" | "custom";

function getPresetDates(p: Preset): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0); // end of current month
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (p === "3m") {
    return { from: fmt(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: fmt(to) };
  }
  if (p === "6m") {
    return { from: fmt(new Date(now.getFullYear(), now.getMonth() - 5, 1)), to: fmt(to) };
  }
  if (p === "12m") {
    return { from: fmt(new Date(now.getFullYear(), now.getMonth() - 11, 1)), to: fmt(to) };
  }
  if (p === "ytd") {
    return { from: fmt(new Date(now.getFullYear(), 0, 1)), to: fmt(to) };
  }
  return { from: fmt(new Date(now.getFullYear(), now.getMonth() - 5, 1)), to: fmt(to) };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color, sub,
}: { label: string; value: string | number; icon: React.ElementType; color: string; sub?: string }) {
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

function ChartCard({ title, sub, children, action }: {
  title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs h-full">
      <div className="flex items-start justify-between mb-5 gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-md text-xs">
      {label && <p className="font-semibold text-foreground mb-1.5">{label}</p>}
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

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-foreground">{p.name}</p>
      <p className="text-muted-foreground mt-0.5">{formatCOP(p.value)}</p>
    </div>
  );
}

// ── Date Range Filter ─────────────────────────────────────────────────────────

const PRESETS: { key: Preset; label: string }[] = [
  { key: "3m", label: "3 meses" },
  { key: "6m", label: "6 meses" },
  { key: "12m", label: "12 meses" },
  { key: "ytd", label: "Este año" },
  { key: "custom", label: "Personalizado" },
];

function DateRangeFilter({
  preset, from, to, onPreset, onFrom, onTo,
}: {
  preset: Preset;
  from: string; to: string;
  onPreset: (p: Preset) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-border overflow-hidden">
        {PRESETS.filter(p => p.key !== "custom").map(p => (
          <button
            key={p.key}
            onClick={() => onPreset(p.key)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-border last:border-r-0 ${
              preset === p.key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => onPreset("custom")}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            preset === "custom"
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <Calendar className="h-3 w-3" />
          Personalizado
        </button>
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={from}
            onChange={e => onFrom(e.target.value)}
            className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:border-primary focus:outline-none"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <input
            type="date"
            value={to}
            onChange={e => onTo(e.target.value)}
            className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:border-primary focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className ?? ""}`} />;
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [preset, setPreset] = useState<Preset>("6m");
  const initial = getPresetDates("6m");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const handlePreset = useCallback((p: Preset) => {
    setPreset(p);
    if (p !== "custom") {
      const { from: f, to: t } = getPresetDates(p);
      setFrom(f);
      setTo(t);
    }
  }, []);

  const { data: summary, isLoading: ls } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });
  // Billing vs collection: params go as 1st arg per orval's signature
  const billingParams = { from, to };
  const { data: billing, isLoading: lb } = useGetDashboardBillingVsCollection(
    billingParams,
    { query: { queryKey: [...getGetDashboardBillingVsCollectionQueryKey(), from, to] } },
  );
  const { data: topProducts, isLoading: lp } = useGetDashboardTopProducts({
    query: { queryKey: getGetDashboardTopProductsQueryKey() },
  });
  const { data: salesByCategory, isLoading: lsc } = useGetDashboardSalesByCategory({
    query: { queryKey: getGetDashboardSalesByCategoryQueryKey() },
  });
  const { data: paymentTypes, isLoading: lpt } = useGetDashboardPaymentTypeBreakdown({
    query: { queryKey: getGetDashboardPaymentTypeBreakdownQueryKey() },
  });
  const { data: inventoryCost, isLoading: lic } = useGetDashboardInventoryCostByCategory({
    query: { queryKey: getGetDashboardInventoryCostByCategoryQueryKey() },
  });
  const { data: expensesVsIncome, isLoading: lei } = useGetDashboardExpensesVsIncome({
    query: { queryKey: getGetDashboardExpensesVsIncomeQueryKey() },
  });

  const maxRevenue = Math.max(...(topProducts ?? []).map(p => p.totalRevenue), 1);

  const pieData = (salesByCategory ?? []).map(r => ({
    name: CATEGORY_LABELS[r.category] ?? r.category,
    value: r.total,
  }));
  const paymentData = (paymentTypes ?? []).map(r => ({
    name: PAYMENT_LABELS[r.paymentType] ?? r.paymentType,
    value: r.total,
    count: r.count,
  }));
  const invData = (inventoryCost ?? []).map(r => ({
    name: CATEGORY_LABELS[r.category] ?? r.category,
    value: r.totalCost,
    units: r.totalUnits,
  }));

  return (
    <div className="space-y-5">
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
        {ls ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard label="Facturación" value={formatCOP(summary?.totalBilling ?? 0)} icon={DollarSign} color="bg-primary/10 text-primary" sub="Este mes" />
            <StatCard label="Recaudo" value={formatCOP(summary?.totalCollection ?? 0)} icon={TrendingUp} color="bg-emerald-50 text-emerald-600" sub="Pagos recibidos" />
            <StatCard label="Clientes Nuevos" value={summary?.newCustomers ?? 0} icon={Users} color="bg-blue-50 text-blue-600" sub="Registrados" />
            <StatCard label="Ventas" value={summary?.totalSales ?? 0} icon={ShoppingBag} color="bg-amber-50 text-amber-600" sub="Completadas" />
          </>
        )}
      </div>

      {/* ── Facturación vs Recaudo (with date filter) ── */}
      <ChartCard
        title="Facturación vs. Recaudo"
        sub={`${from} → ${to}`}
        action={
          <DateRangeFilter
            preset={preset}
            from={from}
            to={to}
            onPreset={handlePreset}
            onFrom={setFrom}
            onTo={setTo}
          />
        }
      >
        {lb ? (
          <Skeleton className="h-[260px]" />
        ) : (
          <>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={billing ?? []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gBilling" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART.primary} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={CHART.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gCollection" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART.chart2} stopOpacity={0.12} />
                      <stop offset="95%" stopColor={CHART.chart2} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="month" tick={{ fill: CHART.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: CHART.muted, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatShort} width={52} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="billing" name="Facturación" stroke={CHART.primary} strokeWidth={2} fill="url(#gBilling)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="collection" name="Recaudo" stroke={CHART.chart2} strokeWidth={2} fill="url(#gCollection)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-5 mt-3">
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.primary }} /><span className="text-xs text-muted-foreground">Facturación</span></div>
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.chart2 }} /><span className="text-xs text-muted-foreground">Recaudo</span></div>
            </div>
          </>
        )}
      </ChartCard>

      {/* ── Row 2: Ventas por categoría + Tipo de pago ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ventas por categoría */}
        <ChartCard title="Ventas por Categoría" sub="Ingresos acumulados">
          {lsc ? <Skeleton className="h-[220px]" /> : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pieData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={36}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="name" tick={{ fill: CHART.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: CHART.muted, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatShort} width={52} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Ventas" radius={[6, 6, 0, 0]}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* Tipo de pago */}
        <ChartCard title="Tipo de Pago" sub="Distribución de ventas">
          {lpt ? <Skeleton className="h-[220px]" /> : (
            <div className="flex items-center gap-6">
              <div className="h-[180px] flex-1 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentData}
                      cx="50%" cy="50%"
                      innerRadius={52} outerRadius={76}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {paymentData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="shrink-0 space-y-3 pr-2">
                {paymentData.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin datos</p>
                ) : (
                  paymentData.map((d, i) => {
                    const total = paymentData.reduce((s, x) => s + x.value, 0);
                    const pct = total ? Math.round((d.value / total) * 100) : 0;
                    return (
                      <div key={d.name} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <div>
                          <p className="text-xs font-semibold text-foreground">{d.name}</p>
                          <p className="text-xs text-muted-foreground">{pct}% · {d.count} ventas</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Row 3: Inventario por categoría + Gastos vs Ingresos ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Inventario costo por categoría */}
        <ChartCard title="Costo de Inventario" sub="Por categoría (costo × unidades en stock)">
          {lic ? <Skeleton className="h-[220px]" /> : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={invData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={36}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="name" tick={{ fill: CHART.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: CHART.muted, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatShort} width={52} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = invData.find(x => x.name === label);
                      return (
                        <div className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-md text-xs">
                          <p className="font-semibold text-foreground mb-1">{label}</p>
                          <p className="text-muted-foreground">Costo total: <span className="font-semibold text-foreground">{formatCOP(payload[0].value as number)}</span></p>
                          <p className="text-muted-foreground">Unidades: <span className="font-semibold text-foreground">{d?.units ?? 0}</span></p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="value" name="Costo" radius={[6, 6, 0, 0]}>
                    {invData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* Gastos vs Ingresos */}
        <ChartCard title="Gastos vs. Ingresos" sub="Últimos 6 meses · Órdenes de compra vs. recaudo">
          {lei ? <Skeleton className="h-[220px]" /> : (
            <>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expensesVsIncome ?? []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={3} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
                    <XAxis dataKey="month" tick={{ fill: CHART.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: CHART.muted, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatShort} width={52} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="expenses" name="Gastos" fill={CHART.chart3} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="income" name="Ingresos" fill={CHART.chart4} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-5 mt-3">
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.chart3 }} /><span className="text-xs text-muted-foreground">Gastos</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.chart4 }} /><span className="text-xs text-muted-foreground">Ingresos</span></div>
              </div>
            </>
          )}
        </ChartCard>
      </div>

      {/* ── Productos más vendidos ── */}
      <ChartCard title="Productos más vendidos" sub="Por ingresos · Este mes">
        {lp ? <Skeleton className="h-48" /> : (
          (!topProducts || topProducts.length === 0) ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Sin datos disponibles</div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((product, idx) => {
                const pct = Math.round((product.totalRevenue / maxRevenue) * 100);
                return (
                  <div key={product.productId}>
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className="text-xs font-bold text-muted-foreground w-4 shrink-0 text-right tabular-nums">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate leading-none">
                          {product.productName}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                          {product.category} · {product.totalQty} unid.
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-foreground tabular-nums shrink-0">
                        {formatShort(product.totalRevenue)}
                      </span>
                    </div>
                    {/* Constrain bar to avoid overflow: use a div that takes remaining width after the rank number */}
                    <div className="ml-7 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </ChartCard>
    </div>
  );
}
