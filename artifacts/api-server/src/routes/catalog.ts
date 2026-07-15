import { Router, type IRouter } from "express";
import { eq, and, type SQL } from "drizzle-orm";
import { db, productsTable, PRODUCT_CATEGORIES, settingsTable } from "@workspace/db";

const router: IRouter = Router();

async function getPublicSettings() {
  const [existing] = await db
    .select({
      storeName: settingsTable.storeName,
      logoUrl: settingsTable.logoUrl,
      primaryColor: settingsTable.primaryColor,
      storePhone: settingsTable.storePhone,
      storeAddress: settingsTable.storeAddress,
      instagramUrl: settingsTable.instagramUrl,
      tiktokUrl: settingsTable.tiktokUrl,
    })
    .from(settingsTable);

  if (existing) return existing;

  // First boot — create row with defaults and return it
  const [created] = await db
    .insert(settingsTable)
    .values({ storeName: "Claudia Vanegas" })
    .returning({
      storeName: settingsTable.storeName,
      logoUrl: settingsTable.logoUrl,
      primaryColor: settingsTable.primaryColor,
      storePhone: settingsTable.storePhone,
      storeAddress: settingsTable.storeAddress,
      instagramUrl: settingsTable.instagramUrl,
      tiktokUrl: settingsTable.tiktokUrl,
    });
  return created;
}

/**
 * GET /api/catalog
 * Public endpoint — no auth required.
 * Returns store branding + categories + products (no costPrice, no stock).
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

  conditions.push(eq(productsTable.isVisible, true));

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

  const [settingsResult, products] = await Promise.all([
    getPublicSettings(),
    base.where(and(...conditions)).orderBy(
      productsTable.category,
      productsTable.name
    ),
  ]);

  res.json({
    store: {
      name: settingsResult.storeName,
      logoUrl: settingsResult.logoUrl ?? null,
      primaryColor: settingsResult.primaryColor ?? null,
      phone: settingsResult.storePhone ?? null,
      address: settingsResult.storeAddress ?? null,
      instagramUrl: settingsResult.instagramUrl ?? null,
      tiktokUrl: settingsResult.tiktokUrl ?? null,
    },
    categories: PRODUCT_CATEGORIES,
    products: products.map((p) => ({
      ...p,
      salePrice: parseFloat(p.salePrice),
    })),
  });
});

export default router;
