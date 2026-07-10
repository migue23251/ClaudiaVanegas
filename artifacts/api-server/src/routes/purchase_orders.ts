import { Router, type IRouter } from "express";
import { eq, and, ilike, type SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, purchaseOrdersTable, purchaseOrderItemsTable, productsTable, suppliersTable, accountsPayableTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";

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
  const { status, supplierId, supplierSearch } = req.query;
  const conditions: SQL[] = [];
  if (status && typeof status === "string") {
    conditions.push(eq(purchaseOrdersTable.status, status as "pending" | "partial" | "received" | "cancelled"));
  }
  if (supplierId && typeof supplierId === "string") {
    conditions.push(eq(purchaseOrdersTable.supplierId, parseInt(supplierId, 10)));
  }

  const orders = conditions.length > 0
    ? await db.select().from(purchaseOrdersTable).where(and(...conditions)).orderBy(purchaseOrdersTable.createdAt)
    : await db.select().from(purchaseOrdersTable).orderBy(purchaseOrdersTable.createdAt);

  let results = (await Promise.all(orders.map(o => buildPOResponse(o.id)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof buildPOResponse>>>[];

  // Filter by supplier name (client-side after joining)
  if (supplierSearch && typeof supplierSearch === "string") {
    const q = supplierSearch.toLowerCase();
    results = results.filter(r => r.supplierName.toLowerCase().includes(q));
  }

  res.json(results);
});

router.post("/purchase-orders", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { supplierId, guideNumber, paymentType, notes, items } = req.body;
  if (!supplierId || !guideNumber || !paymentType || !items?.length) {
    res.status(400).json({ error: "Campos requeridos faltantes" });
    return;
  }

  // Validate supplier exists
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
  if (!supplier) {
    res.status(400).json({ error: "Proveedor no encontrado" });
    return;
  }

  // Validate all products exist
  for (const item of items) {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    if (!product) {
      res.status(400).json({ error: `Producto con ID ${item.productId} no existe` });
      return;
    }
    if (item.qtyOrdered <= 0 || item.unitCost < 0) {
      res.status(400).json({ error: `Cantidad o costo inválido para el producto ${item.productId}` });
      return;
    }
  }

  const total = items.reduce((sum: number, i: { qtyOrdered: number; unitCost: number }) =>
    sum + i.qtyOrdered * i.unitCost, 0);

  const poId = await db.transaction(async (tx) => {
    const [po] = await tx.insert(purchaseOrdersTable).values({
      supplierId, guideNumber, paymentType, notes, total: String(total),
    }).returning();

    await tx.insert(purchaseOrderItemsTable).values(
      items.map((i: { productId: number; qtyOrdered: number; unitCost: number }) => ({
        purchaseOrderId: po.id,
        productId: i.productId,
        qtyOrdered: i.qtyOrdered,
        unitCost: String(i.unitCost),
      }))
    );

    if (paymentType === "credito") {
      await tx.insert(accountsPayableTable).values({
        purchaseOrderId: po.id,
        totalAmount: String(total),
        paidAmount: "0",
        status: "pending",
      });
    }

    return po.id;
  });

  const result = await buildPOResponse(poId);
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
  if (guideNumber != null) updates.guideNumber = guideNumber;
  if (paymentType != null) updates.paymentType = paymentType;
  if (status != null) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  const [po] = await db.update(purchaseOrdersTable).set(updates).where(eq(purchaseOrdersTable.id, id)).returning();
  if (!po) { res.status(404).json({ error: "Orden no encontrada" }); return; }
  const result = await buildPOResponse(po.id);
  res.json(result);
});

router.post("/purchase-orders/:id/receive", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { items } = req.body as { items: { purchaseOrderItemId: number; qtyReceived: number }[] };

  if (!items?.length) {
    res.status(400).json({ error: "Items requeridos" }); return;
  }

  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!po) { res.status(404).json({ error: "Orden no encontrada" }); return; }

  await db.transaction(async (tx) => {
    for (const { purchaseOrderItemId, qtyReceived } of items) {
      if (qtyReceived <= 0) continue;
      const [item] = await tx.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.id, purchaseOrderItemId));
      if (!item) continue;
      const newReceived = item.qtyReceived + qtyReceived;
      await tx.update(purchaseOrderItemsTable)
        .set({ qtyReceived: newReceived })
        .where(eq(purchaseOrderItemsTable.id, purchaseOrderItemId));
      await tx.update(productsTable)
        .set({ stock: sql`${productsTable.stock} + ${qtyReceived}` })
        .where(eq(productsTable.id, item.productId));
    }

    // Recalculate status
    const allItems = await tx.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, id));
    const allReceived = allItems.every(i => i.qtyReceived >= i.qtyOrdered);
    const someReceived = allItems.some(i => i.qtyReceived > 0);
    const newStatus = allReceived ? "received" : someReceived ? "partial" : "pending";
    await tx.update(purchaseOrdersTable).set({ status: newStatus }).where(eq(purchaseOrdersTable.id, id));
  });

  const result = await buildPOResponse(id);
  res.json(result);
});

export default router;
