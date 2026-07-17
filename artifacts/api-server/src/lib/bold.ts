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
  /** Net amount in COP. The function will add the Bold 5% fee on top. */
  amountCOP: number;
  /** Gross amount already calculated by the caller (e.g. via a custom formula).
   *  When provided, this value is sent to Bold AS-IS — no fee is added. */
  grossAmountCOP?: number;
  description: string;
  customer?: {
    fullName?: string;
    email?: string;
    phone?: string;
  };
  /** Expiry in milliseconds from now; defaults to 7 days */
  expiresInMs?: number;
  /** Unique reference for this transaction, e.g. `sale-<id>`. Bold recommends
   *  appending a timestamp to avoid collisions; we do that automatically. */
  reference?: string;
}

export interface BoldLinkResult {
  /** Full checkout URL, e.g. https://checkout.bold.co/LNK_xxx */
  url: string;
  /** Bold's internal link ID, e.g. "LNK_H7S4xxx" — informational only, NOT sent back in webhooks */
  linkId: string | null;
  /** The exact `reference` sent to Bold. Webhooks report this back under
   *  `data.metadata.reference` — it's the only reliable key to match a sale
   *  to a webhook event (Bold does not echo the link ID). */
  reference: string;
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

  // If the caller already computed the gross amount (e.g. via a custom formula),
  // use it directly; otherwise derive it by adding the 5% Bold fee.
  const fee = params.grossAmountCOP != null
    ? Math.round(params.grossAmountCOP - params.amountCOP)
    : Math.round(params.amountCOP * BOLD_FEE_RATE);
  const totalWithFee = params.grossAmountCOP != null
    ? Math.round(params.grossAmountCOP)
    : Math.round(params.amountCOP + fee);

  // Expiration date in nanoseconds from Unix epoch
  const expiresInMs = params.expiresInMs ?? 7 * 24 * 60 * 60 * 1000; // 7 days
  const expirationNs = (Date.now() + expiresInMs) * 1_000_000;

  // Truncate description to Bold's 100-char limit
  const description = params.description.slice(0, 100);

  // Bold recommends a unique reference per link (alphanumeric, _ and -, max
  // 60 chars) including a timestamp to avoid collisions between retries.
  const reference = (params.reference ?? "sale")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 40) + `-${Date.now()}`;

  const body: Record<string, unknown> = {
    amount_type: "CLOSE",
    amount: {
      currency: "COP",
      total_amount: totalWithFee,
      tip_amount: 0,
    },
    reference: reference.slice(0, 60),
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
      Authorization: `x-api-key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    // Log the exact request body alongside the failure so a 403/400 from
    // Bold can be diagnosed from server logs without guessing.
    console.error(
      `[bold] ${response.status} creating payment link. Request body: ${JSON.stringify(body)}. Response: ${text}`
    );
    throw new Error(`Bold API error ${response.status}: ${text || "sin detalle"}`);
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

  return { url, linkId, reference: body.reference as string, totalWithFee, fee };
}

export { BOLD_FEE_RATE };
