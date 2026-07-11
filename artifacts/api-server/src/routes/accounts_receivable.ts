import { Router, type IRouter } from "express";
import { eq, and, lt, or, type SQL } from "drizzle-orm";
import { bogotaToday } from "../lib/tz";
import { db, accountsReceivableTable, arPaymentsTable, salesTable, customersTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

async function buildARResponse(arId: number) {
  const [ar] = await db.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.id, arId));
  if (!ar) return null;
  const customer = ar.customerId
    ? (await db.select().from(customersTable).where(eq(customersTable.id, ar.customerId)))[0]
    : null;
  const payments = await db.select().from(arPaymentsTable).where(eq(arPaymentsTable.accountReceivableId, arId)).orderBy(arPaymentsTable.paidAt);
  return {
    ...ar,
    totalAmount: parseFloat(ar.totalAmount),
    paidAmount: parseFloat(ar.paidAmount),
    customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Cliente Genérico",
    payments: payments.map(p => ({ ...p, amount: parseFloat(p.amount) })),
  };
}

router.get("/accounts-receivable", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { status, overdue } = req.query;
  const conditions: SQL[] = [];
  if (status && typeof status === "string") {
    conditions.push(eq(accountsReceivableTable.status, status as "pending" | "partial" | "paid"));
  }
  if (overdue === "true") {
    conditions.push(lt(accountsReceivableTable.dueDate, bogotaToday()));
    conditions.push(or(
      eq(accountsReceivableTable.status, "pending"),
      eq(accountsReceivableTable.status, "partial"),
    )!);
  }
  const records = conditions.length > 0
    ? await db.select().from(accountsReceivableTable).where(and(...conditions)).orderBy(accountsReceivableTable.createdAt)
    : await db.select().from(accountsReceivableTable).orderBy(accountsReceivableTable.createdAt);

  const results = await Promise.all(records.map(r => buildARResponse(r.id)));
  res.json(results.filter(Boolean));
});

router.get("/accounts-receivable/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const result = await buildARResponse(id);
  if (!result) { res.status(404).json({ error: "Cuenta por cobrar no encontrada" }); return; }
  res.json(result);
});

router.post("/accounts-receivable/:id/payments", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { amount, notes } = req.body;
  if (!amount || amount <= 0) { res.status(400).json({ error: "Monto inválido" }); return; }

  const [ar] = await db.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.id, id));
  if (!ar) { res.status(404).json({ error: "Cuenta por cobrar no encontrada" }); return; }

  const total = parseFloat(ar.totalAmount);
  const alreadyPaid = parseFloat(ar.paidAmount);
  const remaining = total - alreadyPaid;
  const payAmount = parseFloat(String(amount));
  if (payAmount > remaining + 0.001) {
    res.status(400).json({ error: `El monto supera el saldo pendiente (${remaining.toLocaleString("es-CO")})` });
    return;
  }

  await db.insert(arPaymentsTable).values({ accountReceivableId: id, amount: String(amount), notes });

  const newPaid = alreadyPaid + payAmount;
  const newStatus = newPaid >= total ? "paid" : newPaid > 0 ? "partial" : "pending";
  await db.update(accountsReceivableTable).set({ paidAmount: String(newPaid), status: newStatus }).where(eq(accountsReceivableTable.id, id));

  const result = await buildARResponse(id);
  res.status(201).json(result);
});

export default router;
