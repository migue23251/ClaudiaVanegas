import { Router, type IRouter } from "express";
import { eq, and, gte, lte, or, ilike, type SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, salesTable, saleItemsTable, productsTable, customersTable, usersTable, accountsReceivableTable, arPaymentsTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";
import { sendInvoiceEmail } from "../lib/email";

const router: IRouter = Router();

async function buildSaleResponse(saleId: number) {
  const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, saleId));
  if (!sale) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sale.userId));
  const customer = sale.customerId
    ? (await db.select().from(customersTable).where(eq(customersTable.id, sale.customerId)))[0]
    : null;
  const items = await db.select({
    id: saleItemsTable.id,
    productId: saleItemsTable.productId,
    qty: saleItemsTable.qty,
    unitPrice: saleItemsTable.unitPrice,
    subtotal: saleItemsTable.subtotal,
    productName: productsTable.name,
    description: productsTable.description,
  }).from(saleItemsTable)
    .leftJoin(productsTable, eq(saleItemsTable.productId, productsTable.id))
    .where(eq(saleItemsTable.saleId, saleId));

  return {
    ...sale,
    total: parseFloat(sale.total),
    voided: sale.voided,
    voidedAt: sale.voidedAt,
    voidReason: sale.voidReason,
    userName: user?.name ?? null,
    customerName: customer ? `${customer.firstName} ${customer.lastName}` : null,
    customerCedula: customer?.cedula ?? null,
    customerEmail: customer?.email ?? null,
    customerPhone: customer?.phone ?? null,
    items: items.map(i => ({
      ...i,
      productName: i.productName ?? "Desconocido",
      description: i.description ?? null,
      unitPrice: parseFloat(i.unitPrice),
      subtotal: parseFloat(i.subtotal),
    })),
  };
}

router.get("/sales", requireAuth, async (req, res): Promise<void> => {
  const { userId, paymentType, from, to, search } = req.query;
  const conditions: SQL[] = [];

  // Cajero only sees their own sales
  if (req.user!.role === "cajero") {
    conditions.push(eq(salesTable.userId, req.user!.userId));
  } else if (userId && typeof userId === "string") {
    conditions.push(eq(salesTable.userId, parseInt(userId, 10)));
  }
  if (paymentType && typeof paymentType === "string") {
    conditions.push(eq(salesTable.paymentType, paymentType as "contado" | "credito"));
  }
  if (from && typeof from === "string") {
    conditions.push(gte(salesTable.createdAt, new Date(from)));
  }
  if (to && typeof to === "string") {
    conditions.push(lte(salesTable.createdAt, new Date(to)));
  }

  const sales = conditions.length > 0
    ? await db.select().from(salesTable).where(and(...conditions)).orderBy(salesTable.createdAt)
    : await db.select().from(salesTable).orderBy(salesTable.createdAt);

  let results = (await Promise.all(sales.map(s => buildSaleResponse(s.id)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof buildSaleResponse>>>[];

  // Client-side filter by customer name or cedula (after joining)
  if (search && typeof search === "string") {
    const q = search.toLowerCase();
    results = results.filter(r =>
      r.customerName?.toLowerCase().includes(q) ||
      r.customerCedula?.toLowerCase().includes(q)
    );
  }

  res.json(results);
});

router.post("/sales", requireAuth, async (req, res): Promise<void> => {
  const { customerId, paymentType, notes, items, advanceAmount } = req.body as {
    customerId?: number;
    paymentType: "contado" | "credito";
    notes?: string;
    items: { productId: number; qty: number; unitPrice: number }[];
    advanceAmount?: number;
  };

  if (!paymentType || !items?.length) {
    res.status(400).json({ error: "Tipo de pago e items son requeridos" });
    return;
  }

  // Validate all products exist and have enough stock before writing anything
  for (const item of items) {
    if (item.qty <= 0 || item.unitPrice < 0) {
      res.status(400).json({ error: `Cantidad o precio inválido para el producto ${item.productId}` });
      return;
    }
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    if (!product) {
      res.status(400).json({ error: `Producto con ID ${item.productId} no existe` });
      return;
    }
    if (product.stock < item.qty) {
      res.status(400).json({ error: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}` });
      return;
    }
  }

  const total = items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const advance = Math.max(0, Math.min(advanceAmount ?? 0, total));

  // Wrap all writes in a transaction for atomicity
  const saleId = await db.transaction(async (tx) => {
    const [sale] = await tx.insert(salesTable).values({
      userId: req.user!.userId,
      customerId: customerId ?? null,
      paymentType,
      total: String(total),
      notes,
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

    // Reduce stock for each product
    for (const item of items) {
      await tx.update(productsTable)
        .set({ stock: sql`${productsTable.stock} - ${item.qty}` })
        .where(eq(productsTable.id, item.productId));
    }

    // For credit sales, create an accounts receivable entry
    if (paymentType === "credito") {
      // dueDate = 15 days after today
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 15);
      const dueDateStr = dueDate.toISOString().split("T")[0];

      const initialPaid = advance;
      const status = initialPaid >= total ? "paid" : initialPaid > 0 ? "partial" : "pending";

      const [ar] = await tx.insert(accountsReceivableTable).values({
        saleId: sale.id,
        customerId: customerId ?? null,
        totalAmount: String(total),
        paidAmount: String(initialPaid),
        advanceAmount: String(advance),
        dueDate: dueDateStr,
        status,
      }).returning();

      // Record the advance as an actual ar_payments row so it's counted in
      // collection/recaudo reporting (dashboard sums ar_payments, not the
      // accounts_receivable.paidAmount field directly).
      if (advance > 0) {
        await tx.insert(arPaymentsTable).values({
          accountReceivableId: ar.id,
          amount: String(advance),
          notes: "Anticipo inicial de la venta",
        });
      }
    }

    return sale.id;
  });

  const result = await buildSaleResponse(saleId);
  res.status(201).json(result);

  // Fire-and-forget invoice email — does not block or affect the sale response
  if (result?.customerEmail) {
    sendInvoiceEmail({
      saleId: result.id,
      createdAt: result.createdAt,
      paymentType: result.paymentType as "contado" | "credito",
      customerName: result.customerName ?? result.customerEmail,
      customerEmail: result.customerEmail,
      customerCedula: result.customerCedula,
      customerPhone: result.customerPhone,
      items: result.items,
      total: result.total,
      notes: result.notes,
    }).catch(err => {
      console.error("[email] Error enviando factura:", err?.message ?? err);
    });
  }
});

router.get("/sales/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const result = await buildSaleResponse(id);
  if (!result) { res.status(404).json({ error: "Venta no encontrada" }); return; }
  // Cajero can only see own sales
  if (req.user!.role === "cajero" && result.userId !== req.user!.userId) {
    res.status(403).json({ error: "Acceso denegado" }); return;
  }
  res.json(result);
});

router.post("/sales/:id/void", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { reason } = req.body as { reason?: string };
  if (!reason || !reason.trim()) {
    res.status(400).json({ error: "La observación es requerida para anular la venta" });
    return;
  }

  const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
  if (!sale) { res.status(404).json({ error: "Venta no encontrada" }); return; }
  if (sale.voided) { res.status(400).json({ error: "La venta ya fue anulada" }); return; }

  let alreadyVoided = false;

  await db.transaction(async (tx) => {
    // Atomic guarded update: only proceed if this request is the one that actually
    // transitions the sale from non-voided to voided. Prevents double stock-restore
    // / double AR-cleanup from concurrent void requests on the same sale.
    const updated = await tx.update(salesTable).set({
      voided: true,
      voidedAt: new Date(),
      voidReason: reason.trim(),
    }).where(and(eq(salesTable.id, id), eq(salesTable.voided, false))).returning({ id: salesTable.id });

    if (updated.length === 0) {
      alreadyVoided = true;
      return;
    }

    const items = await tx.select().from(saleItemsTable).where(eq(saleItemsTable.saleId, id));

    // Return items to stock
    for (const item of items) {
      await tx.update(productsTable)
        .set({ stock: sql`${productsTable.stock} + ${item.qty}` })
        .where(eq(productsTable.id, item.productId));
    }

    // If it was a credit sale, remove the outstanding debt (accounts receivable)
    const [ar] = await tx.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.saleId, id));
    if (ar) {
      await tx.delete(arPaymentsTable).where(eq(arPaymentsTable.accountReceivableId, ar.id));
      await tx.delete(accountsReceivableTable).where(eq(accountsReceivableTable.id, ar.id));
    }
  });

  if (alreadyVoided) { res.status(400).json({ error: "La venta ya fue anulada" }); return; }

  const result = await buildSaleResponse(id);
  res.json(result);
});

export default router;
