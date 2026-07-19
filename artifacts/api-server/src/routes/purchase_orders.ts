import { Router, type IRouter } from "express";
import { eq, and, desc, type SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  db, purchaseOrdersTable, purchaseOrderItemsTable, productsTable, suppliersTable,
  accountsPayableTable, productVariantsTable,
} from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

async function buildPOResponse(poId: number) {
  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, poId));
  if (!po) return null;
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, po.supplierId));
  const items = await db.select({
    id: purchaseOrderItemsTable.id,
    productId: purchaseOrderItemsTable.productId,
    variantId: purchaseOrderItemsTable.variantId,
    qtyOrdered: purchaseOrderItemsTable.qtyOrdered,
    qtyReceived: purchaseOrderItemsTable.qtyReceived,
    unitCost: purchaseOrderItemsTable.unitCost,
    productName: productsTable.name,
    description: productsTable.description,
    salePrice: productsTable.salePrice,
    variantColor: productVariantsTable.color,
    variantSize: productVariantsTable.size,
    variantSku: productVariantsTable.sku,
  }).from(purchaseOrderItemsTable)
    .leftJoin(productsTable, eq(purchaseOrderItemsTable.productId, productsTable.id))
    .leftJoin(productVariantsTable, eq(purchaseOrderItemsTable.variantId, productVariantsTable.id))
    .where(eq(purchaseOrderItemsTable.purchaseOrderId, poId));

  return {
    ...po,
    total: parseFloat(po.total),
    supplierName: supplier?.name ?? "Desconocido",
    items: items.map(i => ({
      ...i,
      productName: i.productName ?? "Desconocido",
      description: i.description ?? null,
      variantColor: i.variantColor ?? null,
      variantSize: i.variantSize ?? null,
      variantSku: i.variantSku ?? null,
      unitCost: parseFloat(i.unitCost),
      salePrice: i.salePrice != null ? parseFloat(i.salePrice) : null,
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
    ? await db.select().from(purchaseOrdersTable).where(and(...conditions)).orderBy(desc(purchaseOrdersTable.createdAt))
    : await db.select().from(purchaseOrdersTable).orderBy(desc(purchaseOrdersTable.createdAt));

  let results = (await Promise.all(orders.map(o => buildPOResponse(o.id)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof buildPOResponse>>>[];

  if (supplierSearch && typeof supplierSearch === "string") {
    const q = supplierSearch.toLowerCase();
    results = results.filter(r => r.supplierName.toLowerCase().includes(q));
  }

  res.json(results);
});

router.post("/purchase-orders", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { supplierId, guideNumber, paymentType, notes, items } = req.body;
  if (!supplierId || !paymentType || !items?.length) {
    res.status(400).json({ error: "Campos requeridos faltantes" });
    return;
  }

  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
  if (!supplier) {
    res.status(400).json({ error: "Proveedor no encontrado" });
    return;
  }

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
    if (item.variantId) {
      const [variant] = await db
        .select()
        .from(productVariantsTable)
        .where(and(eq(productVariantsTable.id, item.variantId), eq(productVariantsTable.productId, item.productId)));
      if (!variant) {
        res.status(400).json({ error: `Variante ${item.variantId} no es válida para el producto "${product.name}"` });
        return;
      }
    }
  }

  const total = items.reduce((sum: number, i: { qtyOrdered: number; unitCost: number }) =>
    sum + i.qtyOrdered * i.unitCost, 0);

  const poId = await db.transaction(async (tx) => {
    const [po] = await tx.insert(purchaseOrdersTable).values({
      supplierId, guideNumber: guideNumber || null, paymentType, notes, total: String(total),
    }).returning();

    await tx.insert(purchaseOrderItemsTable).values(
      items.map((i: { productId: number; variantId?: number; qtyOrdered: number; unitCost: number }) => ({
        purchaseOrderId: po.id,
        productId: i.productId,
        variantId: i.variantId ?? null,
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
  const { guideNumber, paymentType, status, notes, supplierId, items } = req.body;

  const [existing] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Orden no encontrada" }); return; }

  const existingItems = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, id));
  const someReceived = existingItems.some(i => i.qtyReceived > 0);

  if (status === "cancelled") {
    if (someReceived) {
      res.status(400).json({ error: "No se puede anular una orden con productos ya recibidos" });
      return;
    }
    const [ap] = await db.select().from(accountsPayableTable).where(eq(accountsPayableTable.purchaseOrderId, id));
    if (ap && parseFloat(ap.paidAmount) > 0) {
      res.status(400).json({ error: "No se puede anular una orden con pagos registrados" });
      return;
    }
    await db.transaction(async (tx) => {
      await tx.update(purchaseOrdersTable).set({ status: "cancelled" }).where(eq(purchaseOrdersTable.id, id));
      if (ap) await tx.delete(accountsPayableTable).where(eq(accountsPayableTable.id, ap.id));
    });
    const result = await buildPOResponse(id);
    res.json(result);
    return;
  }

  if ((items || supplierId != null) && existing.status === "received") {
    res.status(400).json({ error: "No se puede modificar una orden ya recibida en su totalidad" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (guideNumber !== undefined) updates.guideNumber = guideNumber || null;
  if (paymentType != null) updates.paymentType = paymentType;
  if (notes !== undefined) updates.notes = notes;
  if (supplierId != null) updates.supplierId = supplierId;

  await db.transaction(async (tx) => {
    if (items?.length) {
      if (someReceived) {
        throw Object.assign(new Error("No se pueden modificar los productos de una orden con recepciones parciales"), { status: 400 });
      }
      await tx.delete(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, id));
      await tx.insert(purchaseOrderItemsTable).values(
        items.map((i: { productId: number; variantId?: number; qtyOrdered: number; unitCost: number }) => ({
          purchaseOrderId: id,
          productId: i.productId,
          variantId: i.variantId ?? null,
          qtyOrdered: i.qtyOrdered,
          unitCost: String(i.unitCost),
        }))
      );
      const total = items.reduce((sum: number, i: { qtyOrdered: number; unitCost: number }) => sum + i.qtyOrdered * i.unitCost, 0);
      updates.total = String(total);
      const [ap] = await tx.select().from(accountsPayableTable).where(eq(accountsPayableTable.purchaseOrderId, id));
      if (ap) await tx.update(accountsPayableTable).set({ totalAmount: String(total) }).where(eq(accountsPayableTable.id, ap.id));
    }
    if (Object.keys(updates).length > 0) {
      await tx.update(purchaseOrdersTable).set(updates).where(eq(purchaseOrdersTable.id, id));
    }
  }).catch((err) => {
    if (err?.status === 400) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  });

  if (res.headersSent) return;
  const result = await buildPOResponse(id);
  res.json(result);
});

router.post("/purchase-orders/:id/receive", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { items } = req.body as {
    items: { purchaseOrderItemId: number; qtyReceived: number; salePrice?: number }[];
  };

  if (!items?.length) {
    res.status(400).json({ error: "Items requeridos" }); return;
  }

  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!po) { res.status(404).json({ error: "Orden no encontrada" }); return; }

  await db.transaction(async (tx) => {
    for (const { purchaseOrderItemId, qtyReceived, salePrice } of items) {
      if (qtyReceived <= 0) continue;
      const [item] = await tx.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.id, purchaseOrderItemId));
      if (!item) continue;
      const newReceived = item.qtyReceived + qtyReceived;
      await tx.update(purchaseOrderItemsTable)
        .set({ qtyReceived: newReceived })
        .where(eq(purchaseOrderItemsTable.id, purchaseOrderItemId));

      if (item.variantId) {
        // Update variant stock
        await tx.update(productVariantsTable)
          .set({ stock: sql`${productVariantsTable.stock} + ${qtyReceived}` })
          .where(eq(productVariantsTable.id, item.variantId));
        // Sync product total stock from sum of variants
        await tx.update(productsTable)
          .set({ stock: sql`(SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id = ${item.productId})` })
          .where(eq(productsTable.id, item.productId));
        if (salePrice != null && salePrice > 0) {
          await tx.update(productsTable).set({ salePrice: String(salePrice) }).where(eq(productsTable.id, item.productId));
        }
      } else {
        const productUpdates: Record<string, unknown> = {
          stock: sql`${productsTable.stock} + ${qtyReceived}`,
        };
        if (salePrice != null && salePrice > 0) {
          productUpdates.salePrice = String(salePrice);
        }
        await tx.update(productsTable)
          .set(productUpdates)
          .where(eq(productsTable.id, item.productId));
      }
    }

    const allItems = await tx.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, id));
    const allReceived = allItems.every(i => i.qtyReceived >= i.qtyOrdered);
    const someRec = allItems.some(i => i.qtyReceived > 0);
    const newStatus = allReceived ? "received" : someRec ? "partial" : "pending";
    await tx.update(purchaseOrdersTable).set({ status: newStatus }).where(eq(purchaseOrdersTable.id, id));
  });

  const result = await buildPOResponse(id);
  res.json(result);
});

export default router;
