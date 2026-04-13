/**
 * Notification Delivery Service
 * Handles actual delivery of notifications via SMS, Email, WhatsApp, Push.
 * Reads CommTemplate → renders → delivers → logs to CommLog + NotificationLog.
 *
 * 3rd-party adapters (SMS, Email, WhatsApp) are stubbed — wire in real SDKs
 * (MSG91, SendGrid, etc.) by replacing the adapter functions below.
 */

const prisma = require("../lib/prisma");
const msg91 = require("./msg91");

// ─── Adapters (stub for now — replace with real SDKs when API keys are ready) ─

async function sendSMS(to, body) {
  if (!process.env.MSG91_AUTH_KEY) {
    console.warn(`[SMS-STUB] To: ${to} | Body: ${body.substring(0, 80)}`);
    return { stubbed: true };
  }
  // MSG91 already integrated via msg91.js — reuse its axios call pattern
  const axios = require("axios");
  const res = await axios.post(
    "https://control.msg91.com/api/v5/flow/",
    {
      flow_id: process.env.MSG91_SMS_FLOW_ID || process.env.MSG91_TEMPLATE_ID,
      sender: process.env.MSG91_SENDER_ID || "NBFCAP",
      mobiles: `91${to.replace(/\D/g, "")}`,
      VAR1: body,
    },
    { headers: { authkey: process.env.MSG91_AUTH_KEY, "Content-Type": "application/json" } }
  );
  return res.data;
}

async function sendEmail(to, subject, body) {
  // Stub — wire in SendGrid / AWS SES / Nodemailer when ready
  console.warn(`[EMAIL-STUB] To: ${to} | Subject: ${subject}`);
  return { stubbed: true };
}

async function sendWhatsApp(to, body) {
  // Stub — wire in MSG91 WhatsApp or Gupshup when ready
  console.warn(`[WHATSAPP-STUB] To: ${to} | Body: ${body.substring(0, 80)}`);
  return { stubbed: true };
}

async function sendPush(userId, title, body) {
  // Stub — wire in Firebase FCM when ready
  console.warn(`[PUSH-STUB] UserId: ${userId} | Title: ${title}`);
  return { stubbed: true };
}

// ─── Variable substitution ─────────────────────────────────────────────────

function renderBody(template, vars = {}) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), v ?? "");
  }
  return out;
}

// ─── Core send function ───────────────────────────────────────────────────────

/**
 * Send a notification using a CommTemplate.
 * @param {object} opts
 * @param {string}  opts.templateId    - CommTemplate id
 * @param {string}  opts.recipient     - phone / email
 * @param {object}  opts.variables     - key-value pairs for template vars
 * @param {string}  [opts.loanId]
 * @param {string}  [opts.userId]
 * @param {string}  [opts.triggerEvent]
 * @param {string}  [opts.sentByAdminId]
 * @param {string}  [opts.sentByEmployeeId]
 */
async function sendFromTemplate(opts) {
  const { templateId, recipient, variables = {}, loanId, userId, triggerEvent, sentByAdminId, sentByEmployeeId } = opts;

  const template = await prisma.commTemplate.findUnique({ where: { id: templateId } });
  if (!template || !template.isActive) throw new Error(`Template ${templateId} not found or inactive`);

  const body = renderBody(template.body, variables);
  const subject = template.subject ? renderBody(template.subject, variables) : null;

  let status = "FAILED";
  let failReason = null;
  let sentAt = null;
  let result = null;

  try {
    if (template.type === "SMS") result = await sendSMS(recipient, body);
    else if (template.type === "EMAIL") result = await sendEmail(recipient, subject, body);
    else if (template.type === "WHATSAPP") result = await sendWhatsApp(recipient, body);
    else if (template.type === "PUSH_NOTIFICATION") result = await sendPush(userId || recipient, subject || "Notification", body);
    status = "SENT";
    sentAt = new Date();
  } catch (err) {
    failReason = err.message;
  }

  // Log to CommLog
  const log = await prisma.commLog.create({
    data: {
      templateId,
      loanId,
      userId,
      type: template.type,
      recipient,
      subject,
      body,
      status,
      failReason,
      sentAt,
      sentByAdminId,
      sentByEmployeeId,
    },
  });

  // Also log to NotificationLog
  await prisma.notificationLog.create({
    data: {
      templateKey: template.name,
      targetType: loanId ? "LOAN" : userId ? "USER" : "SYSTEM",
      targetId: loanId || userId || "SYSTEM",
      triggerEvent,
      channel: template.type,
      status,
      contentRendered: body,
      error: failReason,
      sentAt,
    },
  });

  return { status, logId: log.id, result };
}

/**
 * Send a raw notification (no template).
 */
async function sendRaw(opts) {
  const { type, recipient, subject, body, loanId, userId, triggerEvent } = opts;

  let status = "FAILED";
  let failReason = null;
  let sentAt = null;

  try {
    if (type === "SMS") await sendSMS(recipient, body);
    else if (type === "EMAIL") await sendEmail(recipient, subject, body);
    else if (type === "WHATSAPP") await sendWhatsApp(recipient, body);
    status = "SENT";
    sentAt = new Date();
  } catch (err) {
    failReason = err.message;
  }

  await prisma.notificationLog.create({
    data: {
      targetType: loanId ? "LOAN" : userId ? "USER" : "SYSTEM",
      targetId: loanId || userId || "SYSTEM",
      triggerEvent,
      channel: type,
      status,
      contentRendered: body,
      error: failReason,
      sentAt,
    },
  });

  return { status, failReason };
}

/**
 * Find the first active template matching category + type and send.
 * Convenience wrapper for cron/automation use.
 */
async function sendByCategory(category, type, recipient, variables = {}, meta = {}) {
  const template = await prisma.commTemplate.findFirst({
    where: { category, type, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!template) {
    console.warn(`[NOTIFY] No active template for category=${category} type=${type}`);
    return null;
  }
  return sendFromTemplate({ templateId: template.id, recipient, variables, ...meta });
}

module.exports = { sendFromTemplate, sendRaw, sendByCategory, renderBody };
