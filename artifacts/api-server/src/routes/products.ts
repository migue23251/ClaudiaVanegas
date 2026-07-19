import { Router, type IRouter } from "express";
import { eq, ilike, or, and, type SQL, max, desc, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  db, productsTable, PRODUCT_CATEGORIES,
  purchaseOrderItemsTable, purchaseOrdersTable, suppliersTable,
  saleItemsTable, salesTable, customersTable,
  productVariantsTable,
} from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

async function nextProductCode(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): Promise<string> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(987654321)`);
  const [result] = await tx.select({ maxCode: max(productsTable.code) }).from(productsTable);
  const current = parseInt(result?.maxCode ?? "0", 10);
  return String(isNaN(current) ? 1 : current + 1);
}

function generateSku(productCode: string, color: string, size: string): string {
  const colorAbbr = color.slice(0, 3).toUpperCase().replace(/\s+/g, "");
  const sizeAbbr = size.toUpperCase().replace(/\s+/g, "");
  return `${productCode}-${colorAbbr}-${sizeAbbr}`;
}

/** Recompute product.stock = SUM(variant stocks). Call inside a tx whenever variant stock changes. */
async function syncProductStock(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  productId: number,
): Promise<void> {
  await tx
    .update(productsTable)
    .set({ stock: sql`(SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id = ${productId})` })
    .where(eq(productsTable.id, productId));
}

async function getVariantsForProducts(productIds: number[]) {
  if (productIds.length === 0) return [];
  return db
    .select()
    .from(productVariantsTable)
    .where(inArray(productVariantsTable.productId, productIds))
    .orderBy(productVariantsTable.color, productVariantsTable.size);
}

// ── List Products ────────────────────────────────────────────────────────────

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
  const allVariants = await getVariantsForProducts(products.map(p => p.id));

  res.json(products.map(p => ({
    ...p,
    costPrice: parseFloat(p.costPrice),
    salePrice: parseFloat(p.salePrice),
    variants: allVariants.filter(v => v.productId === p.id),
  })));
});

// ── Get single product ───────────────────────────────────────────────────────

router.get("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }
  const variants = await db
    .select()
    .from(productVariantsTable)
    .where(eq(productVariantsTable.productId, id))
    .orderBy(productVariantsTable.color, productVariantsTable.size);
  res.json({ ...product, costPrice: parseFloat(product.costPrice), salePrice: parseFloat(product.salePrice), variants });
});

// ── Create Product ───────────────────────────────────────────────────────────

router.post("/products", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { name, description, costPrice, salePrice, stock, category, images, variants } = req.body;
  if (!name || costPrice == null || salePrice == null || !category) {
    res.status(400).json({ error: "Campos requeridos faltantes" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const code = await nextProductCode(tx);

    // If variants are provided, initial product stock = sum of variant stocks; otherwise use provided stock
    const variantList: { color: string; size: string; stock?: number; images?: string[] }[] = variants ?? [];
    const initialStock = variantList.length > 0
      ? variantList.reduce((s: number, v: { stock?: number }) => s + (v.stock ?? 0), 0)
      : parseInt(String(stock ?? 0), 10);

    const [inserted] = await tx.insert(productsTable).values({
      code, name, description, costPrice: String(costPrice), salePrice: String(salePrice),
      stock: initialStock, category, images: images ?? [],
    }).returning();

    if (variantList.length > 0) {
      const skusUsed = new Set<string>();
      for (const v of variantList) {
        let sku = generateSku(code, v.color, v.size);
        if (skusUsed.has(sku)) sku = `${sku}-${Date.now()}`;
        skusUsed.add(sku);
        await tx.insert(productVariantsTable).values({
          productId: inserted.id,
          color: v.color,
          size: v.size,
          sku,
          stock: v.stock ?? 0,
          images: v.images ?? [],
        });
      }
    }

    const createdVariants = await tx
      .select()
      .from(productVariantsTable)
      .where(eq(productVariantsTable.productId, inserted.id));

    return { ...inserted, variants: createdVariants };
  });

  res.status(201).json({
    ...result,
    costPrice: parseFloat(result.costPrice),
    salePrice: parseFloat(result.salePrice),
  });
});

// ── Update Product ───────────────────────────────────────────────────────────

router.put("/products/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, description, costPrice, salePrice, stock, category, images } = req.body;
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (costPrice != null) updates.costPrice = String(costPrice);
  if (salePrice != null) updates.salePrice = String(salePrice);
  if (stock != null) {
    // Only allow direct stock update when product has no variants
    const existing = await db
      .select({ id: productVariantsTable.id })
      .from(productVariantsTable)
      .where(eq(productVariantsTable.productId, id))
      .limit(1);
    if (existing.length === 0) {
      updates.stock = parseInt(String(stock), 10);
    }
    // If it has variants, stock is computed from variants — ignore the field
  }
  if (category != null) updates.category = category;
  if (images != null) updates.images = images;
  if (req.body.isVisible != null) updates.isVisible = req.body.isVisible;

  const [product] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();
  if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  const variants = await db
    .select()
    .from(productVariantsTable)
    .where(eq(productVariantsTable.productId, id))
    .orderBy(productVariantsTable.color, productVariantsTable.size);

  res.json({ ...product, costPrice: parseFloat(product.costPrice), salePrice: parseFloat(product.salePrice), variants });
});

// ── Visibility toggle ────────────────────────────────────────────────────────

router.patch("/products/:id/visibility", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { isVisible } = req.body;
  if (typeof isVisible !== "boolean") {
    res.status(400).json({ error: "isVisible debe ser booleano" });
    return;
  }

  const [product] = await db.update(productsTable).set({ isVisible }).where(eq(productsTable.id, id)).returning();
  if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  const variants = await db
    .select()
    .from(productVariantsTable)
    .where(eq(productVariantsTable.productId, id))
    .orderBy(productVariantsTable.color, productVariantsTable.size);

  res.json({ ...product, costPrice: parseFloat(product.costPrice), salePrice: parseFloat(product.salePrice), variants });
});

// ── Delete Product ───────────────────────────────────────────────────────────

router.delete("/products/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [deleted] = await db.delete(productsTable).where(eq(productsTable.id, id)).returning({ id: productsTable.id });
  if (!deleted) { res.status(404).json({ error: "Producto no encontrado" }); return; }
  res.sendStatus(204);
});

// ── Variants CRUD ────────────────────────────────────────────────────────────

/** POST /products/:id/variants — add a new variant to a product */
router.post("/products/:id/variants", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const productId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { color, size, stock: variantStock, images, sku: customSku } = req.body as {
    color: string; size: string; stock?: number; images?: string[]; sku?: string;
  };

  if (!color || !size) {
    res.status(400).json({ error: "color y size son requeridos" });
    return;
  }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  const sku = customSku || generateSku(product.code, color, size);

  const variant = await db.transaction(async (tx) => {
    const [v] = await tx.insert(productVariantsTable).values({
      productId,
      color,
      size,
      sku,
      stock: variantStock ?? 0,
      images: images ?? [],
    }).returning();

    // Recompute product total stock
    await syncProductStock(tx, productId);
    return v;
  });

  res.status(201).json(variant);
});

/** PUT /products/:id/variants/:variantId — update a variant */
router.put("/products/:id/variants/:variantId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const productId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const variantId = parseInt(Array.isArray(req.params.variantId) ? req.params.variantId[0] : req.params.variantId, 10);

  const [existing] = await db
    .select()
    .from(productVariantsTable)
    .where(and(eq(productVariantsTable.id, variantId), eq(productVariantsTable.productId, productId)));
  if (!existing) { res.status(404).json({ error: "Variante no encontrada" }); return; }

  const updates: Record<string, unknown> = {};
  if (req.body.stock != null) updates.stock = parseInt(String(req.body.stock), 10);
  if (req.body.color != null) updates.color = req.body.color;
  if (req.body.size != null) updates.size = req.body.size;
  if (req.body.images != null) updates.images = req.body.images;
  if (req.body.sku != null) updates.sku = req.body.sku;

  const updated = await db.transaction(async (tx) => {
    const [v] = await tx
      .update(productVariantsTable)
      .set(updates)
      .where(eq(productVariantsTable.id, variantId))
      .returning();
    await syncProductStock(tx, productId);
    return v;
  });

  res.json(updated);
});

/** DELETE /products/:id/variants/:variantId — remove a variant */
router.delete("/products/:id/variants/:variantId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const productId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const variantId = parseInt(Array.isArray(req.params.variantId) ? req.params.variantId[0] : req.params.variantId, 10);

  await db.transaction(async (tx) => {
    await tx
      .delete(productVariantsTable)
      .where(and(eq(productVariantsTable.id, variantId), eq(productVariantsTable.productId, productId)));
    await syncProductStock(tx, productId);
  });

  res.sendStatus(204);
});

// ── Movements ────────────────────────────────────────────────────────────────

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

// ── Supplier ─────────────────────────────────────────────────────────────────

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

export default router;

// Re-export syncProductStock for use in other routes
export { syncProductStock };
