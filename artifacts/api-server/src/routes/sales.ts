import { Router, type IRouter } from "express";
import { eq, and, gte, lte, type SQL } from "drizzle-orm";
import { db, salesTable, saleItemsTable, productsTable, customersTable, usersTable, accountsReceivableTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

async function buildSaleResponse(saleId: number) {
  const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, saleId));
  if (!sale) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sale.userId));
  const customer = sale.customerId
    ? (await db.select().from(customersTable).where(eq(customersTable.id, sale.customerId)))[0]
    : null;
  const items = await db.select({
    id: saleItemsTable.id,
    productId: saleItemsTable.productId,
    qty: saleItemsTable.qty,
    unitPrice: saleItemsTable.unitPrice,
    subtotal: saleItemsTable.subtotal,
    productName: productsTable.name,
  }).from(saleItemsTable)
    .leftJoin(productsTable, eq(saleItemsTable.productId, productsTable.id))
    .where(eq(saleItemsTable.saleId, saleId));

  return {
    ...sale,
    total: parseFloat(sale.total),
    userName: user?.name ?? null,
    customerName: customer ? `${customer.firstName} ${customer.lastName}` : null,
    items: items.map(i => ({
      ...i,
      productName: i.productName ?? "Desconocido",
      unitPrice: parseFloat(i.unitPrice),
      subtotal: parseFloat(i.subtotal),
    })),
  };
}

router.get("/sales", requireAuth, async (req, res): Promise<void> => {
  const { userId, paymentType, from, to } = req.query;
  const conditions: SQL[] = [];

  // Cajero only sees their own sales
  if (req.user!.role === "cajero") {
    conditions.push(eq(salesTable.userId, req.user!.userId));
  } else if (userId && typeof userId === "string") {
    conditions.push(eq(salesTable.userId, parseInt(userId, 10)));
  }
  if (paymentType && typeof paymentType === "string") {
    conditions.push(eq(salesTable.paymentType, paymentType as "contado" | "credito"));
  }
  if (from && typeof from === "string") {
    conditions.push(gte(salesTable.createdAt, new Date(from)));
  }
  if (to && typeof to === "string") {
    conditions.push(lte(salesTable.createdAt, new Date(to)));
  }

  const sales = conditions.length > 0
    ? await db.select().from(salesTable).where(and(...conditions)).orderBy(salesTable.createdAt)
    : await db.select().from(salesTable).orderBy(salesTable.createdAt);

  const results = await Promise.all(sales.map(s => buildSaleResponse(s.id)));
  res.json(results.filter(Boolean));
});

router.post("/sales", requireAuth, async (req, res): Promise<void> => {
  const { customerId, paymentType, notes, items } = req.body as {
    customerId?: number;
    paymentType: "contado" | "credito";
    notes?: string;
    items: { productId: number; qty: number; unitPrice: number }[];
  };

  if (!paymentType || !items?.length) {
    res.status(400).json({ error: "Tipo de pago e items son requeridos" });
    return;
  }

  const total = items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);

  const [sale] = await db.insert(salesTable).values({
    userId: req.user!.userId,
    customerId: customerId ?? null,
    paymentType,
    total: String(total),
    notes,
  }).returning();

  await db.insert(saleItemsTable).values(
    items.map(i => ({
      saleId: sale.id,
      productId: i.productId,
      qty: i.qty,
      unitPrice: String(i.unitPrice),
      subtotal: String(i.qty * i.unitPrice),
    }))
  );

  // Reduce stock for each product
  for (const item of items) {
    await db.update(productsTable)
      .set({ stock: sql`${productsTable.stock} - ${item.qty}` })
      .where(eq(productsTable.id, item.productId));
  }

  // For credit sales, create an accounts receivable entry
  if (paymentType === "credito") {
    await db.insert(accountsReceivableTable).values({
      saleId: sale.id,
      customerId: customerId ?? null,
      totalAmount: String(total),
      paidAmount: "0",
      status: "pending",
    });
  }

  const result = await buildSaleResponse(sale.id);
  res.status(201).json(result);
});

router.get("/sales/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const result = await buildSaleResponse(id);
  if (!result) { res.status(404).json({ error: "Venta no encontrada" }); return; }
  // Cajero can only see own sales
  if (req.user!.role === "cajero" && result.userId !== req.user!.userId) {
    res.status(403).json({ error: "Acceso denegado" }); return;
  }
  res.json(result);
});

export default router;
