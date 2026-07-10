import { Router, type IRouter } from "express";
import { gte, lte, and, eq, sql } from "drizzle-orm";
import {
  db,
  salesTable, saleItemsTable, productsTable,
  customersTable,
  arPaymentsTable, accountsReceivableTable,
  purchaseOrdersTable,
  apPaymentsTable, accountsPayableTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

function parseDateLocal(val: unknown): { y: number; m: number; d: number } | null {
  if (!val || typeof val !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(val);
  if (!match) return null;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10) - 1;
  const d = parseInt(match[3], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return { y, m, d };
}

function monthBuckets(
  fromYM: { y: number; m: number },
  toYM: { y: number; m: number },
): { start: Date; end: Date; label: string }[] {
  const buckets: { start: Date; end: Date; label: string }[] = [];
  let y = fromYM.y;
  let m = fromYM.m;
  const maxBuckets = 36;
  while ((y < toYM.y || (y === toYM.y && m <= toYM.m)) && buckets.length < maxBuckets) {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0, 23, 59, 59);
    buckets.push({
      start, end,
      label: start.toLocaleDateString("es-CO", { month: "short", year: "2-digit" }),
    });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return buckets;
}

/** Parse from/to query params into Date boundaries, with a fallback range */
function parseDateRange(
  fromQ: unknown,
  toQ: unknown,
  fallback: () => { start: Date; end: Date },
): { start: Date; end: Date } {
  const now = new Date();
  const fromP = parseDateLocal(fromQ);
  const toP = parseDateLocal(toQ);
  if (fromP && toP) {
    return {
      start: new Date(fromP.y, fromP.m, fromP.d, 0, 0, 0),
      end: new Date(toP.y, toP.m, toP.d, 23, 59, 59),
    };
  }
  return fallback();
}

// ─── Summary ─────────────────────────────────────────────────────────────────

router.get("/dashboard/summary", requireAuth, async (_req, res): Promise<void> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [billingResult] = await db.select({
    total: sql<string>`COALESCE(SUM(${salesTable.total}), 0)`,
  }).from(salesTable).where(and(eq(salesTable.voided, false), gte(salesTable.createdAt, startOfMonth), lte(salesTable.createdAt, endOfMonth)));

  const [cashResult] = await db.select({
    total: sql<string>`COALESCE(SUM(${salesTable.total}), 0)`,
  }).from(salesTable).where(and(
    eq(salesTable.voided, false),
    eq(salesTable.paymentType, "contado"),
    gte(salesTable.createdAt, startOfMonth),
    lte(salesTable.createdAt, endOfMonth),
  ));

  const [creditPaymentsResult] = await db.select({
    total: sql<string>`COALESCE(SUM(${arPaymentsTable.amount}), 0)`,
  }).from(arPaymentsTable).where(and(
    gte(arPaymentsTable.paidAt, startOfMonth),
    lte(arPaymentsTable.paidAt, endOfMonth),
  ));

  const [newCustomersResult] = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(customersTable).where(and(
    gte(customersTable.createdAt, startOfMonth),
    lte(customersTable.createdAt, endOfMonth),
  ));

  const [salesCountResult] = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(salesTable).where(and(
    eq(salesTable.voided, false),
    gte(salesTable.createdAt, startOfMonth),
    lte(salesTable.createdAt, endOfMonth),
  ));

  const [lowStockResult] = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(productsTable).where(sql`${productsTable.stock} <= 5`);

  // Net profit = recaudo del mes - compras del mes - gastos fijos pagados del mes
  const [poExpensesResult] = await db.select({
    total: sql<string>`COALESCE(SUM(${purchaseOrdersTable.total}), 0)`,
  }).from(purchaseOrdersTable).where(and(
    gte(purchaseOrdersTable.createdAt, startOfMonth),
    lte(purchaseOrdersTable.createdAt, endOfMonth),
  ));

  const [fixedExpensePaymentsResult] = await db.select({
    total: sql<string>`COALESCE(SUM(${apPaymentsTable.amount}), 0)`,
  }).from(apPaymentsTable)
    .innerJoin(accountsPayableTable, eq(apPaymentsTable.accountPayableId, accountsPayableTable.id))
    .where(and(
      eq(accountsPayableTable.type, "fixed_expense"),
      gte(apPaymentsTable.paidAt, startOfMonth),
      lte(apPaymentsTable.paidAt, endOfMonth),
    ));

  const collection = parseFloat(cashResult.total) + parseFloat(creditPaymentsResult.total);
  const expenses = parseFloat(poExpensesResult.total) + parseFloat(fixedExpensePaymentsResult.total);

  // Pending credits = total outstanding balance on pending/partial AR records
  const [pendingCreditsResult] = await db.select({
    total: sql<string>`COALESCE(SUM(${accountsReceivableTable.totalAmount} - ${accountsReceivableTable.paidAmount}), 0)`,
  }).from(accountsReceivableTable).where(
    sql`${accountsReceivableTable.status} IN ('pending', 'partial')`,
  );

  res.json({
    totalBilling: parseFloat(billingResult.total),
    totalCollection: collection,
    newCustomers: Number(newCustomersResult.count),
    totalSales: Number(salesCountResult.count),
    lowStockProducts: Number(lowStockResult.count),
    netProfit: collection - expenses,
    pendingCredits: parseFloat(pendingCreditsResult.total),
  });
});

// ─── Billing vs Collection ────────────────────────────────────────────────────

router.get("/dashboard/billing-vs-collection", requireAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const fromParsed = parseDateLocal(req.query.from);
  const toParsed = parseDateLocal(req.query.to);

  const fromYM = fromParsed ?? { y: now.getFullYear(), m: now.getMonth() - 5 < 0 ? now.getMonth() - 5 + 12 : now.getMonth() - 5 };
  const toYM = toParsed ?? { y: now.getFullYear(), m: now.getMonth() };

  const fromNorm = (() => {
    if (fromYM.m < 0) return { y: fromYM.y - 1, m: fromYM.m + 12 };
    return fromYM;
  })();

  if (fromNorm.y > toYM.y || (fromNorm.y === toYM.y && fromNorm.m > toYM.m)) {
    res.status(400).json({ error: "from must be before or equal to to" });
    return;
  }

  const months = monthBuckets(fromNorm, toYM);
  const rangeStart = months[0].start;
  const rangeEnd = months[months.length - 1].end;

  // 3 aggregate queries instead of 3-per-month loop
  const [billingRows, cashRows, arRows] = await Promise.all([
    db.select({
      month: sql<string>`DATE_TRUNC('month', ${salesTable.createdAt})`,
      total: sql<string>`COALESCE(SUM(${salesTable.total}), 0)`,
    }).from(salesTable)
      .where(and(eq(salesTable.voided, false), gte(salesTable.createdAt, rangeStart), lte(salesTable.createdAt, rangeEnd)))
      .groupBy(sql`DATE_TRUNC('month', ${salesTable.createdAt})`),

    db.select({
      month: sql<string>`DATE_TRUNC('month', ${salesTable.createdAt})`,
      total: sql<string>`COALESCE(SUM(${salesTable.total}), 0)`,
    }).from(salesTable)
      .where(and(
        eq(salesTable.voided, false),
        eq(salesTable.paymentType, "contado"),
        gte(salesTable.createdAt, rangeStart),
        lte(salesTable.createdAt, rangeEnd),
      ))
      .groupBy(sql`DATE_TRUNC('month', ${salesTable.createdAt})`),

    db.select({
      month: sql<string>`DATE_TRUNC('month', ${arPaymentsTable.paidAt})`,
      total: sql<string>`COALESCE(SUM(${arPaymentsTable.amount}), 0)`,
    }).from(arPaymentsTable)
      .where(and(gte(arPaymentsTable.paidAt, rangeStart), lte(arPaymentsTable.paidAt, rangeEnd)))
      .groupBy(sql`DATE_TRUNC('month', ${arPaymentsTable.paidAt})`),
  ]);

  const toKey = (d: string | Date) => {
    const date = new Date(d);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const billingMap = Object.fromEntries(billingRows.map(r => [toKey(r.month), parseFloat(r.total)]));
  const cashMap = Object.fromEntries(cashRows.map(r => [toKey(r.month), parseFloat(r.total)]));
  const arMap = Object.fromEntries(arRows.map(r => [toKey(r.month), parseFloat(r.total)]));

  const result = months.map(({ start, label }) => {
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    return {
      month: label,
      billing: billingMap[key] ?? 0,
      collection: (cashMap[key] ?? 0) + (arMap[key] ?? 0),
    };
  });

  res.json(result);
});

// ─── Top Products ─────────────────────────────────────────────────────────────

router.get("/dashboard/top-products", requireAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const { start, end } = parseDateRange(req.query.from, req.query.to, () => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  }));

  const top = await db.select({
    productId: saleItemsTable.productId,
    productName: productsTable.name,
    category: productsTable.category,
    totalQty: sql<number>`SUM(${saleItemsTable.qty})`,
    totalRevenue: sql<number>`SUM(${saleItemsTable.subtotal})`,
  }).from(saleItemsTable)
    .leftJoin(productsTable, eq(saleItemsTable.productId, productsTable.id))
    .leftJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id))
    .where(and(eq(salesTable.voided, false), gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)))
    .groupBy(saleItemsTable.productId, productsTable.name, productsTable.category)
    .orderBy(sql`SUM(${saleItemsTable.qty}) DESC`)
    .limit(10);

  res.json(top.map(t => ({
    productId: t.productId,
    productName: t.productName ?? "Desconocido",
    category: t.category ?? "accesorios",
    totalQty: Number(t.totalQty),
    totalRevenue: Number(t.totalRevenue),
  })));
});

// ─── Sales by Category ────────────────────────────────────────────────────────

router.get("/dashboard/sales-by-category", requireAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const { start, end } = parseDateRange(req.query.from, req.query.to, () => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  }));

  const result = await db.select({
    category: productsTable.category,
    total: sql<number>`SUM(${saleItemsTable.subtotal})`,
    count: sql<number>`COUNT(DISTINCT ${saleItemsTable.saleId})`,
  }).from(saleItemsTable)
    .leftJoin(productsTable, eq(saleItemsTable.productId, productsTable.id))
    .leftJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id))
    .where(and(eq(salesTable.voided, false), gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)))
    .groupBy(productsTable.category);

  res.json(result.map(r => ({
    category: r.category ?? "Sin categoría",
    total: Number(r.total),
    count: Number(r.count),
  })));
});

// ─── Payment Type Breakdown ───────────────────────────────────────────────────

router.get("/dashboard/payment-type-breakdown", requireAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const { start, end } = parseDateRange(req.query.from, req.query.to, () => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  }));

  const result = await db.select({
    paymentType: salesTable.paymentType,
    total: sql<number>`SUM(${salesTable.total})`,
    count: sql<number>`COUNT(*)`,
  }).from(salesTable)
    .where(and(eq(salesTable.voided, false), gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)))
    .groupBy(salesTable.paymentType);

  res.json(result.map(r => ({
    paymentType: r.paymentType,
    total: Number(r.total),
    count: Number(r.count),
  })));
});

// ─── Inventory Cost by Category ───────────────────────────────────────────────

router.get("/dashboard/inventory-cost-by-category", requireAuth, async (_req, res): Promise<void> => {
  const result = await db.select({
    category: productsTable.category,
    totalCost: sql<number>`SUM(${productsTable.costPrice} * ${productsTable.stock})`,
    totalUnits: sql<number>`SUM(${productsTable.stock})`,
  }).from(productsTable)
    .groupBy(productsTable.category);

  res.json(result.map(r => ({
    category: r.category,
    totalCost: Number(r.totalCost ?? 0),
    totalUnits: Number(r.totalUnits ?? 0),
  })));
});

// ─── Expenses vs Income ───────────────────────────────────────────────────────

router.get("/dashboard/expenses-vs-income", requireAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth();

  const fromParsed = parseDateLocal(req.query.from);
  const toParsed = parseDateLocal(req.query.to);

  const startM = curM - 5;
  const defaultFrom = startM < 0 ? { y: curY - 1, m: startM + 12 } : { y: curY, m: startM };
  const fromYM = fromParsed ? { y: fromParsed.y, m: fromParsed.m } : defaultFrom;
  const toYM = toParsed ? { y: toParsed.y, m: toParsed.m } : { y: curY, m: curM };

  const months = monthBuckets(fromYM, toYM);
  const rangeStart = months[0].start;
  const rangeEnd = months[months.length - 1].end;

  // Expenses = actual cash paid out (PO payments + fixed expense payments),
  // not the full PO total at creation time. Income = cash sales + AR payments.
  const [apRows, cashRows, arRows] = await Promise.all([
    db.select({
      month: sql<string>`DATE_TRUNC('month', ${apPaymentsTable.paidAt})`,
      total: sql<string>`COALESCE(SUM(${apPaymentsTable.amount}), 0)`,
    }).from(apPaymentsTable)
      .where(and(gte(apPaymentsTable.paidAt, rangeStart), lte(apPaymentsTable.paidAt, rangeEnd)))
      .groupBy(sql`DATE_TRUNC('month', ${apPaymentsTable.paidAt})`),

    db.select({
      month: sql<string>`DATE_TRUNC('month', ${salesTable.createdAt})`,
      total: sql<string>`COALESCE(SUM(${salesTable.total}), 0)`,
    }).from(salesTable)
      .where(and(
        eq(salesTable.voided, false),
        eq(salesTable.paymentType, "contado"),
        gte(salesTable.createdAt, rangeStart),
        lte(salesTable.createdAt, rangeEnd),
      ))
      .groupBy(sql`DATE_TRUNC('month', ${salesTable.createdAt})`),

    db.select({
      month: sql<string>`DATE_TRUNC('month', ${arPaymentsTable.paidAt})`,
      total: sql<string>`COALESCE(SUM(${arPaymentsTable.amount}), 0)`,
    }).from(arPaymentsTable)
      .where(and(gte(arPaymentsTable.paidAt, rangeStart), lte(arPaymentsTable.paidAt, rangeEnd)))
      .groupBy(sql`DATE_TRUNC('month', ${arPaymentsTable.paidAt})`),
  ]);

  const toKey = (d: string | Date) => {
    const date = new Date(d);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const apMap = Object.fromEntries(apRows.map(r => [toKey(r.month), parseFloat(r.total)]));
  const cashMap = Object.fromEntries(cashRows.map(r => [toKey(r.month), parseFloat(r.total)]));
  const arMap = Object.fromEntries(arRows.map(r => [toKey(r.month), parseFloat(r.total)]));

  const result = months.map(({ start, label }) => {
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    return {
      month: label,
      expenses: apMap[key] ?? 0,
      income: (cashMap[key] ?? 0) + (arMap[key] ?? 0),
    };
  });

  res.json(result);
});

// ─── Net Profit Trend ─────────────────────────────────────────────────────────

router.get("/dashboard/net-profit-trend", requireAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth();

  const fromParsed = parseDateLocal(req.query.from);
  const toParsed = parseDateLocal(req.query.to);

  const startM = curM - 5;
  const defaultFrom = startM < 0 ? { y: curY - 1, m: startM + 12 } : { y: curY, m: startM };
  const fromYM = fromParsed ? { y: fromParsed.y, m: fromParsed.m } : defaultFrom;
  const toYM = toParsed ? { y: toParsed.y, m: toParsed.m } : { y: curY, m: curM };

  const months = monthBuckets(fromYM, toYM);
  const rangeStart = months[0].start;
  const rangeEnd = months[months.length - 1].end;

  // 4 aggregate queries: cash income, AR payments income, PO expenses, fixed expense payments
  const [cashRows, arRows, poRows, fixedExpenseRows] = await Promise.all([
    db.select({
      month: sql<string>`DATE_TRUNC('month', ${salesTable.createdAt})`,
      total: sql<string>`COALESCE(SUM(${salesTable.total}), 0)`,
    }).from(salesTable)
      .where(and(
        eq(salesTable.voided, false),
        eq(salesTable.paymentType, "contado"),
        gte(salesTable.createdAt, rangeStart),
        lte(salesTable.createdAt, rangeEnd),
      ))
      .groupBy(sql`DATE_TRUNC('month', ${salesTable.createdAt})`),

    db.select({
      month: sql<string>`DATE_TRUNC('month', ${arPaymentsTable.paidAt})`,
      total: sql<string>`COALESCE(SUM(${arPaymentsTable.amount}), 0)`,
    }).from(arPaymentsTable)
      .where(and(gte(arPaymentsTable.paidAt, rangeStart), lte(arPaymentsTable.paidAt, rangeEnd)))
      .groupBy(sql`DATE_TRUNC('month', ${arPaymentsTable.paidAt})`),

    db.select({
      month: sql<string>`DATE_TRUNC('month', ${purchaseOrdersTable.createdAt})`,
      total: sql<string>`COALESCE(SUM(${purchaseOrdersTable.total}), 0)`,
    }).from(purchaseOrdersTable)
      .where(and(gte(purchaseOrdersTable.createdAt, rangeStart), lte(purchaseOrdersTable.createdAt, rangeEnd)))
      .groupBy(sql`DATE_TRUNC('month', ${purchaseOrdersTable.createdAt})`),

    db.select({
      month: sql<string>`DATE_TRUNC('month', ${apPaymentsTable.paidAt})`,
      total: sql<string>`COALESCE(SUM(${apPaymentsTable.amount}), 0)`,
    }).from(apPaymentsTable)
      .innerJoin(accountsPayableTable, eq(apPaymentsTable.accountPayableId, accountsPayableTable.id))
      .where(and(
        eq(accountsPayableTable.type, "fixed_expense"),
        gte(apPaymentsTable.paidAt, rangeStart),
        lte(apPaymentsTable.paidAt, rangeEnd),
      ))
      .groupBy(sql`DATE_TRUNC('month', ${apPaymentsTable.paidAt})`),
  ]);

  const toKey = (d: string | Date) => {
    const date = new Date(d);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const cashMap = Object.fromEntries(cashRows.map(r => [toKey(r.month), parseFloat(r.total)]));
  const arMap = Object.fromEntries(arRows.map(r => [toKey(r.month), parseFloat(r.total)]));
  const poMap = Object.fromEntries(poRows.map(r => [toKey(r.month), parseFloat(r.total)]));
  const fixedExpenseMap = Object.fromEntries(fixedExpenseRows.map(r => [toKey(r.month), parseFloat(r.total)]));

  const result = months.map(({ start, label }) => {
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    const income = (cashMap[key] ?? 0) + (arMap[key] ?? 0);
    const expenses = (poMap[key] ?? 0) + (fixedExpenseMap[key] ?? 0);
    return {
      month: label,
      netProfit: income - expenses,
      income,
      expenses,
    };
  });

  res.json(result);
});

// ─── Slow Moving Products ─────────────────────────────────────────────────────

router.get("/dashboard/slow-moving-products", requireAuth, async (_req, res): Promise<void> => {
  const result = await db.execute(sql`
    SELECT
      p.id,
      p.name,
      p.code,
      p.category,
      p.stock,
      EXTRACT(epoch FROM (NOW() - p.created_at)) / 86400 AS days_in_stock,
      MAX(s.created_at) AS last_sale_at,
      CASE
        WHEN MAX(s.created_at) IS NOT NULL
        THEN EXTRACT(epoch FROM (NOW() - MAX(s.created_at))) / 86400
        ELSE NULL
      END AS days_since_last_sale,
      COUNT(si.id)::int AS sale_count
    FROM ${productsTable} p
    LEFT JOIN ${saleItemsTable} si ON si.product_id = p.id
    LEFT JOIN ${salesTable} s ON s.id = si.sale_id AND s.voided = false
    WHERE p.stock > 0
    GROUP BY p.id, p.name, p.code, p.category, p.stock, p.created_at
    ORDER BY days_in_stock DESC
    LIMIT 15
  `);

  res.json((result.rows as any[]).map(r => ({
    id: r.id,
    name: r.name,
    code: r.code,
    category: r.category,
    stock: r.stock,
    daysInStock: Math.round(parseFloat(r.days_in_stock ?? "0")),
    daysSinceLastSale: r.days_since_last_sale != null ? Math.round(parseFloat(r.days_since_last_sale)) : null,
    lastSaleAt: r.last_sale_at ? new Date(r.last_sale_at).toISOString() : null,
    saleCount: r.sale_count,
  })));
});

export default router;
