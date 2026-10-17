/** Email (pehle n8n Gmail node). SMTP config Integrations (type=email) ya .env se */
const nodemailer = require("nodemailer");
const integrationService = require("../integration.service");

const getTransport = async () => {
  const em = await integrationService.getResolved("email");
  if (!em.isEnabled || !em.config.host) return null;
  return {
    from: em.config.from || em.config.user,
    transport: nodemailer.createTransport({
      host: em.config.host,
      port: Number(em.config.port) || 587,
      secure: !!em.config.secure,
      auth: em.config.user ? { user: em.config.user, pass: em.secrets.password } : undefined,
    }),
  };
};

const send = async ({ to, subject, html, text }) => {
  if (!to) return { skipped: true, reason: "no_recipient" };
  const t = await getTransport();
  if (!t) {
    console.log(`[email:disabled] to=${to} subject="${subject}"`);
    return { skipped: true, reason: "email_disabled" };
  }
  const info = await t.transport.sendMail({ from: t.from, to, subject, html, text });
  return { sent: true, messageId: info.messageId };
};

const verify = async () => {
  const t = await getTransport();
  if (!t) throw new Error("Email integration is disabled or SMTP host missing");
  await t.transport.verify();
  return { ok: true };
};

module.exports = { send, verify };
