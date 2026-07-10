import { Router, type IRouter } from "express";
import { eq, and, type SQL } from "drizzle-orm";
import { db, accountsPayableTable, apPaymentsTable, purchaseOrdersTable, suppliersTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

async function buildAPResponse(apId: number) {
  const [ap] = await db.select().from(accountsPayableTable).where(eq(accountsPayableTable.id, apId));
  if (!ap) return null;
  const [po] = ap.purchaseOrderId
    ? await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, ap.purchaseOrderId))
    : [null];
  const [supplier] = po ? await db.select().from(suppliersTable).where(eq(suppliersTable.id, po.supplierId)) : [null];
  const payments = await db.select().from(apPaymentsTable).where(eq(apPaymentsTable.accountPayableId, apId)).orderBy(apPaymentsTable.paidAt);
  return {
    ...ap,
    totalAmount: parseFloat(ap.totalAmount),
    paidAmount: parseFloat(ap.paidAmount),
    supplierName: supplier?.name ?? (ap.type === "fixed_expense" ? null : "Desconocido"),
    guideNumber: po?.guideNumber ?? null,
    payments: payments.map(p => ({ ...p, amount: parseFloat(p.amount) })),
  };
}

router.get("/accounts-payable", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { status } = req.query;
  const conditions: SQL[] = [];
  if (status && typeof status === "string") {
    conditions.push(eq(accountsPayableTable.status, status as "pending" | "partial" | "paid"));
  }
  const records = conditions.length > 0
    ? await db.select().from(accountsPayableTable).where(and(...conditions)).orderBy(accountsPayableTable.createdAt)
    : await db.select().from(accountsPayableTable).orderBy(accountsPayableTable.createdAt);

  const results = await Promise.all(records.map(r => buildAPResponse(r.id)));
  res.json(results.filter(Boolean));
});

router.post("/accounts-payable", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { description, totalAmount, dueDate } = req.body as { description?: string; totalAmount?: number; dueDate?: string };
  if (!description || !description.trim() || totalAmount == null || totalAmount <= 0) {
    res.status(400).json({ error: "Descripción y monto son requeridos" });
    return;
  }

  const [inserted] = await db.insert(accountsPayableTable).values({
    type: "fixed_expense",
    description: description.trim(),
    totalAmount: String(totalAmount),
    paidAmount: "0",
    dueDate: dueDate || null,
    status: "pending",
  }).returning();

  const result = await buildAPResponse(inserted.id);
  res.status(201).json(result);
});

router.get("/accounts-payable/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const result = await buildAPResponse(id);
  if (!result) { res.status(404).json({ error: "Cuenta por pagar no encontrada" }); return; }
  res.json(result);
});

router.post("/accounts-payable/:id/payments", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { amount, notes } = req.body;
  if (!amount || amount <= 0) { res.status(400).json({ error: "Monto inválido" }); return; }

  const [ap] = await db.select().from(accountsPayableTable).where(eq(accountsPayableTable.id, id));
  if (!ap) { res.status(404).json({ error: "Cuenta por pagar no encontrada" }); return; }

  await db.insert(apPaymentsTable).values({ accountPayableId: id, amount: String(amount), notes });

  const newPaid = parseFloat(ap.paidAmount) + parseFloat(String(amount));
  const total = parseFloat(ap.totalAmount);
  const newStatus = newPaid >= total ? "paid" : "partial";
  await db.update(accountsPayableTable).set({ paidAmount: String(newPaid), status: newStatus }).where(eq(accountsPayableTable.id, id));

  const result = await buildAPResponse(id);
  res.status(201).json(result);
});

export default router;
