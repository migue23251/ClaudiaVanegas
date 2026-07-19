import { Router, type IRouter } from "express";
import { eq, and, inArray, type SQL } from "drizzle-orm";
import { db, productsTable, PRODUCT_CATEGORIES, settingsTable, productVariantsTable } from "@workspace/db";

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
 * Returns store branding + categories + products with variants.
 * Optional query params: ?category=blusas&color=rojo&size=M
 */
router.get("/catalog", async (req, res): Promise<void> => {
  const { category, color, size } = req.query;
  const conditions: SQL[] = [];

  if (
    category &&
    typeof category === "string" &&
    (PRODUCT_CATEGORIES as readonly string[]).includes(category)
  ) {
    conditions.push(eq(productsTable.category, category as typeof PRODUCT_CATEGORIES[number]));
  }

  conditions.push(eq(productsTable.isVisible, true));

  const [settingsResult, products] = await Promise.all([
    getPublicSettings(),
    db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        description: productsTable.description,
        salePrice: productsTable.salePrice,
        category: productsTable.category,
        images: productsTable.images,
        stock: productsTable.stock,
      })
      .from(productsTable)
      .where(and(...conditions))
      .orderBy(productsTable.category, productsTable.name),
  ]);

  // Load variants for all visible products
  const productIds = products.map(p => p.id);
  const allVariants = productIds.length > 0
    ? await db
        .select({
          id: productVariantsTable.id,
          productId: productVariantsTable.productId,
          color: productVariantsTable.color,
          size: productVariantsTable.size,
          sku: productVariantsTable.sku,
          stock: productVariantsTable.stock,
          images: productVariantsTable.images,
        })
        .from(productVariantsTable)
        .where(inArray(productVariantsTable.productId, productIds))
        .orderBy(productVariantsTable.color, productVariantsTable.size)
    : [];

  // Filter products by color/size if requested (via variant filtering)
  let filteredProducts = products;
  if ((color && typeof color === "string") || (size && typeof size === "string")) {
    const matchingProductIds = new Set<number>();
    for (const v of allVariants) {
      const colorMatch = !color || v.color === color;
      const sizeMatch = !size || v.size === size;
      if (colorMatch && sizeMatch) {
        matchingProductIds.add(v.productId);
      }
    }
    filteredProducts = products.filter(p => {
      // Include product if it has no variants (simple product) or has a matching variant
      const productVariants = allVariants.filter(v => v.productId === p.id);
      if (productVariants.length === 0) return true; // Simple product — always include
      return matchingProductIds.has(p.id);
    });
  }

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
    products: filteredProducts.map((p) => ({
      ...p,
      salePrice: parseFloat(p.salePrice),
      stock: parseInt(p.stock as unknown as string, 10),
      variants: allVariants.filter(v => v.productId === p.id),
    })),
  });
});

export default router;
