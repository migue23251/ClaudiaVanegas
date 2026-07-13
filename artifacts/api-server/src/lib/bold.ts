/**
 * Bold (bold.co) payment link generator — Colombia
 *
 * Endpoint: POST https://checkout.bold.co/integration/payment_links
 * Docs:     https://developer.bold.co/docs/payment-links
 *
 * If Bold ever changes their endpoint or auth scheme, update BOLD_API_URL
 * and the Authorization header below.
 */

const BOLD_API_URL = "https://checkout.bold.co/integration/payment_links";
const BOLD_FEE_RATE = 0.05; // 5 % charged by Bold

export interface BoldLinkParams {
  /** Total in COP (pesos, NOT centavos — we multiply ×100 internally) */
  amountCOP: number;
  description: string;
  customer?: {
    fullName?: string;
    email?: string;
    phone?: string;
  };
  /** ISO-8601 expiry; defaults to 7 days from now */
  expiresAt?: string;
}

export interface BoldLinkResult {
  url: string;
  /** Amount actually charged (includes Bold fee) */
  totalWithFee: number;
  /** Fee amount in COP */
  fee: number;
}

function defaultExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

export async function createBoldPaymentLink(
  params: BoldLinkParams
): Promise<BoldLinkResult> {
  const apiKey = process.env.BOLD_API_KEY;
  if (!apiKey) throw new Error("BOLD_API_KEY no está configurado");

  const fee = Math.round(params.amountCOP * BOLD_FEE_RATE);
  const totalWithFee = params.amountCOP + fee;
  // Bold uses centavos (x100) for COP
  const amountInCents = totalWithFee * 100;

  const body: Record<string, unknown> = {
    amount_in_cents: amountInCents,
    currency: "COP",
    description: params.description,
    expiration_date: params.expiresAt ?? defaultExpiry(),
  };

  if (params.customer?.fullName || params.customer?.email || params.customer?.phone) {
    body.customer = {
      ...(params.customer.fullName ? { full_name: params.customer.fullName } : {}),
      ...(params.customer.email    ? { email: params.customer.email }         : {}),
      ...(params.customer.phone    ? { phone_number: params.customer.phone }  : {}),
    };
  }

  const response = await fetch(BOLD_API_URL, {
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
    url?: string;
    payment_link?: string;
  };

  // Normalize different response shapes Bold may return
  const url =
    data?.payload?.payment_link ??
    data?.payload?.url ??
    data?.url ??
    data?.payment_link;

  if (!url) {
    throw new Error("Bold no devolvió un link de pago válido");
  }

  return { url, totalWithFee, fee };
}

export { BOLD_FEE_RATE };
