import { Router, type IRouter } from "express";
import { eq, and, type SQL } from "drizzle-orm";
import { db, purchaseOrdersTable, purchaseOrderItemsTable, productsTable, suppliersTable, accountsPayableTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

async function buildPOResponse(poId: number) {
  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, poId));
  if (!po) return null;
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, po.supplierId));
  const items = await db.select({
    id: purchaseOrderItemsTable.id,
    productId: purchaseOrderItemsTable.productId,
    qtyOrdered: purchaseOrderItemsTable.qtyOrdered,
    qtyReceived: purchaseOrderItemsTable.qtyReceived,
    unitCost: purchaseOrderItemsTable.unitCost,
    productName: productsTable.name,
  }).from(purchaseOrderItemsTable)
    .leftJoin(productsTable, eq(purchaseOrderItemsTable.productId, productsTable.id))
    .where(eq(purchaseOrderItemsTable.purchaseOrderId, poId));

  return {
    ...po,
    total: parseFloat(po.total),
    supplierName: supplier?.name ?? "Desconocido",
    items: items.map(i => ({
      ...i,
      productName: i.productName ?? "Desconocido",
      unitCost: parseFloat(i.unitCost),
    })),
  };
}

router.get("/purchase-orders", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { status } = req.query;
  const conditions: SQL[] = [];
  if (status && typeof status === "string") {
    conditions.push(eq(purchaseOrdersTable.status, status as "pending" | "partial" | "received" | "cancelled"));
  }
  const orders = conditions.length > 0
    ? await db.select().from(purchaseOrdersTable).where(and(...conditions)).orderBy(purchaseOrdersTable.createdAt)
    : await db.select().from(purchaseOrdersTable).orderBy(purchaseOrdersTable.createdAt);

  const results = await Promise.all(orders.map(o => buildPOResponse(o.id)));
  res.json(results.filter(Boolean));
});

router.post("/purchase-orders", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { supplierId, guideNumber, paymentType, notes, items } = req.body;
  if (!supplierId || !guideNumber || !paymentType || !items?.length) {
    res.status(400).json({ error: "Campos requeridos faltantes" });
    return;
  }
  const total = items.reduce((sum: number, i: { qtyOrdered: number; unitCost: number }) =>
    sum + i.qtyOrdered * i.unitCost, 0);

  const [po] = await db.insert(purchaseOrdersTable).values({
    supplierId, guideNumber, paymentType, notes, total: String(total),
  }).returning();

  await db.insert(purchaseOrderItemsTable).values(
    items.map((i: { productId: number; qtyOrdered: number; unitCost: number }) => ({
      purchaseOrderId: po.id,
      productId: i.productId,
      qtyOrdered: i.qtyOrdered,
      qtyReceived: 0,
      unitCost: String(i.unitCost),
    }))
  );

  // For credit orders, create an accounts payable entry
  if (paymentType === "credito") {
    await db.insert(accountsPayableTable).values({
      purchaseOrderId: po.id,
      totalAmount: String(total),
      paidAmount: "0",
      status: "pending",
    });
  }

  const result = await buildPOResponse(po.id);
  res.status(201).json(result);
});

router.get("/purchase-orders/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const result = await buildPOResponse(id);
  if (!result) { res.status(404).json({ error: "Orden no encontrada" }); return; }
  res.json(result);
});

router.put("/purchase-orders/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { guideNumber, paymentType, status, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (guideNumber) updates.guideNumber = guideNumber;
  if (paymentType) updates.paymentType = paymentType;
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  const [updated] = await db.update(purchaseOrdersTable).set(updates).where(eq(purchaseOrdersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Orden no encontrada" }); return; }
  const result = await buildPOResponse(id);
  res.json(result);
});

router.post("/purchase-orders/:id/receive", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { items } = req.body as { items: { purchaseOrderItemId: number; qtyReceived: number }[] };
  if (!items?.length) { res.status(400).json({ error: "Items requeridos" }); return; }

  for (const item of items) {
    const [poItem] = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.id, item.purchaseOrderItemId));
    if (!poItem) continue;
    const newReceived = Math.min(poItem.qtyReceived + item.qtyReceived, poItem.qtyOrdered);
    await db.update(purchaseOrderItemsTable)
      .set({ qtyReceived: newReceived })
      .where(eq(purchaseOrderItemsTable.id, item.purchaseOrderItemId));
    // Update product stock
    await db.update(productsTable)
      .set({ stock: sql`${productsTable.stock} + ${item.qtyReceived}` })
      .where(eq(productsTable.id, poItem.productId));
  }

  // Determine new PO status
  const allItems = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, id));
  const allReceived = allItems.every(i => i.qtyReceived >= i.qtyOrdered);
  const anyReceived = allItems.some(i => i.qtyReceived > 0);
  const newStatus = allReceived ? "received" : anyReceived ? "partial" : "pending";
  await db.update(purchaseOrdersTable).set({ status: newStatus }).where(eq(purchaseOrdersTable.id, id));

  const result = await buildPOResponse(id);
  res.json(result);
});

export default router;
