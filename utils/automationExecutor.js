/**
 * Automation Rule Executor
 * Evaluates active AutomationRules against current data and fires configured actions.
 * Called by cron (nightly) or triggered on specific events.
 *
 * Supported triggers:
 *   EMI_OVERDUE, DPD_THRESHOLD, INSURANCE_EXPIRY, COLLATERAL_VALUATION_DUE,
 *   PROMISE_TO_PAY_BROKEN, COLLECTION_ESCALATION, KYC_EXPIRY
 */

const prisma = require("../lib/prisma");
const { sendByCategory } = require("./notificationService");
const { addDays, isBefore } = require("date-fns");

// ─── Condition evaluator ──────────────────────────────────────────────────────

function evaluateCondition(condition, context) {
  if (!condition) return true;
  const { dpdGte, dpdLte, amountGte, bucketIn } = condition;
  if (dpdGte !== undefined && context.dpd < dpdGte) return false;
  if (dpdLte !== undefined && context.dpd > dpdLte) return false;
  if (amountGte !== undefined && context.amount < amountGte) return false;
  if (bucketIn && !bucketIn.includes(context.bucket)) return false;
  return true;
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function fireAction(rule, context) {
  const params = rule.actionParamsJson || {};

  switch (rule.action) {
    case "CREATE_TASK": {
      const existing = await prisma.taskQueue.findFirst({
        where: {
          entityType: context.entityType,
          entityId: context.entityId,
          automationRuleId: rule.id,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      });
      if (!existing) {
        await prisma.taskQueue.create({
          data: {
            taskType: params.taskType || "FOLLOW_UP",
            entityType: context.entityType,
            entityId: context.entityId,
            title: params.title || rule.name,
            description: params.description || rule.description,
            priority: params.priority || "MEDIUM",
            dueAt: params.dueDays ? addDays(new Date(), params.dueDays) : null,
            automationRuleId: rule.id,
            metadata: context,
          },
        });
      }
      break;
    }

    case "FLAG_COLLECTION_CASE": {
      const cCase = await prisma.collectionCase.findFirst({
        where: { loanId: context.loanId, status: { in: ["OPEN", "IN_PROGRESS", "PROMISE_TO_PAY"] } },
      });
      if (cCase) {
        await prisma.collectionCase.update({
          where: { id: cCase.id },
          data: { priority: params.priority || "HIGH" },
        });
      }
      break;
    }

    case "ESCALATE_CASE": {
      const cCase = await prisma.collectionCase.findFirst({
        where: { loanId: context.loanId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      });
      if (cCase) {
        await prisma.collectionCase.update({
          where: { id: cCase.id },
          data: { status: "IN_PROGRESS", priority: "CRITICAL", metadata: { escalatedByAutomation: rule.id } },
        });
      }
      break;
    }

    case "SEND_NOTIFICATION": {
      if (context.phone && params.templateCategory) {
        await sendByCategory(
          params.templateCategory,
          params.channel || "SMS",
          context.phone,
          {
            borrowerName: context.borrowerName || "",
            loanId: context.loanId || "",
            dpd: String(context.dpd || ""),
            amount: String(context.amount || ""),
          },
          { loanId: context.loanId, userId: context.userId }
        );
      }
      break;
    }

    case "LOG_ALERT": {
      await prisma.notificationLog.create({
        data: {
          targetType: context.entityType || "LOAN",
          targetId: context.entityId || context.loanId,
          triggerEvent: rule.triggerEvent,
          channel: "IN_APP",
          status: "SENT",
          contentRendered: `Automation rule "${rule.name}" triggered: ${JSON.stringify(context)}`,
          sentAt: new Date(),
        },
      });
      break;
    }
  }
}

// ─── Trigger processors ───────────────────────────────────────────────────────

async function processEMIOverdue(rules) {
  const overdueLoans = await prisma.loan.findMany({
    where: { fileStatus: { in: ["ACTIVE", "OVERDUE", "DEFAULTED"] }, isClosed: false },
    select: {
      id: true, fileNo: true, userId: true,
      user: { select: { phone: true, firstName: true, lastName: true } },
      collectionCases: {
        where: { status: { in: ["OPEN", "IN_PROGRESS", "PROMISE_TO_PAY", "BROKEN_PROMISE"] } },
        select: { dpd: true, bucket: true, totalDue: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  for (const loan of overdueLoans) {
    const cCase = loan.collectionCases[0];
    if (!cCase || cCase.dpd <= 0) continue;

    const context = {
      entityType: "LOAN",
      entityId: loan.id,
      loanId: loan.id,
      userId: loan.userId,
      dpd: cCase.dpd,
      bucket: cCase.bucket,
      amount: cCase.totalDue,
      phone: loan.user?.phone,
      borrowerName: `${loan.user?.firstName || ""} ${loan.user?.lastName || ""}`.trim(),
    };

    for (const rule of rules) {
      if (evaluateCondition(rule.conditionJson, context)) {
        await fireAction(rule, context);
      }
    }
  }
}

async function processDPDThreshold(rules) {
  // Same as EMI_OVERDUE but specifically for DPD_THRESHOLD trigger
  await processEMIOverdue(rules);
}

async function processInsuranceExpiry(rules) {
  const soon = addDays(new Date(), 30);
  const loans = await prisma.loan.findMany({
    where: { insuranceValidTill: { lte: soon }, insuranceAlert: false, isClosed: false },
    select: { id: true, userId: true, fileNo: true, insuranceValidTill: true, user: { select: { phone: true, firstName: true } } },
  });

  for (const loan of loans) {
    const context = { entityType: "LOAN", entityId: loan.id, loanId: loan.id, userId: loan.userId, phone: loan.user?.phone, borrowerName: loan.user?.firstName, amount: 0, dpd: 0, bucket: "CURRENT" };
    for (const rule of rules) {
      if (evaluateCondition(rule.conditionJson, context)) await fireAction(rule, context);
    }
    // Flag so it doesn't re-trigger
    await prisma.loan.update({ where: { id: loan.id }, data: { insuranceAlert: true } });
  }
}

async function processCollateralValuationDue(rules) {
  const sixMonthsAgo = addDays(new Date(), -180);
  const collaterals = await prisma.collateralRecord.findMany({
    where: { status: "ACTIVE", OR: [{ lastValuationDate: { lte: sixMonthsAgo } }, { lastValuationDate: null }] },
    select: { id: true, loanId: true, loan: { select: { userId: true, user: { select: { phone: true, firstName: true } } } } },
  });

  for (const c of collaterals) {
    const context = { entityType: "COLLATERAL", entityId: c.id, loanId: c.loanId, userId: c.loan?.userId, phone: c.loan?.user?.phone, dpd: 0, amount: 0, bucket: "CURRENT" };
    for (const rule of rules) {
      if (evaluateCondition(rule.conditionJson, context)) await fireAction(rule, context);
    }
  }
}

async function processPTPBroken(rules) {
  const broken = await prisma.promiseToPay.findMany({
    where: { status: "BROKEN" },
    select: { id: true, loanId: true, loan: { select: { userId: true, user: { select: { phone: true, firstName: true } } } } },
  });

  for (const p of broken) {
    const context = { entityType: "LOAN", entityId: p.loanId, loanId: p.loanId, userId: p.loan?.userId, phone: p.loan?.user?.phone, dpd: 0, amount: 0, bucket: "CURRENT" };
    for (const rule of rules) {
      if (evaluateCondition(rule.conditionJson, context)) await fireAction(rule, context);
    }
  }
}

// ─── Main executor ────────────────────────────────────────────────────────────

async function runAutomationRules() {
  console.log("🤖 Running automation rule executor...");

  const rules = await prisma.automationRule.findMany({ where: { isActive: true } });
  if (!rules.length) { console.log("   No active automation rules."); return; }

  const byTrigger = {};
  for (const r of rules) {
    if (!byTrigger[r.triggerEvent]) byTrigger[r.triggerEvent] = [];
    byTrigger[r.triggerEvent].push(r);
  }

  const processors = {
    EMI_OVERDUE: processEMIOverdue,
    DPD_THRESHOLD: processDPDThreshold,
    INSURANCE_EXPIRY: processInsuranceExpiry,
    COLLATERAL_VALUATION_DUE: processCollateralValuationDue,
    PROMISE_TO_PAY_BROKEN: processPTPBroken,
  };

  for (const [trigger, triggerRules] of Object.entries(byTrigger)) {
    if (processors[trigger]) {
      try {
        await processors[trigger](triggerRules);
        console.log(`   ✓ Processed ${trigger} (${triggerRules.length} rules)`);
      } catch (err) {
        console.error(`   ✗ Failed ${trigger}:`, err.message);
      }
    }
  }

  console.log("✅ Automation rule executor done");
}

module.exports = { runAutomationRules };
