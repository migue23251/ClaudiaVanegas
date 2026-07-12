import { Router, type IRouter } from "express";
import { eq, and, type SQL } from "drizzle-orm";
import { db, productsTable, PRODUCT_CATEGORIES } from "@workspace/db";

const router: IRouter = Router();

/**
 * GET /api/catalog
 * Public endpoint — no auth required.
 * Returns categories list and products (only public fields: no costPrice, no stock).
 * Optional query param: ?category=blusas
 */
router.get("/catalog", async (req, res): Promise<void> => {
  const { category } = req.query;
  const conditions: SQL[] = [];

  if (
    category &&
    typeof category === "string" &&
    (PRODUCT_CATEGORIES as readonly string[]).includes(category)
  ) {
    conditions.push(
      eq(productsTable.category, category as typeof PRODUCT_CATEGORIES[number])
    );
  }

  const base = db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      description: productsTable.description,
      salePrice: productsTable.salePrice,
      category: productsTable.category,
      images: productsTable.images,
    })
    .from(productsTable);

  const query =
    conditions.length > 0 ? base.where(and(...conditions)) : base;

  const products = await query.orderBy(
    productsTable.category,
    productsTable.name
  );

  res.json({
    categories: PRODUCT_CATEGORIES,
    products: products.map((p) => ({
      ...p,
      salePrice: parseFloat(p.salePrice),
    })),
  });
});

export default router;
