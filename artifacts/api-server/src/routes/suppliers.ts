import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, suppliersTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

router.get("/suppliers", requireAuth, async (_req, res): Promise<void> => {
  const suppliers = await db.select().from(suppliersTable).orderBy(suppliersTable.name);
  res.json(suppliers);
});

router.post("/suppliers", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { name, contact, email, phone } = req.body;
  if (!name) { res.status(400).json({ error: "Nombre es requerido" }); return; }
  const [supplier] = await db.insert(suppliersTable).values({ name, contact, email, phone }).returning();
  res.status(201).json(supplier);
});

router.get("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!supplier) { res.status(404).json({ error: "Proveedor no encontrado" }); return; }
  res.json(supplier);
});

router.put("/suppliers/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, contact, email, phone } = req.body;
  const updates: Record<string, unknown> = {};
  if (name) updates.name = name;
  if (contact !== undefined) updates.contact = contact;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;
  const [supplier] = await db.update(suppliersTable).set(updates).where(eq(suppliersTable.id, id)).returning();
  if (!supplier) { res.status(404).json({ error: "Proveedor no encontrado" }); return; }
  res.json(supplier);
});

router.delete("/suppliers/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [deleted] = await db.delete(suppliersTable).where(eq(suppliersTable.id, id)).returning({ id: suppliersTable.id });
  if (!deleted) { res.status(404).json({ error: "Proveedor no encontrado" }); return; }
  res.sendStatus(204);
});

export default router;
