import { Router, type IRouter } from "express";
import { eq, desc, inArray, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  db, catalogOrdersTable, catalogOrderItemsTable, productsTable,
  salesTable, saleItemsTable, accountsReceivableTable, arPaymentsTable,
} from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";
import { createBoldPaymentLink } from "../lib/bold";
import { bogotaNow } from "../lib/tz";

const router: IRouter = Router();

// ── Helper: build full order response ──────────────────────────────────────────

async function buildOrderResponse(orderId: number) {
  const [order] = await db.select().from(catalogOrdersTable).where(eq(catalogOrdersTable.id, orderId));
  if (!order) return null;
  const items = await db.select().from(catalogOrderItemsTable).where(eq(catalogOrderItemsTable.orderId, orderId));
  return {
    ...order,
    total: parseFloat(order.total),
    items: items.map(i => ({
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
    items: { productId: number; qty: number }[];
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
      }))
    );
    return order.id;
  });

  res.status(201).json({ id: orderId, message: "Pedido recibido con éxito" });
});

// ── AUTH: List all catalog orders ─────────────────────────────────────────────

router.get("/catalog-orders", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const orders = await db.select().from(catalogOrdersTable).orderBy(desc(catalogOrdersTable.createdAt));

  const withItems = await Promise.all(orders.map(async (order) => {
    const items = await db.select().from(catalogOrderItemsTable)
      .where(eq(catalogOrderItemsTable.orderId, order.id));
    return {
      ...order,
      total: parseFloat(order.total),
      items: items.map(i => ({
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

// ── AUTH: Invoice a catalog order (convert to sale) ───────────────────────────

router.post("/catalog-orders/:id/invoice", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id as string, 10);
  const {
    items,
    paymentType,
    customerId,
    advanceAmount,
    notes,
    withBoldLink,
  } = req.body as {
    items: { productId: number; qty: number; unitPrice: number }[];
    paymentType: "contado" | "credito";
    customerId?: number;
    advanceAmount?: number;
    notes?: string;
    withBoldLink?: boolean;
  };

  if (!paymentType || !items?.length) {
    res.status(400).json({ error: "Tipo de pago e items son requeridos" }); return;
  }

  const [order] = await db.select().from(catalogOrdersTable).where(eq(catalogOrdersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
  if (order.status !== "pending") {
    res.status(400).json({ error: "El pedido ya fue facturado o cancelado" }); return;
  }

  // Validate stock
  for (const item of items) {
    if (item.qty <= 0 || item.unitPrice < 0) {
      res.status(400).json({ error: `Cantidad o precio inválido` }); return;
    }
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    if (!product) { res.status(400).json({ error: `Producto ${item.productId} no existe` }); return; }
    if (product.stock < item.qty) {
      res.status(400).json({ error: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}` }); return;
    }
  }

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
        qty: i.qty,
        unitPrice: String(i.unitPrice),
        subtotal: String(i.qty * i.unitPrice),
      }))
    );

    for (const item of items) {
      await tx.update(productsTable)
        .set({ stock: sql`${productsTable.stock} - ${item.qty}` })
        .where(eq(productsTable.id, item.productId));
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

  if (withBoldLink) {
    try {
      const boldResult = await createBoldPaymentLink({
        amountCOP: total,
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
        .set({ paymentLink, boldFee: String(boldFee) })
        .where(eq(salesTable.id, saleId));
    } catch (err) {
      console.error("[bold] Error generando link:", (err as Error).message);
    }
  }

  res.status(201).json({ saleId, orderId, total, paymentLink, boldFee });
});

export default router;
