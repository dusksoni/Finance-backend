// utils/seedDefaultTemplates.js
// Run this once to populate default communication templates in the DB.
// node utils/seedDefaultTemplates.js

const prisma = require("../lib/prisma");

const DEFAULT_TEMPLATES = [
  // ─── EMI Reminders ─────────────────────────────────────────────────────
  {
    name: "EMI Due Reminder (SMS)",
    category: "EMI_DUE_REMINDER",
    type: "SMS",
    subject: null,
    body: "Dear {{name}}, your EMI of Rs {{amount}} for loan {{fileNo}} is due on {{dueDate}}. Please pay on time to avoid penalty. -NBFC",
    variables: ["name", "amount", "fileNo", "dueDate"],
    isActive: true,
  },
  {
    name: "EMI Due Reminder (WhatsApp)",
    category: "EMI_DUE_REMINDER",
    type: "WHATSAPP",
    subject: null,
    body: "Dear *{{name}}*,\n\nYour EMI of *Rs {{amount}}* for loan *{{fileNo}}* is due on *{{dueDate}}*.\n\nPlease make the payment on time to avoid late charges.\n\nThank you.",
    variables: ["name", "amount", "fileNo", "dueDate"],
    isActive: true,
  },
  // ─── Overdue Reminders ─────────────────────────────────────────────────
  {
    name: "Overdue Notice (SMS)",
    category: "OVERDUE_NOTICE",
    type: "SMS",
    subject: null,
    body: "Dear {{name}}, your EMI of Rs {{amount}} for loan {{fileNo}} is overdue by {{dpd}} days. Please pay immediately to avoid additional charges. -NBFC",
    variables: ["name", "amount", "fileNo", "dpd"],
    isActive: true,
  },
  {
    name: "Legal Notice (SMS)",
    category: "LEGAL_NOTICE",
    type: "SMS",
    subject: null,
    body: "URGENT: Dear {{name}}, your loan {{fileNo}} is overdue by {{dpd}} days with outstanding Rs {{amount}}. Legal action may be initiated if not paid immediately. -NBFC",
    variables: ["name", "amount", "fileNo", "dpd"],
    isActive: true,
  },
  // ─── Loan Disbursement ─────────────────────────────────────────────────
  {
    name: "Loan Disbursement Confirmation (SMS)",
    category: "LOAN_DISBURSAL",
    type: "SMS",
    subject: null,
    body: "Dear {{name}}, your loan of Rs {{amount}} (File No: {{fileNo}}) has been disbursed. Your first EMI of Rs {{emi}} is due on {{dueDate}}. -NBFC",
    variables: ["name", "amount", "fileNo", "emi", "dueDate"],
    isActive: true,
  },
  // ─── Payment Received ──────────────────────────────────────────────────
  {
    name: "Payment Confirmation (SMS)",
    category: "PAYMENT_CONFIRMATION",
    type: "SMS",
    subject: null,
    body: "Dear {{name}}, we received your payment of Rs {{amount}} for loan {{fileNo}} on {{date}}. Receipt No: {{receiptNo}}. Balance: Rs {{balance}}. -NBFC",
    variables: ["name", "amount", "fileNo", "date", "receiptNo", "balance"],
    isActive: true,
  },
  // ─── Loan Approval ─────────────────────────────────────────────────────
  {
    name: "Loan Approval (SMS)",
    category: "LOAN_APPROVAL",
    type: "SMS",
    subject: null,
    body: "Congratulations {{name}}! Your loan application {{fileNo}} for Rs {{amount}} has been approved. Our team will contact you for disbursement. -NBFC",
    variables: ["name", "fileNo", "amount"],
    isActive: true,
  },
  // ─── Insurance/Collateral Expiry ───────────────────────────────────────
  {
    name: "Insurance Expiry Reminder (SMS)",
    category: "INSURANCE_EXPIRY",
    type: "SMS",
    subject: null,
    body: "Dear {{name}}, the insurance/valuation for your loan {{fileNo}} expires on {{expiryDate}}. Please renew to avoid issues. -NBFC",
    variables: ["name", "fileNo", "expiryDate"],
    isActive: true,
  },
  // ─── KYC Reminder ──────────────────────────────────────────────────────
  {
    name: "KYC Completion Reminder (SMS)",
    category: "KYC_REMINDER",
    type: "SMS",
    subject: null,
    body: "Dear {{name}}, your KYC is incomplete for loan application {{fileNo}}. Please complete it at the earliest to avoid delays. -NBFC",
    variables: ["name", "fileNo"],
    isActive: true,
  },
  // ─── Welcome ───────────────────────────────────────────────────────────
  {
    name: "Welcome Message (SMS)",
    category: "WELCOME",
    type: "SMS",
    subject: null,
    body: "Welcome to NBFC, {{name}}! Your account has been created. Your loan File No is {{fileNo}}. For any queries, contact us. -NBFC",
    variables: ["name", "fileNo"],
    isActive: true,
  },
];

async function seedDefaultTemplates() {
  console.log("🌱 Seeding default communication templates...");
  let created = 0;
  let skipped = 0;

  for (const tpl of DEFAULT_TEMPLATES) {
    const existing = await prisma.commTemplate.findFirst({
      where: { name: tpl.name, type: tpl.type },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.commTemplate.create({
      data: {
        ...tpl,
        variables: tpl.variables,
      },
    });
    created++;
  }

  console.log(`✅ Templates seeded: ${created} created, ${skipped} already existed`);
}

if (require.main === module) {
  seedDefaultTemplates()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}

module.exports = { seedDefaultTemplates };
