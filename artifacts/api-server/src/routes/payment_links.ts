import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import { createBoldPaymentLink } from "../lib/bold";

const router: IRouter = Router();

/**
 * POST /payment-links/bold
 * Generate a Bold payment link for any amount.
 * Auth required — only staff generates links.
 */
router.post("/payment-links/bold", requireAuth, async (req, res): Promise<void> => {
  const { amountCOP, description, customerName, customerEmail, customerPhone } = req.body as {
    amountCOP: number;
    description: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
  };

  if (!amountCOP || amountCOP <= 0) {
    res.status(400).json({ error: "Monto inválido" }); return;
  }
  if (!description?.trim()) {
    res.status(400).json({ error: "Descripción es requerida" }); return;
  }

  try {
    const result = await createBoldPaymentLink({
      amountCOP,
      description: description.trim(),
      customer: {
        fullName: customerName,
        email: customerEmail,
        phone: customerPhone,
      },
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error generando link";
    res.status(502).json({ error: msg });
  }
});

export default router;
