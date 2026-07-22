import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import {
  db,
  inventoryEntriesTable,
  productsTable,
  productVariantsTable,
  suppliersTable,
  accountsPayableTable,
  apPaymentsTable,
} from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

// POST /inventory-entries — receive merchandise, update stock, record expense
router.post("/inventory-entries", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { productId, variantId, supplierId, qty, unitCost, notes } = req.body;

  if (!productId || typeof productId !== "number" || !Number.isInteger(productId)) {
    res.status(400).json({ error: "productId inválido" }); return;
  }
  if (!qty || typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) {
    res.status(400).json({ error: "qty debe ser un entero positivo" }); return;
  }
  if (unitCost == null || typeof unitCost !== "number" || unitCost <= 0) {
    res.status(400).json({ error: "unitCost debe ser un número positivo" }); return;
  }
  const totalCost = qty * unitCost;

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  if (variantId) {
    const [variant] = await db.select().from(productVariantsTable).where(eq(productVariantsTable.id, variantId));
    if (!variant || variant.productId !== productId) {
      res.status(400).json({ error: "Variante no válida para este producto" });
      return;
    }
  }

  const entry = await db.transaction(async (tx) => {
    // 1. Record the entry
    const [newEntry] = await tx.insert(inventoryEntriesTable).values({
      productId,
      variantId: variantId ?? null,
      supplierId: supplierId ?? null,
      qty,
      unitCost: String(unitCost),
      totalCost: String(totalCost),
      notes: notes ?? null,
    }).returning();

    // 2. Update stock
    if (variantId) {
      await tx.update(productVariantsTable)
        .set({ stock: sql`${productVariantsTable.stock} + ${qty}` })
        .where(eq(productVariantsTable.id, variantId));
      // Sync product.stock = sum of variants
      await tx.execute(sql`
        UPDATE products SET stock = (
          SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id = ${productId}
        ) WHERE id = ${productId}
      `);
    } else {
      await tx.update(productsTable)
        .set({ stock: sql`${productsTable.stock} + ${qty}` })
        .where(eq(productsTable.id, productId));
    }

    // 3. Create accounts_payable (inventory_entry, immediately paid)
    const variantLabel = variantId ? " (variante)" : "";
    const [ap] = await tx.insert(accountsPayableTable).values({
      type: "inventory_entry" as any,
      description: `Ingreso inventario: ${product.name}${variantLabel} × ${qty}`,
      totalAmount: String(totalCost),
      paidAmount: String(totalCost),
      status: "paid",
    }).returning();

    // 4. Record the payment
    await tx.insert(apPaymentsTable).values({
      accountPayableId: ap.id,
      amount: String(totalCost),
      notes: `Recepción mercancía — ${product.name}${variantLabel}`,
    });

    return newEntry;
  });

  res.status(201).json({
    id: entry.id,
    productId: entry.productId,
    variantId: entry.variantId,
    supplierId: entry.supplierId,
    qty: entry.qty,
    unitCost: parseFloat(entry.unitCost),
    totalCost: parseFloat(entry.totalCost),
    notes: entry.notes,
    createdAt: entry.createdAt,
  });
});

// GET /inventory-entries?productId=X — list entries for movements history
router.get("/inventory-entries", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const productIdRaw = req.query.productId;
  const productId = productIdRaw ? parseInt(Array.isArray(productIdRaw) ? productIdRaw[0] : productIdRaw, 10) : null;

  const rows = await db.select({
    id: inventoryEntriesTable.id,
    productId: inventoryEntriesTable.productId,
    variantId: inventoryEntriesTable.variantId,
    supplierId: inventoryEntriesTable.supplierId,
    supplierName: suppliersTable.name,
    qty: inventoryEntriesTable.qty,
    unitCost: inventoryEntriesTable.unitCost,
    totalCost: inventoryEntriesTable.totalCost,
    notes: inventoryEntriesTable.notes,
    createdAt: inventoryEntriesTable.createdAt,
  }).from(inventoryEntriesTable)
    .leftJoin(suppliersTable, eq(inventoryEntriesTable.supplierId, suppliersTable.id))
    .where(productId ? eq(inventoryEntriesTable.productId, productId) : sql`1=1`)
    .orderBy(desc(inventoryEntriesTable.createdAt))
    .limit(200);

  res.json(rows.map(r => ({
    id: r.id,
    productId: r.productId,
    variantId: r.variantId,
    supplierId: r.supplierId,
    supplierName: r.supplierName ?? null,
    qty: r.qty,
    unitCost: parseFloat(r.unitCost),
    totalCost: parseFloat(r.totalCost),
    notes: r.notes,
    createdAt: r.createdAt,
  })));
});

export default router;
