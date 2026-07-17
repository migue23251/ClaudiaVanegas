import nodemailer from "nodemailer";
import { db, settingsTable } from "@workspace/db";

interface SaleItem {
  productName: string;
  description: string | null;
  qty: number;
  unitPrice: number;
  subtotal: number;
}

interface InvoiceData {
  saleId: number;
  createdAt: string | Date;
  paymentType: "efectivo" | "credito" | "datafono" | "link";
  customerName: string;
  customerEmail: string;
  customerCedula?: string | null;
  customerPhone?: string | null;
  items: SaleItem[];
  total: number;
  notes?: string | null;
}

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildInvoiceHtml(invoice: InvoiceData, storeName: string, hasCidLogo: boolean, primaryColor: string | null, storePhone: string | null, storeAddress: string | null) {
  const color = primaryColor ?? "#c2697a";
  const logoHtml = hasCidLogo
    ? `<img src="cid:store-logo" alt="${storeName}" style="max-height:80px;max-width:200px;object-fit:contain;display:block;" />`
    : "";

  const itemRows = invoice.items.map(item => `
    <tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:10px 8px;vertical-align:top;">
        <div style="font-weight:600;color:#1a1a1a;">${item.productName}</div>
        ${item.description ? `<div style="font-size:12px;color:#888;margin-top:2px;">${item.description}</div>` : ""}
      </td>
      <td style="padding:10px 8px;text-align:center;white-space:nowrap;color:#444;">${item.qty}</td>
      <td style="padding:10px 8px;text-align:right;white-space:nowrap;color:#444;">${formatCOP(item.unitPrice)}</td>
      <td style="padding:10px 8px;text-align:right;white-space:nowrap;font-weight:600;color:#1a1a1a;">${formatCOP(item.subtotal)}</td>
    </tr>
  `).join("");

  const paymentLabel =
    invoice.paymentType === "credito" ? "Crédito" :
    invoice.paymentType === "datafono" ? "Datáfono" :
    invoice.paymentType === "link" ? "Link de pago" :
    "Efectivo";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Factura #${invoice.saleId} — ${storeName}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:${color};padding:28px 36px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  <table cellpadding="0" cellspacing="0"><tr>
                    ${hasCidLogo ? `<td style="vertical-align:middle;padding-right:14px;">${logoHtml}</td>` : ""}
                    <td style="vertical-align:middle;">
                      <div style="color:#fff;font-size:18px;font-weight:700;line-height:1.3;">${storeName}</div>
                    </td>
                  </tr></table>
                </td>
                <td align="right" style="color:#fff;font-size:13px;line-height:1.6;vertical-align:middle;">
                  <div style="font-size:20px;font-weight:700;">Factura #${invoice.saleId}</div>
                  <div style="opacity:0.85;">${formatDate(invoice.createdAt)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Customer info -->
        <tr>
          <td style="padding:24px 36px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#fafafa;border-radius:8px;padding:16px 20px;">
                  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:6px;">Cliente</div>
                  <div style="font-size:16px;font-weight:600;color:#1a1a1a;">${invoice.customerName}</div>
                  <div style="font-size:13px;color:#666;margin-top:2px;">${invoice.customerEmail}</div>
                  ${invoice.customerCedula ? `<div style="font-size:13px;color:#666;margin-top:2px;">CC ${invoice.customerCedula}</div>` : ""}
                  ${invoice.customerPhone ? `<div style="font-size:13px;color:#666;margin-top:2px;">📱 ${invoice.customerPhone}</div>` : ""}
                </td>
                <td width="16"></td>
                <td style="background:#fafafa;border-radius:8px;padding:16px 20px;text-align:right;">
                  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:6px;">Tipo de pago</div>
                  <div style="font-size:16px;font-weight:600;color:#1a1a1a;">${paymentLabel}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Items table -->
        <tr>
          <td style="padding:24px 36px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <thead>
                <tr style="background:#fafafa;">
                  <th style="padding:10px 8px;text-align:left;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#999;border-bottom:2px solid #ececec;">Producto</th>
                  <th style="padding:10px 8px;text-align:center;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#999;border-bottom:2px solid #ececec;">Cant.</th>
                  <th style="padding:10px 8px;text-align:right;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#999;border-bottom:2px solid #ececec;">Precio</th>
                  <th style="padding:10px 8px;text-align:right;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#999;border-bottom:2px solid #ececec;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
            </table>
          </td>
        </tr>

        <!-- Total -->
        <tr>
          <td style="padding:16px 36px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td></td>
                <td style="border-top:2px solid #ececec;padding-top:14px;text-align:right;">
                  <span style="font-size:13px;color:#888;margin-right:16px;">TOTAL</span>
                  <span style="font-size:22px;font-weight:700;color:${color};">${formatCOP(invoice.total)}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${invoice.notes ? `
        <!-- Notes -->
        <tr>
          <td style="padding:16px 36px 0;">
            <div style="background:#fffbf0;border-left:3px solid ${color};border-radius:4px;padding:12px 16px;font-size:13px;color:#666;">
              <strong style="color:#333;">Notas:</strong> ${invoice.notes}
            </div>
          </td>
        </tr>` : ""}

        <!-- Footer -->
        <tr>
          <td style="padding:24px 36px;text-align:center;border-top:1px solid #f0f0f0;">
            <p style="font-size:13px;font-weight:600;color:#555;margin:0 0 4px;">${storeName}</p>
            ${storeAddress ? `<p style="font-size:12px;color:#999;margin:0 0 2px;">${storeAddress}</p>` : ""}
            ${storePhone ? `<p style="font-size:12px;color:#999;margin:0 0 10px;">📞 ${storePhone}</p>` : ""}
            <p style="font-size:11px;color:#ccc;margin:0;">Este correo fue generado automáticamente. Por favor no responda a este mensaje.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Parse a logoUrl that may be a data URI or a plain URL. Returns attachment info for nodemailer. */
function parseLogoAttachment(logoUrl: string): { content: Buffer; contentType: string } | null {
  const dataUriMatch = logoUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUriMatch) {
    return {
      contentType: dataUriMatch[1],
      content: Buffer.from(dataUriMatch[2], "base64"),
    };
  }
  // Plain URL — clients can fetch it directly, no inline attachment needed
  return null;
}

interface PaymentLinkData {
  saleId: number;
  customerName: string;
  customerEmail: string;
  total: number;
  paymentLink: string;
}

function buildPaymentLinkHtml(data: PaymentLinkData, storeName: string, hasCidLogo: boolean, primaryColor: string | null) {
  const color = primaryColor ?? "#c2697a";
  const logoHtml = hasCidLogo
    ? `<img src="cid:store-logo" alt="${storeName}" style="max-height:80px;max-width:200px;object-fit:contain;display:block;margin:0 auto 16px;" />`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Link de pago — Factura #${data.saleId} — ${storeName}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="padding:36px;text-align:center;">
            ${logoHtml}
            <div style="font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:4px;">${storeName}</div>
            <p style="font-size:14px;color:#666;margin:16px 0 4px;">Hola ${data.customerName}, tu factura #${data.saleId} está lista.</p>
            <p style="font-size:13px;color:#888;margin:0 0 20px;">Puedes completar tu pago de forma segura haciendo clic en el botón:</p>
            <div style="font-size:26px;font-weight:700;color:${color};margin-bottom:20px;">${formatCOP(data.total)}</div>
            <a href="${data.paymentLink}" target="_blank"
               style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:8px;">
              Pagar ahora
            </a>
            <p style="font-size:11px;color:#ccc;margin:24px 0 0;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>${data.paymentLink}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendPaymentLinkEmail(data: PaymentLinkData): Promise<void> {
  const [settings] = await db.select().from(settingsTable);
  if (!settings) return;

  if (!settings.sendPaymentLinkEmail) {
    // Automatic payment-link email disabled in settings — skip silently
    return;
  }

  const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, storeName, logoUrl, primaryColor } = settings;

  if (!smtpHost || !smtpUser || !smtpPass) {
    // SMTP not configured — skip silently
    return;
  }

  const logoAttachment = logoUrl ? parseLogoAttachment(logoUrl) : null;
  const hasCidLogo = !!logoAttachment;

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort ?? 587,
    secure: (smtpPort ?? 587) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const html = buildPaymentLinkHtml(data, storeName, hasCidLogo, primaryColor ?? null);
  const subject = `Link de pago — Factura #${data.saleId} — ${storeName}`;

  await transporter.sendMail({
    from: `"${storeName}" <${smtpFrom ?? smtpUser}>`,
    to: data.customerEmail,
    subject,
    html,
    attachments: logoAttachment
      ? [{
          filename: "logo.jpg",
          content: logoAttachment.content,
          contentType: logoAttachment.contentType,
          cid: "store-logo",
        }]
      : [],
  });
}

export async function sendInvoiceEmail(invoice: InvoiceData): Promise<void> {
  // Load settings fresh each time (allows changing SMTP without restart)
  const [settings] = await db.select().from(settingsTable);
  if (!settings) return;

  if (!settings.sendInvoiceEmail) {
    // Invoice email sending disabled in settings — skip silently
    return;
  }

  const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, storeName, logoUrl, primaryColor } = settings;

  if (!smtpHost || !smtpUser || !smtpPass) {
    // SMTP not configured — skip silently
    return;
  }

  // Determine logo strategy: inline CID attachment (data URI) or plain <img src> (URL)
  const logoAttachment = logoUrl ? parseLogoAttachment(logoUrl) : null;
  const hasCidLogo = !!logoAttachment;

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort ?? 587,
    secure: (smtpPort ?? 587) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const html = buildInvoiceHtml(invoice, storeName, hasCidLogo, primaryColor ?? null, settings.storePhone ?? null, settings.storeAddress ?? null);
  const subject = `Factura #${invoice.saleId} — ${storeName}`;

  await transporter.sendMail({
    from: `"${storeName}" <${smtpFrom ?? smtpUser}>`,
    to: invoice.customerEmail,
    subject,
    html,
    attachments: logoAttachment
      ? [{
          filename: "logo.jpg",
          content: logoAttachment.content,
          contentType: logoAttachment.contentType,
          cid: "store-logo",          // referenced as cid:store-logo in the HTML
        }]
      : [],
  });
}
