import { Router, type IRouter } from "express";
import { eq, ilike, or, and, type SQL, max, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  db, productsTable, PRODUCT_CATEGORIES,
  purchaseOrderItemsTable, purchaseOrdersTable, suppliersTable,
  saleItemsTable, salesTable, customersTable,
} from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

/**
 * Generate the next consecutive product code inside a transaction.
 * Uses a pg advisory lock so concurrent creates don't race on MAX(code).
 * The caller must pass the Drizzle transaction context (tx).
 */
async function nextProductCode(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): Promise<string> {
  // Serialize code generation across concurrent requests
  await tx.execute(sql`SELECT pg_advisory_xact_lock(987654321)`);
  const [result] = await tx.select({ maxCode: max(productsTable.code) }).from(productsTable);
  const current = parseInt(result?.maxCode ?? "0", 10);
  return String(isNaN(current) ? 1 : current + 1);
}

router.get("/products", requireAuth, async (req, res): Promise<void> => {
  const { search, category, lowStock } = req.query;
  const conditions: SQL[] = [];

  if (search && typeof search === "string") {
    conditions.push(
      or(
        ilike(productsTable.name, `%${search}%`),
        ilike(productsTable.code, `%${search}%`),
      )!,
    );
  }
  if (category && typeof category === "string") {
    conditions.push(eq(productsTable.category, category as typeof PRODUCT_CATEGORIES[number]));
  }
  if (lowStock === "true") {
    conditions.push(sql`${productsTable.stock} <= 5`);
  }

  const query = conditions.length > 0
    ? db.select().from(productsTable).where(and(...conditions))
    : db.select().from(productsTable);

  const products = await query.orderBy(productsTable.category, productsTable.name);
  res.json(products.map(p => ({
    ...p,
    costPrice: parseFloat(p.costPrice),
    salePrice: parseFloat(p.salePrice),
  })));
});

router.patch("/products/:id/visibility", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { isVisible } = req.body;
  if (typeof isVisible !== "boolean") {
    res.status(400).json({ error: "isVisible debe ser booleano" });
    return;
  }

  const [product] = await db.update(productsTable).set({ isVisible }).where(eq(productsTable.id, id)).returning();
  if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }
  res.json({ ...product, costPrice: parseFloat(product.costPrice), salePrice: parseFloat(product.salePrice) });
});

router.post("/products", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { name, description, costPrice, salePrice, stock, category, images } = req.body;
  if (!name || costPrice == null || salePrice == null || stock == null || !category) {
    res.status(400).json({ error: "Campos requeridos faltantes" });
    return;
  }

  const product = await db.transaction(async (tx) => {
    // The code is always auto-generated on creation; clients cannot set it.
    const code = await nextProductCode(tx);
    const [inserted] = await tx.insert(productsTable).values({
      code, name, description, costPrice: String(costPrice), salePrice: String(salePrice),
      stock: parseInt(String(stock), 10), category, images: images ?? [],
    }).returning();
    return inserted;
  });

  res.status(201).json({ ...product, costPrice: parseFloat(product.costPrice), salePrice: parseFloat(product.salePrice) });
});

router.get("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }
  res.json({ ...product, costPrice: parseFloat(product.costPrice), salePrice: parseFloat(product.salePrice) });
});

router.get("/products/:id/movements", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  const incoming = await db.select({
    id: purchaseOrderItemsTable.id,
    purchaseOrderId: purchaseOrdersTable.id,
    supplierName: suppliersTable.name,
    qtyOrdered: purchaseOrderItemsTable.qtyOrdered,
    qtyReceived: purchaseOrderItemsTable.qtyReceived,
    unitCost: purchaseOrderItemsTable.unitCost,
    date: purchaseOrdersTable.createdAt,
  }).from(purchaseOrderItemsTable)
    .innerJoin(purchaseOrdersTable, eq(purchaseOrderItemsTable.purchaseOrderId, purchaseOrdersTable.id))
    .leftJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id))
    .where(and(eq(purchaseOrderItemsTable.productId, id), sql`${purchaseOrdersTable.status} != 'cancelled'`))
    .orderBy(desc(purchaseOrdersTable.createdAt));

  const outgoing = await db.select({
    id: saleItemsTable.id,
    saleId: salesTable.id,
    customerName: customersTable.firstName,
    customerLastName: customersTable.lastName,
    qty: saleItemsTable.qty,
    unitPrice: saleItemsTable.unitPrice,
    date: salesTable.createdAt,
  }).from(saleItemsTable)
    .innerJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id))
    .leftJoin(customersTable, eq(salesTable.customerId, customersTable.id))
    .where(and(eq(saleItemsTable.productId, id), eq(salesTable.voided, false)))
    .orderBy(desc(salesTable.createdAt));

  res.json({
    incoming: incoming.map(i => ({
      id: i.id,
      purchaseOrderId: i.purchaseOrderId,
      supplierName: i.supplierName ?? "Desconocido",
      qtyOrdered: i.qtyOrdered,
      qtyReceived: i.qtyReceived,
      unitCost: parseFloat(i.unitCost),
      date: i.date,
    })),
    outgoing: outgoing.map(o => ({
      id: o.id,
      saleId: o.saleId,
      customerName: o.customerName ? `${o.customerName} ${o.customerLastName ?? ""}`.trim() : "Cliente Genérico",
      qty: o.qty,
      unitPrice: parseFloat(o.unitPrice),
      date: o.date,
    })),
  });
});

router.get("/products/:id/supplier", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  const [supplier] = await db.select({
    id: suppliersTable.id,
    name: suppliersTable.name,
    contact: suppliersTable.contact,
    email: suppliersTable.email,
    phone: suppliersTable.phone,
    createdAt: suppliersTable.createdAt,
  }).from(purchaseOrderItemsTable)
    .innerJoin(purchaseOrdersTable, eq(purchaseOrderItemsTable.purchaseOrderId, purchaseOrdersTable.id))
    .innerJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id))
    .where(and(eq(purchaseOrderItemsTable.productId, id), sql`${purchaseOrdersTable.status} != 'cancelled'`))
    .orderBy(desc(purchaseOrdersTable.createdAt))
    .limit(1);

  res.json(supplier ?? null);
});

router.put("/products/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, description, costPrice, salePrice, stock, category, images } = req.body;
  const updates: Record<string, unknown> = {};
  // code is immutable after creation and cannot be changed via this endpoint
  if (name != null) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (costPrice != null) updates.costPrice = String(costPrice);
  if (salePrice != null) updates.salePrice = String(salePrice);
  if (stock != null) updates.stock = parseInt(String(stock), 10);
  if (category != null) updates.category = category;
  if (images != null) updates.images = images;
  if (req.body.isVisible != null) updates.isVisible = req.body.isVisible;

  const [product] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();
  if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }
  res.json({ ...product, costPrice: parseFloat(product.costPrice), salePrice: parseFloat(product.salePrice) });
});

router.delete("/products/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [deleted] = await db.delete(productsTable).where(eq(productsTable.id, id)).returning({ id: productsTable.id });
  if (!deleted) { res.status(404).json({ error: "Producto no encontrado" }); return; }
  res.sendStatus(204);
});

export default router;
