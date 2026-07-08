import { Router, type IRouter } from "express";
import { gte, lte, and, eq, sql } from "drizzle-orm";
import {
  db,
  salesTable, saleItemsTable, productsTable,
  customersTable,
  arPaymentsTable, accountsReceivableTable,
  purchaseOrdersTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

/**
 * Parse an ISO date string ("YYYY-MM-DD") into local year/month/day components
 * to avoid the UTC-shift problem where new Date("YYYY-MM-DD") is midnight UTC
 * and .getMonth() returns the prior day's month in UTC-offset timezones.
 */
function parseDateLocal(val: unknown): { y: number; m: number; d: number } | null {
  if (!val || typeof val !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(val);
  if (!match) return null;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10) - 1; // 0-indexed
  const d = parseInt(match[3], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return { y, m, d };
}

/** Generate monthly buckets between two year/month anchors (inclusive) */
function monthBuckets(
  fromYM: { y: number; m: number },
  toYM: { y: number; m: number },
): { start: Date; end: Date; label: string }[] {
  const buckets: { start: Date; end: Date; label: string }[] = [];
  let y = fromYM.y;
  let m = fromYM.m;
  // Safety cap: no more than 36 months to prevent pathological queries
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

// ─── Summary ─────────────────────────────────────────────────────────────────

router.get("/dashboard/summary", requireAuth, async (_req, res): Promise<void> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [billingResult] = await db.select({
    total: sql<string>`COALESCE(SUM(${salesTable.total}), 0)`,
  }).from(salesTable).where(and(gte(salesTable.createdAt, startOfMonth), lte(salesTable.createdAt, endOfMonth)));

  const [cashResult] = await db.select({
    total: sql<string>`COALESCE(SUM(${salesTable.total}), 0)`,
  }).from(salesTable).where(and(
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
    gte(salesTable.createdAt, startOfMonth),
    lte(salesTable.createdAt, endOfMonth),
  ));

  const [lowStockResult] = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(productsTable).where(sql`${productsTable.stock} <= 5`);

  res.json({
    totalBilling: parseFloat(billingResult.total),
    totalCollection: parseFloat(cashResult.total) + parseFloat(creditPaymentsResult.total),
    newCustomers: Number(newCustomersResult.count),
    totalSales: Number(salesCountResult.count),
    lowStockProducts: Number(lowStockResult.count),
  });
});

// ─── Billing vs Collection (with optional date range) ─────────────────────────

router.get("/dashboard/billing-vs-collection", requireAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const fromParsed = parseDateLocal(req.query.from);
  const toParsed = parseDateLocal(req.query.to);

  const fromYM = fromParsed ?? { y: now.getFullYear(), m: now.getMonth() - 5 < 0 ? now.getMonth() - 5 + 12 : now.getMonth() - 5 };
  const toYM = toParsed ?? { y: now.getFullYear(), m: now.getMonth() };

  // Normalize negative months (e.g. current month is Jan, -5 months = Aug of prev year)
  const fromNorm = (() => {
    if (fromYM.m < 0) return { y: fromYM.y - 1, m: fromYM.m + 12 };
    return fromYM;
  })();

  // Reject inverted ranges
  if (fromNorm.y > toYM.y || (fromNorm.y === toYM.y && fromNorm.m > toYM.m)) {
    res.status(400).json({ error: "from must be before or equal to to" });
    return;
  }

  const months = monthBuckets(fromNorm, toYM);

  const result = await Promise.all(months.map(async ({ start, end, label }) => {
    const [billing] = await db.select({ total: sql<string>`COALESCE(SUM(${salesTable.total}), 0)` })
      .from(salesTable).where(and(gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)));
    const [cash] = await db.select({ total: sql<string>`COALESCE(SUM(${salesTable.total}), 0)` })
      .from(salesTable).where(and(
        eq(salesTable.paymentType, "contado"),
        gte(salesTable.createdAt, start),
        lte(salesTable.createdAt, end),
      ));
    const [creditPaid] = await db.select({ total: sql<string>`COALESCE(SUM(${arPaymentsTable.amount}), 0)` })
      .from(arPaymentsTable).where(and(
        gte(arPaymentsTable.paidAt, start),
        lte(arPaymentsTable.paidAt, end),
      ));
    return {
      month: label,
      billing: parseFloat(billing.total),
      collection: parseFloat(cash.total) + parseFloat(creditPaid.total),
    };
  }));

  res.json(result);
});

// ─── Top Products (this month) ─────────────────────────────────────────────────

router.get("/dashboard/top-products", requireAuth, async (_req, res): Promise<void> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const top = await db.select({
    productId: saleItemsTable.productId,
    productName: productsTable.name,
    category: productsTable.category,
    totalQty: sql<number>`SUM(${saleItemsTable.qty})`,
    totalRevenue: sql<number>`SUM(${saleItemsTable.subtotal})`,
  }).from(saleItemsTable)
    .leftJoin(productsTable, eq(saleItemsTable.productId, productsTable.id))
    .leftJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id))
    .where(gte(salesTable.createdAt, startOfMonth))
    .groupBy(saleItemsTable.productId, productsTable.name, productsTable.category)
    .orderBy(sql`SUM(${saleItemsTable.qty}) DESC`)
    .limit(10);

  res.json(top.map(t => ({
    productId: t.productId,
    productName: t.productName ?? "Desconocido",
    category: t.category ?? "ropa",
    totalQty: Number(t.totalQty),
    totalRevenue: Number(t.totalRevenue),
  })));
});

// ─── Sales by Category ─────────────────────────────────────────────────────────

router.get("/dashboard/sales-by-category", requireAuth, async (_req, res): Promise<void> => {
  const result = await db.select({
    category: productsTable.category,
    total: sql<number>`SUM(${saleItemsTable.subtotal})`,
    count: sql<number>`COUNT(DISTINCT ${saleItemsTable.saleId})`,
  }).from(saleItemsTable)
    .leftJoin(productsTable, eq(saleItemsTable.productId, productsTable.id))
    .groupBy(productsTable.category);

  res.json(result.map(r => ({
    category: r.category ?? "Sin categoría",
    total: Number(r.total),
    count: Number(r.count),
  })));
});

// ─── Payment Type Breakdown ────────────────────────────────────────────────────

router.get("/dashboard/payment-type-breakdown", requireAuth, async (_req, res): Promise<void> => {
  const result = await db.select({
    paymentType: salesTable.paymentType,
    total: sql<number>`SUM(${salesTable.total})`,
    count: sql<number>`COUNT(*)`,
  }).from(salesTable)
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

// ─── Expenses vs Income (last 6 months) ───────────────────────────────────────

router.get("/dashboard/expenses-vs-income", requireAuth, async (_req, res): Promise<void> => {
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth();
  // Last 6 months: go back 5 months from current
  const startM = curM - 5;
  const fromYM = startM < 0 ? { y: curY - 1, m: startM + 12 } : { y: curY, m: startM };
  const months = monthBuckets(fromYM, { y: curY, m: curM });

  const result = await Promise.all(months.map(async ({ start, end, label }) => {
    // Expenses: purchase orders created in this month
    const [poExpenses] = await db.select({
      total: sql<string>`COALESCE(SUM(${purchaseOrdersTable.total}), 0)`,
    }).from(purchaseOrdersTable).where(and(
      gte(purchaseOrdersTable.createdAt, start),
      lte(purchaseOrdersTable.createdAt, end),
    ));

    // Income: cash sales + AR payments received
    const [cashIncome] = await db.select({
      total: sql<string>`COALESCE(SUM(${salesTable.total}), 0)`,
    }).from(salesTable).where(and(
      eq(salesTable.paymentType, "contado"),
      gte(salesTable.createdAt, start),
      lte(salesTable.createdAt, end),
    ));
    const [arIncome] = await db.select({
      total: sql<string>`COALESCE(SUM(${arPaymentsTable.amount}), 0)`,
    }).from(arPaymentsTable).where(and(
      gte(arPaymentsTable.paidAt, start),
      lte(arPaymentsTable.paidAt, end),
    ));

    return {
      month: label,
      expenses: parseFloat(poExpenses.total),
      income: parseFloat(cashIncome.total) + parseFloat(arIncome.total),
    };
  }));

  res.json(result);
});

export default router;
