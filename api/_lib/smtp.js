/**
 * api/_lib/smtp.js
 * ------------------------------------------------------------
 * SMTP email sending via nodemailer — an alternative to Resend for
 * people who'd rather use a Gmail account (or any other SMTP provider)
 * than sign up for a separate email API.
 *
 * For Gmail specifically: you cannot use your normal Gmail password.
 * Enable 2-Step Verification on the Google account, then create an
 * "App Password" (Google Account → Security → 2-Step Verification →
 * App passwords) and use that 16-character value as SMTP_PASS.
 *
 * Same sendEmail(to, subject, html) interface as api/_lib/resend.js —
 * lib/mailer.js picks whichever one to use based on EMAIL_PROVIDER.
 */
const nodemailer = require("nodemailer");

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error(
      "SMTP_USER / SMTP_PASS are not set. For Gmail, SMTP_USER is your full @gmail.com address and SMTP_PASS is a 16-character Google App Password (not your normal password) — see .env.example."
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465 (implicit TLS), false for 587 (STARTTLS)
    auth: { user, pass },
  });
  return transporter;
}

/**
 * Sends one transactional email via SMTP.
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function sendEmail(to, subject, html) {
  if (!to || typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { success: false, error: "Invalid or missing recipient email address." };
  }
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

  try {
    const t = getTransporter();
    const info = await t.sendMail({ from, to, subject, html });
    return { success: true, id: info.messageId || null };
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : "Unknown SMTP sending error" };
  }
}

module.exports = { sendEmail };
