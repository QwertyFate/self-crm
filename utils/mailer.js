/* ═══════════════════════════════════════════════════════════════════════════
   EMAIL — SMTP via nodemailer. Currently only password-reset mail.

   OPTIONAL. With no SMTP_HOST, getTransport() returns null and
   sendPasswordReset() logs the reset link to stdout and returns
   { sent:false, resetUrl } instead of sending anything. That is a development
   convenience so you can reset a password with no mail server.

   ⚠ The caller (routes/auth.js) puts that resetUrl in the HTTP RESPONSE when
     sent is false. On a production server without SMTP configured, anyone who
     can post an email address to /api/auth/forgot-password gets a working
     reset link back. Configure SMTP in production, or gate that branch on
     NODE_ENV.

   Adding a second email: export another function here rather than calling
   nodemailer from a route, so the "no SMTP configured" fallback stays in one
   place.
   ═══════════════════════════════════════════════════════════════════════════ */

const nodemailer = require('nodemailer');

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

async function sendPasswordReset(toEmail, resetUrl) {
  const transport = getTransport();

  if (!transport) {
    console.log(`\n[PASSWORD RESET LINK] ${toEmail}\n  ${resetUrl}\n`);
    return { sent: false, resetUrl };
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM || 'CRM <noreply@crm>',
    to: toEmail,
    subject: 'Reset your CRM password',
    html: `
      <p>Someone requested a password reset for your CRM account.</p>
      <p><a href="${resetUrl}" style="background:#4f6ef7;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Reset password</a></p>
      <p style="color:#888;font-size:12px">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
    `,
  });

  return { sent: true };
}

module.exports = { sendPasswordReset };
