import { Router, type IRouter } from "express";
import { eq, desc, inArray, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  db, catalogOrdersTable, catalogOrderItemsTable, productsTable,
  salesTable, saleItemsTable, accountsReceivableTable, arPaymentsTable,
  productVariantsTable, customersTable,
} from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";
import { createBoldPaymentLink } from "../lib/bold";
import { bogotaNow } from "../lib/tz";
import { sendInvoiceEmail, sendPaymentLinkEmail } from "../lib/email";

const router: IRouter = Router();

// ── Helper: build full order response ──────────────────────────────────────────

async function attachDescriptions<T extends { productId: number | null }>(items: T[]): Promise<(T & { description: string | null })[]> {
  const productIds = [...new Set(items.map(i => i.productId).filter((id): id is number => id != null))];
  if (productIds.length === 0) return items.map(i => ({ ...i, description: null }));
  const products = await db.select({ id: productsTable.id, description: productsTable.description })
    .from(productsTable).where(inArray(productsTable.id, productIds));
  const descByProductId = new Map(products.map(p => [p.id, p.description]));
  return items.map(i => ({ ...i, description: i.productId != null ? descByProductId.get(i.productId) ?? null : null }));
}

async function buildOrderResponse(orderId: number) {
  const [order] = await db.select().from(catalogOrdersTable).where(eq(catalogOrdersTable.id, orderId));
  if (!order) return null;
  const items = await db.select().from(catalogOrderItemsTable).where(eq(catalogOrderItemsTable.orderId, orderId));
  const itemsWithDesc = await attachDescriptions(items);
  return {
    ...order,
    total: parseFloat(order.total),
    items: itemsWithDesc.map(i => ({
      ...i,
      unitPrice: parseFloat(i.unitPrice),
      subtotal: parseFloat(i.subtotal),
    })),
  };
}

// ── PUBLIC: Submit a catalog order ────────────────────────────────────────────

router.post("/catalog/order", async (req, res): Promise<void> => {
  const { customerName, customerPhone, customerEmail, customerAddress, notes, items } = req.body as {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    customerAddress?: string;
    notes?: string;
    items: { productId: number; qty: number; variantId?: number; variantColor?: string; variantSize?: string }[];
  };

  if (!customerName?.trim() || !customerPhone?.trim()) {
    res.status(400).json({ error: "Nombre y celular son requeridos" });
    return;
  }
  if (!items?.length) {
    res.status(400).json({ error: "El pedido debe tener al menos un artículo" });
    return;
  }

  // Snapshot product prices from DB
  const productIds = items.map(i => i.productId);
  const products = await db.select({
    id: productsTable.id,
    name: productsTable.name,
    salePrice: productsTable.salePrice,
  }).from(productsTable).where(inArray(productsTable.id, productIds));

  const productMap = new Map(products.map(p => [p.id, p]));

  for (const item of items) {
    if (!productMap.has(item.productId)) {
      res.status(400).json({ error: `Producto ${item.productId} no encontrado` });
      return;
    }
    if (item.qty <= 0) {
      res.status(400).json({ error: "Cantidad inválida" });
      return;
    }
  }

  const orderItems = items.map(item => {
    const p = productMap.get(item.productId)!;
    const unitPrice = parseFloat(p.salePrice);
    return {
      productId: item.productId,
      productName: p.name,
      qty: item.qty,
      unitPrice,
      subtotal: unitPrice * item.qty,
      variantId: item.variantId ?? null,
      variantColor: item.variantColor ?? null,
      variantSize: item.variantSize ?? null,
    };
  });

  const total = orderItems.reduce((s, i) => s + i.subtotal, 0);

  const orderId = await db.transaction(async (tx) => {
    const [order] = await tx.insert(catalogOrdersTable).values({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail?.trim() || null,
      customerAddress: customerAddress?.trim() || null,
      notes: notes?.trim() || null,
      total: String(total),
    }).returning();

    await tx.insert(catalogOrderItemsTable).values(
      orderItems.map(i => ({
        orderId: order.id,
        productId: i.productId,
        productName: i.productName,
        qty: i.qty,
        unitPrice: String(i.unitPrice),
        subtotal: String(i.subtotal),
        variantId: i.variantId,
        variantColor: i.variantColor,
        variantSize: i.variantSize,
      }))
    );
    return order.id;
  });

  res.status(201).json({ id: orderId, message: "Pedido recibido con éxito" });
});

// ── AUTH: List all catalog orders ─────────────────────────────────────────────

router.get("/catalog-orders", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const orders = await db.select().from(catalogOrdersTable).orderBy(desc(catalogOrdersTable.createdAt));

  // Fetch sale customer info for invoiced orders in a single query
  const invoicedSaleIds = orders.map(o => o.invoicedSaleId).filter((id): id is number => id != null);
  const saleCustomers = invoicedSaleIds.length > 0
    ? await db.select({
        saleId: salesTable.id,
        customerId: salesTable.customerId,
        customerName: customersTable.firstName,
        customerLastName: customersTable.lastName,
        customerPhone: customersTable.phone,
        customerEmail: customersTable.email,
      })
      .from(salesTable)
      .leftJoin(customersTable, eq(salesTable.customerId, customersTable.id))
      .where(inArray(salesTable.id, invoicedSaleIds))
    : [];
  const saleCustomerMap = new Map(saleCustomers.map(s => [s.saleId, s]));

  const withItems = await Promise.all(orders.map(async (order) => {
    const items = await db.select().from(catalogOrderItemsTable)
      .where(eq(catalogOrderItemsTable.orderId, order.id));
    const itemsWithDesc = await attachDescriptions(items);
    const sc = order.invoicedSaleId ? saleCustomerMap.get(order.invoicedSaleId) : undefined;
    const invoicedCustomer = sc?.customerId
      ? {
          name: `${sc.customerName} ${sc.customerLastName}`.trim(),
          phone: sc.customerPhone ?? null,
          email: sc.customerEmail ?? null,
        }
      : null;
    return {
      ...order,
      total: parseFloat(order.total),
      invoicedCustomer,
      items: itemsWithDesc.map(i => ({
        ...i,
        unitPrice: parseFloat(i.unitPrice),
        subtotal: parseFloat(i.subtotal),
      })),
    };
  }));

  res.json(withItems);
});

// ── AUTH: Get single catalog order ────────────────────────────────────────────

router.get("/catalog-orders/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const result = await buildOrderResponse(id);
  if (!result) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
  res.json(result);
});

// ── AUTH: Cancel a catalog order ──────────────────────────────────────────────

router.put("/catalog-orders/:id/cancel", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [order] = await db.select().from(catalogOrdersTable).where(eq(catalogOrdersTable.id, id));
  if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
  if (order.status !== "pending") {
    res.status(400).json({ error: "Solo se pueden cancelar pedidos pendientes" }); return;
  }
  await db.update(catalogOrdersTable).set({ status: "cancelled" }).where(eq(catalogOrdersTable.id, id));
  res.json({ id, status: "cancelled" });
});

// ── AUTH: Update items of a pending catalog order ────────────────────────────

router.put("/catalog-orders/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id as string, 10);
  const { items } = req.body as {
    items: { productId: number; variantId?: number; qty: number; unitPrice: number }[];
  };

  if (!items?.length) {
    res.status(400).json({ error: "El pedido debe tener al menos un artículo" }); return;
  }

  const [order] = await db.select().from(catalogOrdersTable).where(eq(catalogOrdersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
  if (order.status !== "pending") {
    res.status(400).json({ error: "Solo se pueden editar pedidos pendientes" }); return;
  }

  for (const item of items) {
    if (item.qty <= 0 || item.unitPrice < 0) {
      res.status(400).json({ error: "Cantidad o precio inválido" }); return;
    }
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    if (!product) { res.status(400).json({ error: `Producto ${item.productId} no existe` }); return; }
  }

  const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const productIds = items.map(i => i.productId);
  const products = await db.select({ id: productsTable.id, name: productsTable.name })
    .from(productsTable).where(inArray(productsTable.id, productIds));
  const productMap = new Map(products.map(p => [p.id, p.name]));

  // Fetch variant info for items that have variantId
  const variantIds = items.map(i => i.variantId).filter((id): id is number => id != null);
  const variants = variantIds.length > 0
    ? await db.select({ id: productVariantsTable.id, color: productVariantsTable.color, size: productVariantsTable.size })
        .from(productVariantsTable).where(inArray(productVariantsTable.id, variantIds))
    : [];
  const variantMap = new Map(variants.map(v => [v.id, v]));

  await db.transaction(async (tx) => {
    await tx.delete(catalogOrderItemsTable).where(eq(catalogOrderItemsTable.orderId, orderId));
    await tx.insert(catalogOrderItemsTable).values(
      items.map(i => {
        const v = i.variantId ? variantMap.get(i.variantId) : undefined;
        return {
          orderId,
          productId: i.productId,
          productName: productMap.get(i.productId) ?? "Producto",
          qty: i.qty,
          unitPrice: String(i.unitPrice),
          subtotal: String(i.qty * i.unitPrice),
          variantId: i.variantId ?? null,
          variantColor: v?.color ?? null,
          variantSize: v?.size ?? null,
        };
      })
    );
    await tx.update(catalogOrdersTable)
      .set({ total: String(total) })
      .where(eq(catalogOrdersTable.id, orderId));
  });

  const result = await buildOrderResponse(orderId);
  res.json(result);
});

// ── AUTH: Invoice a catalog order (convert to sale) ───────────────────────────

router.post("/catalog-orders/:id/invoice", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id as string, 10);
  const {
    items,
    paymentType,
    customerId,
    advanceAmount,
    notes,
    chargedAmount,
  } = req.body as {
    items: { productId: number; variantId?: number; qty: number; unitPrice: number }[];
    paymentType: "efectivo" | "credito" | "datafono" | "link";
    customerId?: number;
    advanceAmount?: number;
    notes?: string;
    chargedAmount?: number;
  };

  if (!paymentType || !items?.length) {
    res.status(400).json({ error: "Tipo de pago e items son requeridos" }); return;
  }

  const [order] = await db.select().from(catalogOrdersTable).where(eq(catalogOrdersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
  if (order.status !== "pending") {
    res.status(400).json({ error: "El pedido ya fue facturado o cancelado" }); return;
  }

  // Validate stock (by variant when present, otherwise by product)
  for (const item of items) {
    if (item.qty <= 0 || item.unitPrice < 0) {
      res.status(400).json({ error: `Cantidad o precio inválido` }); return;
    }
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    if (!product) { res.status(400).json({ error: `Producto ${item.productId} no existe` }); return; }
    if (item.variantId) {
      const [variant] = await db.select().from(productVariantsTable)
        .where(and(eq(productVariantsTable.id, item.variantId), eq(productVariantsTable.productId, item.productId)));
      if (!variant) { res.status(400).json({ error: `Variante inválida para "${product.name}"` }); return; }
      if (variant.stock < item.qty) {
        res.status(400).json({ error: `Stock insuficiente para "${product.name}" (${variant.color} / ${variant.size}). Disponible: ${variant.stock}` }); return;
      }
    } else {
      if (product.stock < item.qty) {
        res.status(400).json({ error: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}` }); return;
      }
    }
  }

  // Fetch variant info for display in saleItems
  const invoiceVariantIds = items.map(i => i.variantId).filter((id): id is number => id != null);
  const invoiceVariants = invoiceVariantIds.length > 0
    ? await db.select({ id: productVariantsTable.id, color: productVariantsTable.color, size: productVariantsTable.size })
        .from(productVariantsTable).where(inArray(productVariantsTable.id, invoiceVariantIds))
    : [];
  const invoiceVariantMap = new Map(invoiceVariants.map(v => [v.id, v]));

  const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const advance = paymentType === "credito" ? Math.max(0, Math.min(advanceAmount ?? 0, total)) : 0;

  const saleId = await db.transaction(async (tx) => {
    const [sale] = await tx.insert(salesTable).values({
      userId: req.user!.userId,
      customerId: customerId ?? null,
      paymentType,
      total: String(total),
      notes: notes?.trim() || order.notes || null,
      catalogOrderId: orderId,
    }).returning();

    await tx.insert(saleItemsTable).values(
      items.map(i => ({
        saleId: sale.id,
        productId: i.productId,
        variantId: i.variantId ?? null,
        qty: i.qty,
        unitPrice: String(i.unitPrice),
        subtotal: String(i.qty * i.unitPrice),
      }))
    );

    for (const item of items) {
      if (item.variantId) {
        await tx.update(productVariantsTable)
          .set({ stock: sql`${productVariantsTable.stock} - ${item.qty}` })
          .where(eq(productVariantsTable.id, item.variantId));
      } else {
        await tx.update(productsTable)
          .set({ stock: sql`${productsTable.stock} - ${item.qty}` })
          .where(eq(productsTable.id, item.productId));
      }
    }

    if (paymentType === "credito") {
      const { y: dy, m: dm, d: dd } = bogotaNow();
      const base = new Date(Date.UTC(dy, dm, dd + 15));
      const dueDateStr = `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
      const status = advance >= total ? "paid" : advance > 0 ? "partial" : "pending";

      const [ar] = await tx.insert(accountsReceivableTable).values({
        saleId: sale.id,
        customerId: customerId ?? null,
        totalAmount: String(total),
        paidAmount: String(advance),
        advanceAmount: String(advance),
        dueDate: dueDateStr,
        status,
      }).returning();

      if (advance > 0) {
        await tx.insert(arPaymentsTable).values({
          accountReceivableId: ar.id,
          amount: String(advance),
          notes: "Anticipo inicial",
        });
      }
    }

    await tx.update(catalogOrdersTable)
      .set({ status: "invoiced", invoicedSaleId: sale.id })
      .where(eq(catalogOrdersTable.id, orderId));

    return sale.id;
  });

  // Bold payment link (optional)
  let paymentLink: string | null = null;
  let boldFee: number | null = null;

  if (paymentType === "link") {
    try {
      const boldResult = await createBoldPaymentLink({
        amountCOP: total,
        grossAmountCOP: chargedAmount,
        description: `Factura #${saleId} · ${order.customerName}`,
        customer: {
          fullName: order.customerName,
          email: order.customerEmail ?? undefined,
          phone: order.customerPhone,
        },
      });
      paymentLink = boldResult.url;
      boldFee = boldResult.fee;
      await db.update(salesTable)
        .set({
          paymentLink,
          boldFee: String(boldFee),
          boldLinkId: boldResult.linkId ?? undefined,
          boldPaymentStatus: "pending",
        })
        .where(eq(salesTable.id, saleId));
    } catch (err) {
      console.error("[bold] Error generando link:", (err as Error).message);
    }
  }

  res.status(201).json({ saleId, orderId, total, paymentLink, boldFee });

  // Fire-and-forget invoice + payment link emails — do not block or affect the response
  if (order.customerEmail) {
    const [saleRow] = await db.select().from(salesTable).where(eq(salesTable.id, saleId));
    const saleItems = await db.select({
      productName: productsTable.name,
      description: productsTable.description,
      qty: saleItemsTable.qty,
      unitPrice: saleItemsTable.unitPrice,
      subtotal: saleItemsTable.subtotal,
      variantColor: productVariantsTable.color,
      variantSize: productVariantsTable.size,
    }).from(saleItemsTable)
      .leftJoin(productsTable, eq(saleItemsTable.productId, productsTable.id))
      .leftJoin(productVariantsTable, eq(saleItemsTable.variantId, productVariantsTable.id))
      .where(eq(saleItemsTable.saleId, saleId));

    sendInvoiceEmail({
      saleId,
      createdAt: saleRow.createdAt,
      paymentType,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      items: saleItems.map(i => ({
        productName: i.productName ?? "Desconocido",
        description: i.description ?? null,
        qty: i.qty,
        unitPrice: parseFloat(i.unitPrice),
        subtotal: parseFloat(i.subtotal),
        variantColor: i.variantColor ?? null,
        variantSize: i.variantSize ?? null,
      })),
      total,
      notes: notes?.trim() || order.notes || null,
    }).catch(err => {
      console.error("[email] Error enviando factura:", err?.message ?? err);
    });

    if (paymentLink) {
      sendPaymentLinkEmail({
        saleId,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        total,
        paymentLink,
      }).catch(err => {
        console.error("[email] Error enviando link de pago:", err?.message ?? err);
      });
    }
  }
});

export default router;
