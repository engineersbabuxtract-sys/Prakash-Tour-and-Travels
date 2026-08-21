/**
 * lib/mailer.js
 * Every outbound email in the system should go through sendAndLogEmail()
 * so that (a) it's actually sent server-side only via a real provider,
 * and (b) it's permanently recorded in EmailLog (Part 2.10 / 33),
 * regardless of whether the provider reports success or failure.
 *
 * Provider choice: set EMAIL_PROVIDER=resend (default) or
 * EMAIL_PROVIDER=smtp. Both implement the same
 * sendEmail(to, subject, html) interface — see api/_lib/resend.js and
 * api/_lib/smtp.js. Only the chosen provider's module is loaded, so you
 * only need that provider's env vars set (RESEND_API_KEY for Resend, or
 * SMTP_USER/SMTP_PASS for SMTP/Gmail).
 */
const { prisma } = require("./db");
const { TEMPLATES } = require("../api/_lib/emailTemplates");

function getProvider() {
  const provider = (process.env.EMAIL_PROVIDER || "resend").toLowerCase();
  if (provider === "smtp") return require("../api/_lib/smtp");
  if (provider === "resend") return require("../api/_lib/resend");
  throw new Error(`Unknown EMAIL_PROVIDER "${provider}" — use "resend" or "smtp".`);
}

const BUSINESS = {
  name: "Prakash Tour & Travels",
  phone: process.env.BUSINESS_PHONE || "8409150824",
  whatsapp: process.env.BUSINESS_WHATSAPP || "918409150824",
  email: process.env.BUSINESS_EMAIL || "info@prakashtourtravels.in",
  address: "Near Sasaram Railway Station, Sasaram, Bihar",
};

/**
 * @param {string} emailType - key into TEMPLATES (see api/_lib/emailTemplates.js)
 * @param {string} recipient
 * @param {object} templateData - passed to the template function, minus business/appUrl
 * @param {string|null} bookingId - internal Booking.id, for EmailLog linkage
 */
async function sendAndLogEmail(emailType, recipient, templateData, bookingId = null) {
  const templateFn = TEMPLATES[emailType];
  if (!templateFn) {
    console.warn(`[mailer] No template registered for emailType "${emailType}" — skipping send, logging as FAILED.`);
    return prisma.emailLog.create({
      data: {
        bookingId,
        emailType,
        recipient: recipient || "unknown",
        subject: `(no template: ${emailType})`,
        status: "FAILED",
        errorMessage: `No email template registered for "${emailType}"`,
      },
    });
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const { subject, html } = templateFn({ business: BUSINESS, appUrl, ...templateData });

  const { sendEmail } = getProvider();
  const result = await sendEmail(recipient, subject, html);

  return prisma.emailLog.create({
    data: {
      bookingId,
      emailType,
      recipient,
      subject,
      resendMessageId: result.success ? result.id : null,
      status: result.success ? "SENT" : "FAILED",
      errorMessage: result.success ? null : result.error,
      sentAt: result.success ? new Date() : null,
    },
  });
}

module.exports = { sendAndLogEmail, BUSINESS };
