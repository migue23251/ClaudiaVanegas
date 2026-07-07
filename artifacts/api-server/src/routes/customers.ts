import { Router, type IRouter } from "express";
import { eq, or, ilike } from "drizzle-orm";
import { db, customersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/customers", requireAuth, async (req, res): Promise<void> => {
  const { search } = req.query;
  const customers = search && typeof search === "string"
    ? await db.select().from(customersTable).where(
        or(
          ilike(customersTable.firstName, `%${search}%`),
          ilike(customersTable.lastName, `%${search}%`),
          ilike(customersTable.cedula, `%${search}%`),
          ilike(customersTable.email, `%${search}%`)
        )
      ).orderBy(customersTable.firstName)
    : await db.select().from(customersTable).orderBy(customersTable.firstName);
  res.json(customers);
});

router.post("/customers", requireAuth, async (req, res): Promise<void> => {
  const { cedula, firstName, lastName, email } = req.body;
  if (!cedula || !firstName || !lastName || !email) {
    res.status(400).json({ error: "Todos los campos son requeridos" });
    return;
  }
  const [customer] = await db.insert(customersTable).values({ cedula, firstName, lastName, email }).returning();
  res.status(201).json(customer);
});

router.get("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!customer) { res.status(404).json({ error: "Cliente no encontrado" }); return; }
  res.json(customer);
});

router.put("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { cedula, firstName, lastName, email } = req.body;
  const updates: Record<string, unknown> = {};
  if (cedula) updates.cedula = cedula;
  if (firstName) updates.firstName = firstName;
  if (lastName) updates.lastName = lastName;
  if (email) updates.email = email;
  const [customer] = await db.update(customersTable).set(updates).where(eq(customersTable.id, id)).returning();
  if (!customer) { res.status(404).json({ error: "Cliente no encontrado" }); return; }
  res.json(customer);
});

router.delete("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [deleted] = await db.delete(customersTable).where(eq(customersTable.id, id)).returning({ id: customersTable.id });
  if (!deleted) { res.status(404).json({ error: "Cliente no encontrado" }); return; }
  res.sendStatus(204);
});

export default router;
