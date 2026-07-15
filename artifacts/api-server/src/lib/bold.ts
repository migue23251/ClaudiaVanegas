/**
 * Bold (bold.co) payment link generator — Colombia
 *
 * Docs: https://developers.bold.co/pagos-en-linea/api-link-de-pagos
 *
 * Base URL : https://integrations.api.bold.co
 * Endpoint : POST /online/link/v1
 * Auth     : Authorization: x-api-key <llave_de_identidad>
 * Amount   : COP (NOT centavos) in amount.total_amount
 * Expiry   : nanoseconds from Unix epoch
 */

const BOLD_BASE_URL = "https://integrations.api.bold.co";
const BOLD_FEE_RATE = 0.05; // 5 % charged by Bold

export interface BoldLinkParams {
  /** Total in COP (pesos colombianos, NOT centavos) */
  amountCOP: number;
  description: string;
  customer?: {
    fullName?: string;
    email?: string;
    phone?: string;
  };
  /** Expiry in milliseconds from now; defaults to 7 days */
  expiresInMs?: number;
}

export interface BoldLinkResult {
  /** Full checkout URL, e.g. https://checkout.bold.co/LNK_xxx */
  url: string;
  /** Bold's internal link ID, e.g. "LNK_H7S4xxx" — used to match webhooks */
  linkId: string | null;
  /** Amount actually charged (includes Bold fee) */
  totalWithFee: number;
  /** Fee amount in COP */
  fee: number;
}

export async function createBoldPaymentLink(
  params: BoldLinkParams
): Promise<BoldLinkResult> {
  // Bold uses the identity key (llave de identidad) in the Authorization header
  // for API calls. The secret key (llave secreta) is only for webhook signature verification.
  const apiKey = process.env.BOLD_API_KEY;
  if (!apiKey) throw new Error("BOLD_API_KEY no está configurado");

  const fee = Math.round(params.amountCOP * BOLD_FEE_RATE);
  const totalWithFee = params.amountCOP + fee;

  // Expiration date in nanoseconds from Unix epoch
  const expiresInMs = params.expiresInMs ?? 7 * 24 * 60 * 60 * 1000; // 7 days
  const expirationNs = (Date.now() + expiresInMs) * 1_000_000;

  // Truncate description to Bold's 100-char limit
  const description = params.description.slice(0, 100);

  const body: Record<string, unknown> = {
    amount_type: "CLOSE",
    amount: {
      currency: "COP",
      total_amount: totalWithFee,
      tip_amount: 0,
    },
    description,
    expiration_date: expirationNs,
  };

  // Add customer email if available (Bold sends the link by email)
  if (params.customer?.email) {
    body.payer_email = params.customer.email;
  }

  const response = await fetch(`${BOLD_BASE_URL}/online/link/v1`, {
    method: "POST",
    headers: {
      "Authorization": `x-api-key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Bold API error ${response.status}: ${text}`);
  }

  const data = await response.json() as {
    payload?: { payment_link?: string; url?: string };
    errors?: unknown[];
  };

  const linkId = data?.payload?.payment_link ?? null;
  const url = data?.payload?.url ?? (linkId ? `https://checkout.bold.co/${linkId}` : null);

  if (!url) {
    throw new Error(`Bold no devolvió un link de pago válido. Respuesta: ${JSON.stringify(data)}`);
  }

  return { url, linkId, totalWithFee, fee };
}

export { BOLD_FEE_RATE };
