import { Router, type IRouter } from "express";
import { gte, lte, and, eq, sql, lt } from "drizzle-orm";
import { db, salesTable, saleItemsTable, productsTable, customersTable, arPaymentsTable, accountsReceivableTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (_req, res): Promise<void> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Total billing (all sales this month)
  const billingResult = await db.select({
    total: sql<string>`COALESCE(SUM(${salesTable.total}), 0)`,
  }).from(salesTable).where(and(
    gte(salesTable.createdAt, startOfMonth),
    lte(salesTable.createdAt, endOfMonth)
  ));

  // Total collection (cash sales + credit payments this month)
  const cashResult = await db.select({
    total: sql<string>`COALESCE(SUM(${salesTable.total}), 0)`,
  }).from(salesTable).where(and(
    eq(salesTable.paymentType, "contado"),
    gte(salesTable.createdAt, startOfMonth),
    lte(salesTable.createdAt, endOfMonth)
  ));

  const creditPaymentsResult = await db.select({
    total: sql<string>`COALESCE(SUM(${arPaymentsTable.amount}), 0)`,
  }).from(arPaymentsTable).where(and(
    gte(arPaymentsTable.paidAt, startOfMonth),
    lte(arPaymentsTable.paidAt, endOfMonth)
  ));

  // New customers this month
  const newCustomersResult = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(customersTable).where(and(
    gte(customersTable.createdAt, startOfMonth),
    lte(customersTable.createdAt, endOfMonth)
  ));

  // Total sales count this month
  const salesCountResult = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(salesTable).where(and(
    gte(salesTable.createdAt, startOfMonth),
    lte(salesTable.createdAt, endOfMonth)
  ));

  // Low stock products (stock <= 5)
  const lowStockResult = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(productsTable).where(sql`${productsTable.stock} <= 5`);

  const collection = parseFloat(cashResult[0].total) + parseFloat(creditPaymentsResult[0].total);

  res.json({
    totalBilling: parseFloat(billingResult[0].total),
    totalCollection: collection,
    newCustomers: Number(newCustomersResult[0].count),
    totalSales: Number(salesCountResult[0].count),
    lowStockProducts: Number(lowStockResult[0].count),
  });
});

router.get("/dashboard/billing-vs-collection", requireAuth, async (_req, res): Promise<void> => {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    months.push({ start, end, label: d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" }) });
  }

  const result = await Promise.all(months.map(async ({ start, end, label }) => {
    const [billing] = await db.select({ total: sql<string>`COALESCE(SUM(${salesTable.total}), 0)` })
      .from(salesTable).where(and(gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)));
    const [cash] = await db.select({ total: sql<string>`COALESCE(SUM(${salesTable.total}), 0)` })
      .from(salesTable).where(and(eq(salesTable.paymentType, "contado"), gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)));
    const [creditPaid] = await db.select({ total: sql<string>`COALESCE(SUM(${arPaymentsTable.amount}), 0)` })
      .from(arPaymentsTable).where(and(gte(arPaymentsTable.paidAt, start), lte(arPaymentsTable.paidAt, end)));
    return {
      month: label,
      billing: parseFloat(billing.total),
      collection: parseFloat(cash.total) + parseFloat(creditPaid.total),
    };
  }));

  res.json(result);
});

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

export default router;
