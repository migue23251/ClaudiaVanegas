---
name: POS Variants System
description: How product variants (color + size) are implemented across the full stack
---

## Architecture

- **Table:** `productVariantsTable` — id, productId (FK cascade), color, size, sku (unique), stock (int), images (jsonb), createdAt
- **Stock sync:** `syncProductStock()` recalculates `productsTable.stock = SUM(variantStock)` inside transactions. Called whenever a variant's stock changes.
- **SKU format:** `{CODE}-{COLOR[0:3].upper}-{SIZE}` — auto-generated if not provided.
- **Legacy products** (no variants) use `productsTable.stock` directly. Null variantId in sale/PO items = simple product.

## Colors & Sizes

Defined as const arrays in `lib/db/src/schema/product_variants.ts`:
- `VARIANT_COLORS`: blanco, negro, gris, beige, crema, rojo, rosa, fucsia, naranja, amarillo, verde, azul, morado, vinotinto, café, multicolor
- `VARIANT_SIZES`: XS, S, M, L, XL, XXL, 34–42 (shoes), 6–16 (children), Único
- `COLOR_HEX` map: color name → hex string (duplicated in each frontend page for self-containment)

## API Routes

- `POST /products/:id/variants` — create variant
- `PUT /products/:id/variants/:variantId` — update (stock, color, size, sku, images)
- `DELETE /products/:id/variants/:variantId` — delete + syncProductStock
- All product list/get responses include `variants: ProductVariant[]`
- `GET /catalog?color=&size=` — optional filter params

## Frontend pages

- **inventario.tsx** — tabbed dialog: Información (stock read-only when variants exist) + Variantes (list with inline edit, add form)
- **pos.tsx** — CartItem keyed by `${productId}-${variantId ?? "none"}` (`cartKey`). Clicking product with variants opens variant picker dialog (color → size grid). Sale payload includes variantId per item.
- **ordenes-compra.tsx** — LineItem has optional variantId. Variant dropdown shown per line when product has variants. PO receive screen shows variant color/size/sku.
- **catalogo.tsx** — ProductCard shows color swatches (dot row). ProductModal has inline color → size picker. CartItem uses cartKey. CartDrawer shows variant color swatch + label.

**Why:** Products like clothing exist in many color/size combos that need independent stock tracking.

**How to apply:** Any new feature touching product stock must check whether the product has variants and either operate on the variant stock (then call syncProductStock) or on the product stock directly.
