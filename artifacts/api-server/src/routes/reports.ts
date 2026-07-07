import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db, salesTable, saleItemsTable, productsTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

router.get("/reports/sales-by-month", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const year = req.query.year ? parseInt(String(req.query.year), 10) : new Date().getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59);

  const result = await db.select({
    month: sql<string>`TO_CHAR(${salesTable.createdAt}, 'YYYY-MM')`,
    total: sql<number>`SUM(${salesTable.total})`,
    count: sql<number>`COUNT(*)`,
  }).from(salesTable)
    .where(and(gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)))
    .groupBy(sql`TO_CHAR(${salesTable.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${salesTable.createdAt}, 'YYYY-MM')`);

  res.json(result.map(r => ({
    month: r.month,
    total: Number(r.total),
    count: Number(r.count),
  })));
});

router.get("/reports/sales-by-category", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
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

router.get("/reports/payment-type-breakdown", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
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

router.get("/reports/top-products", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;

  const result = await db.select({
    productId: saleItemsTable.productId,
    productName: productsTable.name,
    category: productsTable.category,
    totalQty: sql<number>`SUM(${saleItemsTable.qty})`,
    totalRevenue: sql<number>`SUM(${saleItemsTable.subtotal})`,
  }).from(saleItemsTable)
    .leftJoin(productsTable, eq(saleItemsTable.productId, productsTable.id))
    .groupBy(saleItemsTable.productId, productsTable.name, productsTable.category)
    .orderBy(sql`SUM(${saleItemsTable.qty}) DESC`)
    .limit(limit);

  res.json(result.map(r => ({
    productId: r.productId,
    productName: r.productName ?? "Desconocido",
    category: r.category ?? "ropa",
    totalQty: Number(r.totalQty),
    totalRevenue: Number(r.totalRevenue),
  })));
});

export default router;
