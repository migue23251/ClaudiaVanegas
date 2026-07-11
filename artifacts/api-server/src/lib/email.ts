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
  paymentType: "contado" | "credito";
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

function buildInvoiceHtml(invoice: InvoiceData, storeName: string, logoUrl: string | null, primaryColor: string | null) {
  const color = primaryColor ?? "#c2697a";
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${storeName}" style="max-height:64px;max-width:200px;object-fit:contain;" />`
    : `<span style="font-size:22px;font-weight:700;color:${color};">${storeName}</span>`;

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

  const paymentLabel = invoice.paymentType === "credito" ? "Crédito" : "Contado";

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
                <td>${logoHtml}</td>
                <td align="right" style="color:#fff;font-size:13px;line-height:1.6;">
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
          <td style="padding:28px 36px;text-align:center;border-top:1px solid #f0f0f0;margin-top:24px;">
            <p style="font-size:12px;color:#bbb;margin:0;">
              Este correo fue generado automáticamente por ${storeName}. Por favor no responda a este mensaje.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendInvoiceEmail(invoice: InvoiceData): Promise<void> {
  // Load settings fresh each time (allows changing SMTP without restart)
  const [settings] = await db.select().from(settingsTable);
  if (!settings) return;

  const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, storeName, logoUrl, primaryColor } = settings;

  if (!smtpHost || !smtpUser || !smtpPass) {
    // SMTP not configured — skip silently
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort ?? 587,
    secure: (smtpPort ?? 587) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const html = buildInvoiceHtml(invoice, storeName, logoUrl ?? null, primaryColor ?? null);
  const subject = `Factura #${invoice.saleId} — ${storeName}`;

  await transporter.sendMail({
    from: `"${storeName}" <${smtpFrom ?? smtpUser}>`,
    to: invoice.customerEmail,
    subject,
    html,
  });
}
