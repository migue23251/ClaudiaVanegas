import { Router, type IRouter } from "express";
import { eq, ilike, or, and, type SQL, max } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, productsTable, PRODUCT_CATEGORIES } from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

/**
 * Generate the next consecutive product code inside a transaction.
 * Uses a pg advisory lock so concurrent creates don't race on MAX(code).
 * The caller must pass the Drizzle transaction context (tx).
 */
async function nextProductCode(tx: typeof db): Promise<string> {
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

  const products = await query.orderBy(productsTable.name);
  res.json(products.map(p => ({
    ...p,
    costPrice: parseFloat(p.costPrice),
    salePrice: parseFloat(p.salePrice),
  })));
});

router.post("/products", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { code: rawCode, name, description, costPrice, salePrice, stock, category, images } = req.body;
  if (!name || costPrice == null || salePrice == null || stock == null || !category) {
    res.status(400).json({ error: "Campos requeridos faltantes" });
    return;
  }

  const product = await db.transaction(async (tx) => {
    // Generate code inside the transaction so the advisory lock serializes concurrent creates
    const code = rawCode?.trim() || await nextProductCode(tx);
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

router.put("/products/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { code, name, description, costPrice, salePrice, stock, category, images } = req.body;
  const updates: Record<string, unknown> = {};
  if (code != null) updates.code = code;
  if (name != null) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (costPrice != null) updates.costPrice = String(costPrice);
  if (salePrice != null) updates.salePrice = String(salePrice);
  if (stock != null) updates.stock = parseInt(String(stock), 10);
  if (category != null) updates.category = category;
  if (images != null) updates.images = images;

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
