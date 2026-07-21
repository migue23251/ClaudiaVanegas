import { useState, useCallback } from "react";
import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetDashboardTopProducts, getGetDashboardTopProductsQueryKey,
  useGetDashboardBillingVsCollection, getGetDashboardBillingVsCollectionQueryKey,
  useGetDashboardSalesByCategory, getGetDashboardSalesByCategoryQueryKey,
  useGetDashboardPaymentTypeBreakdown, getGetDashboardPaymentTypeBreakdownQueryKey,
  useGetDashboardInventoryCostByCategory, getGetDashboardInventoryCostByCategoryQueryKey,
  useGetDashboardExpensesVsIncome, getGetDashboardExpensesVsIncomeQueryKey,
  useGetDashboardSlowMovingProducts, getGetDashboardSlowMovingProductsQueryKey,
  useGetDashboardNetProfitTrend, getGetDashboardNetProfitTrendQueryKey,
} from "@workspace/api-client-react";
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import {
  DollarSign, TrendingUp, Users, ShoppingBag, ArrowUpRight,
  Calendar, AlertTriangle, TrendingDown, CreditCard,
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
  blusas: "Blusas", jeans: "Jeans", vestidos: "Vestidos",
  conjuntos: "Conjuntos", faldas: "Faldas", chaquetas: "Chaquetas",
  zapatos: "Zapatos", bolsos: "Bolsos", accesorios: "Accesorios",
  "Sin categoría": "Sin cat.",
};

const PAYMENT_LABELS: Record<string, string> = { contado: "Contado", credito: "Crédito" };

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

type Preset = "1m" | "3m" | "6m" | "12m" | "ytd" | "custom";

function getPresetDates(p: Preset): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0); // end of current month
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (p === "1m") return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(to) };
  if (p === "3m") return { from: fmt(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: fmt(to) };
  if (p === "6m") return { from: fmt(new Date(now.getFullYear(), now.getMonth() - 5, 1)), to: fmt(to) };
  if (p === "12m") return { from: fmt(new Date(now.getFullYear(), now.getMonth() - 11, 1)), to: fmt(to) };
  if (p === "ytd") return { from: fmt(new Date(now.getFullYear(), 0, 1)), to: fmt(to) };
  return { from: fmt(new Date(now.getFullYear(), now.getMonth() - 5, 1)), to: fmt(to) };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string | number; icon: React.ElementType; color: string; sub?: string;
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

function ChartCard({ title, sub, children, action }: {
  title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs h-full">
      <div className="flex items-start justify-between mb-5 gap-2 flex-wrap">
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

const PRESETS_BILLING: { key: Preset; label: string }[] = [
  { key: "3m", label: "3 meses" },
  { key: "6m", label: "6 meses" },
  { key: "12m", label: "12 meses" },
  { key: "ytd", label: "Este año" },
];

const PRESETS_CHART: { key: Preset; label: string }[] = [
  { key: "1m", label: "Este mes" },
  { key: "3m", label: "3 meses" },
  { key: "6m", label: "6 meses" },
  { key: "ytd", label: "Este año" },
];

function DateRangeFilter({ presets, preset, from, to, onPreset, onFrom, onTo }: {
  presets: { key: Preset; label: string }[];
  preset: Preset; from: string; to: string;
  onPreset: (p: Preset) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-border overflow-hidden">
        {presets.map(p => (
          <button key={p.key} onClick={() => onPreset(p.key)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-border last:border-r-0 ${
              preset === p.key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button onClick={() => onPreset("custom")}
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
          <input type="date" value={from} onChange={e => onFrom(e.target.value)}
            className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:border-primary focus:outline-none"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <input type="date" value={to} onChange={e => onTo(e.target.value)}
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

// ── Category filter select ────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: "blusas",    label: "Blusas" },
  { value: "jeans",     label: "Jeans" },
  { value: "vestidos",  label: "Vestidos" },
  { value: "conjuntos", label: "Conjuntos" },
  { value: "faldas",    label: "Faldas" },
  { value: "chaquetas", label: "Chaquetas" },
  { value: "zapatos",   label: "Zapatos" },
  { value: "bolsos",    label: "Bolsos" },
  { value: "accesorios",label: "Accesorios" },
] as const;

function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-7 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:border-primary focus:outline-none cursor-pointer"
    >
      <option value="">Todas las categorías</option>
      {CATEGORY_OPTIONS.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  // ── Billing vs Collection date range ──────────────────────────────────────
  const [billingPreset, setBillingPreset] = useState<Preset>("6m");
  const billingInit = getPresetDates("6m");
  const [billingFrom, setBillingFrom] = useState(billingInit.from);
  const [billingTo, setBillingTo] = useState(billingInit.to);

  const handleBillingPreset = useCallback((p: Preset) => {
    setBillingPreset(p);
    if (p !== "custom") {
      const { from: f, to: t } = getPresetDates(p);
      setBillingFrom(f);
      setBillingTo(t);
    }
  }, []);

  // ── Net Profit Trend date range ────────────────────────────────────────────
  const [profitPreset, setProfitPreset] = useState<Preset>("6m");
  const profitInit = getPresetDates("6m");
  const [profitFrom, setProfitFrom] = useState(profitInit.from);
  const [profitTo, setProfitTo] = useState(profitInit.to);

  const handleProfitPreset = useCallback((p: Preset) => {
    setProfitPreset(p);
    if (p !== "custom") {
      const { from: f, to: t } = getPresetDates(p);
      setProfitFrom(f);
      setProfitTo(t);
    }
  }, []);

  // ── Category filters for top-products and slow-moving ─────────────────────
  const [topCat, setTopCat] = useState("");
  const [slowCat, setSlowCat] = useState("");

  // ── Chart date range (category, payment, top-products, expenses) ──────────
  const [chartPreset, setChartPreset] = useState<Preset>("1m");
  const chartInit = getPresetDates("1m");
  const [chartFrom, setChartFrom] = useState(chartInit.from);
  const [chartTo, setChartTo] = useState(chartInit.to);

  const handleChartPreset = useCallback((p: Preset) => {
    setChartPreset(p);
    if (p !== "custom") {
      const { from: f, to: t } = getPresetDates(p);
      setChartFrom(f);
      setChartTo(t);
    }
  }, []);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: summary, isLoading: ls } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });

  const billingParams = { from: billingFrom, to: billingTo };
  const { data: billing, isLoading: lb } = useGetDashboardBillingVsCollection(
    billingParams,
    { query: { queryKey: [...getGetDashboardBillingVsCollectionQueryKey(), billingFrom, billingTo] } },
  );

  const chartParams = { from: chartFrom, to: chartTo };
  const topProductsParams = { from: chartFrom, to: chartTo, ...(topCat ? { category: topCat } : {}) };
  const { data: topProducts, isLoading: lp } = useGetDashboardTopProducts(
    topProductsParams,
    { query: { queryKey: [...getGetDashboardTopProductsQueryKey(), chartFrom, chartTo, topCat] } },
  );
  const { data: salesByCategory, isLoading: lsc } = useGetDashboardSalesByCategory(
    chartParams,
    { query: { queryKey: [...getGetDashboardSalesByCategoryQueryKey(), chartFrom, chartTo] } },
  );
  const { data: paymentTypes, isLoading: lpt } = useGetDashboardPaymentTypeBreakdown(
    chartParams,
    { query: { queryKey: [...getGetDashboardPaymentTypeBreakdownQueryKey(), chartFrom, chartTo] } },
  );
  const { data: inventoryCost, isLoading: lic } = useGetDashboardInventoryCostByCategory({
    query: { queryKey: getGetDashboardInventoryCostByCategoryQueryKey() },
  });
  const { data: expensesVsIncome, isLoading: lei } = useGetDashboardExpensesVsIncome(
    chartParams,
    { query: { queryKey: [...getGetDashboardExpensesVsIncomeQueryKey(), chartFrom, chartTo] } },
  );
  const slowMovingParams = slowCat ? { category: slowCat } : {};
  const { data: slowMoving, isLoading: lsm } = useGetDashboardSlowMovingProducts(
    slowMovingParams,
    { query: { queryKey: [...getGetDashboardSlowMovingProductsQueryKey(), slowCat] } },
  );

  const profitParams = { from: profitFrom, to: profitTo };
  const { data: netProfitTrend, isLoading: lnp } = useGetDashboardNetProfitTrend(
    profitParams,
    { query: { queryKey: [...getGetDashboardNetProfitTrendQueryKey(), profitFrom, profitTo] } },
  );

  // ── Derived data ──────────────────────────────────────────────────────────
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

  // Shared chart filter action node (used in multiple charts)
  const chartFilterAction = (
    <DateRangeFilter
      presets={PRESETS_CHART}
      preset={chartPreset}
      from={chartFrom}
      to={chartTo}
      onPreset={handleChartPreset}
      onFrom={setChartFrom}
      onTo={setChartTo}
    />
  );

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

      {/* KPI cards — 3 columns on desktop, 2 on mobile */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        {ls ? (
          [...Array(6)].map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            {/* Fila 1: Ventas, Facturación, Utilidad Neta */}
            <StatCard label="Ventas" value={summary?.totalSales ?? 0} icon={ShoppingBag} color="bg-amber-50 text-amber-600" sub="Completadas" />
            <StatCard label="Facturación" value={formatCOP(summary?.totalBilling ?? 0)} icon={DollarSign} color="bg-primary/10 text-primary" sub="Este mes" />
            <StatCard
              label="Utilidad Neta"
              value={formatCOP(summary?.netProfit ?? 0)}
              icon={(summary?.netProfit ?? 0) >= 0 ? TrendingUp : TrendingDown}
              color={(summary?.netProfit ?? 0) >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}
              sub="Recaudo − (gastos + proveedores)"
            />
            {/* Fila 2: Recaudo, Cartera Pendiente, Clientes Nuevos */}
            <StatCard label="Recaudo" value={formatCOP(summary?.totalCollection ?? 0)} icon={TrendingUp} color="bg-emerald-50 text-emerald-600" sub="Pagos recibidos" />
            <StatCard
              label="Cartera Pendiente"
              value={formatCOP(summary?.pendingCredits ?? 0)}
              icon={CreditCard}
              color="bg-orange-50 text-orange-600"
              sub="Créditos por cobrar"
            />
            <StatCard label="Clientes Nuevos" value={summary?.newCustomers ?? 0} icon={Users} color="bg-blue-50 text-blue-600" sub="Registrados" />
          </>
        )}
      </div>

      {/* ── Facturación vs Recaudo + Tendencia Utilidad Neta (side by side on lg) ── */}
      <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard
        title="Facturación vs. Recaudo"
        sub={`${billingFrom} → ${billingTo}`}
        action={
          <DateRangeFilter
            presets={PRESETS_BILLING}
            preset={billingPreset}
            from={billingFrom}
            to={billingTo}
            onPreset={handleBillingPreset}
            onFrom={setBillingFrom}
            onTo={setBillingTo}
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

      <ChartCard
        title="Tendencia de Utilidad Neta"
        sub={`${profitFrom} → ${profitTo}`}
        action={
          <DateRangeFilter
            presets={PRESETS_BILLING}
            preset={profitPreset}
            from={profitFrom}
            to={profitTo}
            onPreset={handleProfitPreset}
            onFrom={setProfitFrom}
            onTo={setProfitTo}
          />
        }
      >
        {lnp ? (
          <Skeleton className="h-[260px]" />
        ) : (
          <>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={netProfitTrend ?? []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gProfitPos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gProfitNeg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="month" tick={{ fill: CHART.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: CHART.muted, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatShort} width={58} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-md text-xs">
                          <p className="font-semibold text-foreground mb-1.5">{label}</p>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="h-2 w-2 rounded-full shrink-0 bg-emerald-500" />
                            <span className="text-muted-foreground">Ingresos:</span>
                            <span className="font-semibold">{formatCOP(d?.income ?? 0)}</span>
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="h-2 w-2 rounded-full shrink-0 bg-red-400" />
                            <span className="text-muted-foreground">Compras:</span>
                            <span className="font-semibold">{formatCOP(d?.expenses ?? 0)}</span>
                          </div>
                          <div className="border-t border-border mt-1.5 pt-1.5 flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${(d?.netProfit ?? 0) >= 0 ? "bg-emerald-600" : "bg-red-600"}`} />
                            <span className="text-muted-foreground font-semibold">Utilidad:</span>
                            <span className={`font-bold ${(d?.netProfit ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {formatCOP(d?.netProfit ?? 0)}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={0} stroke={CHART.grid} strokeDasharray="4 4" strokeWidth={1.5} />
                  <Area
                    type="monotone"
                    dataKey="netProfit"
                    name="Utilidad Neta"
                    stroke={CHART.chart2}
                    strokeWidth={2.5}
                    fill="url(#gProfitPos)"
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {/* Summary row */}
            {netProfitTrend && netProfitTrend.length > 0 && (() => {
              const totalIncome = netProfitTrend.reduce((s, m) => s + m.income, 0);
              const totalExpenses = netProfitTrend.reduce((s, m) => s + m.expenses, 0);
              const totalProfit = netProfitTrend.reduce((s, m) => s + m.netProfit, 0);
              const margin = totalIncome > 0 ? Math.round((totalProfit / totalIncome) * 100) : 0;
              return (
                <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 pt-3 border-t border-border/50">
                  <div className="text-xs"><span className="text-muted-foreground">Ingresos:</span> <span className="font-semibold">{formatCOP(totalIncome)}</span></div>
                  <div className="text-xs"><span className="text-muted-foreground">Compras:</span> <span className="font-semibold">{formatCOP(totalExpenses)}</span></div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Utilidad total:</span>{" "}
                    <span className={`font-bold ${totalProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatCOP(totalProfit)}</span>
                  </div>
                  <div className="text-xs"><span className="text-muted-foreground">Margen:</span> <span className={`font-semibold ${margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>{margin}%</span></div>
                </div>
              );
            })()}
          </>
        )}
      </ChartCard>

      </div>

      {/* ── Row 2: Ventas por categoría + Tipo de pago (shared chart filter) ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Ventas por Categoría" sub={`${chartFrom} → ${chartTo}`} action={chartFilterAction}>
          {lsc ? <Skeleton className="h-[220px]" /> : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pieData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART.grid} />
                  <XAxis type="number" tick={{ fill: CHART.muted, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatShort} />
                  <YAxis type="category" dataKey="name" tick={{ fill: CHART.muted, fontSize: 10 }} tickLine={false} axisLine={false} width={72} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Ventas" radius={[0, 6, 6, 0]} barSize={20}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Tipo de Pago" sub={`${chartFrom} → ${chartTo}`} action={chartFilterAction}>
          {lpt ? <Skeleton className="h-[220px]" /> : (
            <div className="flex items-center gap-6">
              <div className="h-[180px] flex-1 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentData} cx="50%" cy="50%" innerRadius={52} outerRadius={76} paddingAngle={3} dataKey="value">
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
                    const tot = paymentData.reduce((s, x) => s + x.value, 0);
                    const pct = tot ? Math.round((d.value / tot) * 100) : 0;
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

      {/* ── Row 3: Inventario + Gastos vs Ingresos ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Costo de Inventario" sub="Por categoría (costo × stock)">
          {lic ? <Skeleton className="h-[220px]" /> : (
            <>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={invData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
                    <XAxis dataKey="name" tick={{ fill: CHART.muted, fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: CHART.muted, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatShort} width={52} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = invData.find(x => x.name === label);
                        return (
                          <div className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-md text-xs">
                            <p className="font-semibold text-foreground mb-1">{label}</p>
                            <p className="text-muted-foreground">Costo total: <span className="font-semibold">{formatCOP(payload[0].value as number)}</span></p>
                            <p className="text-muted-foreground">Unidades: <span className="font-semibold">{d?.units ?? 0}</span></p>
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
              {invData.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50 flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Valor total inventario:</span>
                  <span className="font-bold text-foreground">{formatCOP(invData.reduce((s, d) => s + d.value, 0))}</span>
                </div>
              )}
            </>
          )}
        </ChartCard>

        <ChartCard title="Gastos vs. Ingresos" sub={`${chartFrom} → ${chartTo}`} action={chartFilterAction}>
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
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.chart3 }} /><span className="text-xs text-muted-foreground">Gastos (compras)</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.chart4 }} /><span className="text-xs text-muted-foreground">Ingresos (recaudo)</span></div>
              </div>
            </>
          )}
        </ChartCard>
      </div>

      {/* ── Productos más vendidos ── */}
      <ChartCard
        title="Productos más vendidos"
        sub={`Top 10 · ${chartFrom} → ${chartTo}`}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <CategorySelect value={topCat} onChange={setTopCat} />
            {chartFilterAction}
          </div>
        }
      >
        {lp ? <Skeleton className="h-48" /> : (
          (!topProducts || topProducts.length === 0) ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Sin datos para el período seleccionado</div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((product, idx) => {
                const pct = Math.round((product.totalRevenue / maxRevenue) * 100);
                const variantLabel = product.color
                  ? [product.color, product.size].filter(Boolean).join(" / ")
                  : null;
                return (
                  <div key={`${product.productId}-${product.variantId ?? "no-var"}`}>
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className="text-xs font-bold text-muted-foreground w-4 shrink-0 text-right tabular-nums">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate leading-none">{product.productName}</p>
                        {variantLabel && (
                          <p className="text-xs text-muted-foreground capitalize mt-0.5">{variantLabel}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5 capitalize">{CATEGORY_LABELS[product.category] ?? product.category} · {product.totalQty} unid.</p>
                      </div>
                      <span className="text-xs font-semibold text-foreground tabular-nums shrink-0">{formatShort(product.totalRevenue)}</span>
                    </div>
                    <div className="ml-7 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </ChartCard>

      {/* ── Inventario sin movimiento ── */}
      <ChartCard
        title="Inventario sin movimiento"
        sub="Top 10 variantes con baja rotación"
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <CategorySelect value={slowCat} onChange={setSlowCat} />
            <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              <AlertTriangle className="h-3.5 w-3.5" />
              {lsm ? "..." : `${slowMoving?.length ?? 0} items`}
            </div>
          </div>
        }
      >
        {lsm ? <Skeleton className="h-40" /> : (
          (!slowMoving || slowMoving.length === 0) ? (
            <div className="flex items-center justify-center h-24 text-sm text-emerald-600 gap-2">
              <span>✓</span> Todos los productos tienen movimiento reciente
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-semibold">Producto / Variante</th>
                    <th className="text-left py-2 pr-4 font-semibold">Categoría</th>
                    <th className="text-right py-2 pr-4 font-semibold">Stock</th>
                    <th className="text-right py-2 pr-4 font-semibold">Días en bodega</th>
                    <th className="text-right py-2 font-semibold">Días sin vender</th>
                  </tr>
                </thead>
                <tbody>
                  {slowMoving.map(p => {
                    const variantLabel = p.color
                      ? [p.color, p.size].filter(Boolean).join(" / ")
                      : null;
                    return (
                      <tr key={`${p.id}-${p.variantId ?? "no-var"}`} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 pr-4 font-medium">
                          <div>{p.name}</div>
                          {variantLabel && (
                            <div className="text-muted-foreground font-normal capitalize">{variantLabel}</div>
                          )}
                          <div className="text-muted-foreground font-mono">{p.sku ?? p.code}</div>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground capitalize">{CATEGORY_LABELS[p.category] ?? p.category}</td>
                        <td className="py-2 pr-4 text-right font-semibold">{p.stock}</td>
                        <td className="py-2 pr-4 text-right text-muted-foreground">{Math.round(p.daysInStock)}</td>
                        <td className="py-2 text-right">
                          {p.daysSinceLastSale != null ? (
                            <span className={`font-semibold ${p.daysSinceLastSale > 30 ? "text-destructive" : "text-amber-600"}`}>
                              {Math.round(p.daysSinceLastSale)} días
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">Sin ventas</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </ChartCard>
    </div>
  );
}
