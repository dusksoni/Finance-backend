// utils/fineUpdateService.js
// Automated fine update service with cron jobs
// Runs daily at 12:01 AM and every 6 hours as backup

const cron = require('node-cron');
const Decimal = require('decimal.js');
const prisma = require('../lib/prisma');
const { calculateFine } = require('./calculateFine');
const { buildCollectionSummaryFromEmis, getCollectionBucket, getCollectionPriority } = require('./collectionCase');
const { getCollectionPolicy } = require('./loanTypeRules');
const { addDays, isBefore } = require('date-fns');
const { runAutomationRules } = require('./automationExecutor');

// Configure Decimal.js for precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// Helper functions for Decimal.js operations
const toDecimal = (n) => new Decimal(n || 0);
// Round to whole number (no decimals)
const toNumber = (d) => Math.round(Number(d));

async function updateAllOverdueFines() {
  const startTime = Date.now();
  console.log('🔄 Starting fine update job...');
  
  try {
    const today = new Date();
    
    // Get ALL overdue EMIs across all loans
    const overdueEmis = await prisma.eMI.findMany({
      where: {
        status: { in: ["UNPAID", "PARTIAL"] },
        paymentFor: { lte: today },
      },
      select: {
        id: true,
        loanId: true,
        paymentFor: true,
        emiPayAmount: true,
        amountPaidSoFar: true,
        finePaid: true,
        fineAmount: true,
        delayDays: true,
        isDelayed: true,
      },
    });

    console.log(`📊 Found ${overdueEmis.length} overdue EMIs`);

    // Batch updates by groups of 100 to avoid memory issues
    const batchSize = 100;
    const batches = [];
    
    for (let i = 0; i < overdueEmis.length; i += batchSize) {
      batches.push(overdueEmis.slice(i, i + batchSize));
    }

    let updatedCount = 0;

    for (const batch of batches) {
      const updates = batch.map(async (e) => {
        const emiPaidComponent = toDecimal(e.amountPaidSoFar || 0)
          .minus(toDecimal(e.finePaid || 0))
          .toNumber();
        
        const emiDue = Math.max(
          toNumber(toDecimal(e.emiPayAmount || 0).minus(emiPaidComponent)),
          0
        );

        const storedFine = toNumber(toDecimal(e.fineAmount || 0));
        const storedDelay = Number(e.delayDays || 0);
        const storedIsDelayed = Boolean(e.isDelayed || storedDelay > 0);

        let newFine = storedFine;
        let newDelay = storedDelay;
        let isDelayed = storedIsDelayed;

        if (emiDue > 0) {
          const { daysLate, fineAmt } = calculateFine(e.paymentFor, emiDue);
          newFine = toNumber(toDecimal(fineAmt));
          newDelay = Number(daysLate || 0);
          isDelayed = newDelay > 0;
        }

        // Only update if changed
        if (
          storedFine !== newFine ||
          storedDelay !== newDelay ||
          storedIsDelayed !== isDelayed
        ) {
          await prisma.eMI.update({
            where: { id: e.id },
            data: { 
              fineAmount: newFine, 
              delayDays: newDelay, 
              isDelayed,
              updatedAt: new Date() // Force timestamp update
            },
          });
          return true;
        }
        return false;
      });

      const results = await Promise.all(updates);
      updatedCount += results.filter(Boolean).length;
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Fine update completed: ${updatedCount} EMIs updated in ${duration}ms`);
    
    return { success: true, updated: updatedCount, duration };
  } catch (error) {
    console.error('❌ Fine update job failed:', error);
    throw error;
  }
}

/**
 * Initialize cron jobs for automatic fine updates
 * Should be called once when the server starts
 */
function initializeCronJobs() {
  console.log('📅 Initializing fine update cron jobs...');

  // Main job: Run every day at 12:01 AM (Asia/Kolkata timezone)
  cron.schedule('1 0 * * *', async () => {
    console.log('⏰ Running daily fine update (12:01 AM)...');
    try {
      await updateAllOverdueFines();
    } catch (error) {
      console.error('❌ Daily fine update failed:', error.message);
    }
  }, {
    timezone: 'Asia/Kolkata'
  });

  // Backup job: Run every 6 hours as a safety net
  cron.schedule('0 */6 * * *', async () => {
    console.log('⏰ Running 6-hour backup fine update...');
    try {
      await updateAllOverdueFines();
    } catch (error) {
      console.error('❌ Backup fine update failed:', error.message);
    }
  }, {
    timezone: 'Asia/Kolkata'
  });

  // Collection sync: Run every day at 12:30 AM
  cron.schedule('30 0 * * *', async () => {
    console.log('⏰ Running nightly collection case sync...');
    try {
      await syncCollectionCasesCron();
    } catch (error) {
      console.error('❌ Collection sync cron failed:', error.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  // Bucket migration: Run every day at 1:00 AM (after sync)
  cron.schedule('0 1 * * *', async () => {
    console.log('⏰ Running nightly bucket migration...');
    try {
      await migrateBucketsCron();
    } catch (error) {
      console.error('❌ Bucket migration cron failed:', error.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  // Grievance escalation: Run every day at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('⏰ Running grievance auto-escalation...');
    try {
      await escalateOverdueGrievancesCron();
    } catch (error) {
      console.error('❌ Grievance escalation cron failed:', error.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  // Loan status DPD migration: 1:30 AM (after bucket migration)
  cron.schedule('30 1 * * *', async () => {
    try { await updateLoanStatusByDPD(); } catch (e) { console.error('❌ Loan status DPD cron:', e.message); }
  }, { timezone: 'Asia/Kolkata' });

  // Scheduled reports: 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    try { await runScheduledReports(); } catch (e) { console.error('❌ Scheduled reports cron:', e.message); }
  }, { timezone: 'Asia/Kolkata' });

  // Collateral & insurance expiry: Weekly Sunday 10:00 AM
  cron.schedule('0 10 * * 0', async () => {
    try { await checkCollateralAndInsuranceExpiry(); } catch (e) { console.error('❌ Expiry check cron:', e.message); }
  }, { timezone: 'Asia/Kolkata' });

  // Reversal escalation: 2:30 AM daily
  cron.schedule('30 2 * * *', async () => {
    try { await escalateStaleReversals(); } catch (e) { console.error('❌ Reversal escalation cron:', e.message); }
  }, { timezone: 'Asia/Kolkata' });

  // Automation rule executor: 3:00 AM daily
  cron.schedule('0 3 * * *', async () => {
    try { await runAutomationRules(); } catch (e) { console.error('❌ Automation executor cron:', e.message); }
  }, { timezone: 'Asia/Kolkata' });

  // Log archival: 3:30 AM daily (light window)
  cron.schedule('30 3 * * *', async () => {
    try { await archiveOldLogs(); } catch (e) { console.error('❌ Log archival cron:', e.message); }
  }, { timezone: 'Asia/Kolkata' });

  // EMI due reminder: 9:00 AM daily — send SMS/WhatsApp for EMIs due in 3 days
  cron.schedule('0 9 * * *', async () => {
    try { await sendEmiDueReminders(); } catch (e) { console.error('❌ EMI due reminder cron:', e.message); }
  }, { timezone: 'Asia/Kolkata' });

  // Overdue reminder sequence: 10:00 AM daily — escalating reminders for 1/7/30 DPD
  cron.schedule('0 10 * * *', async () => {
    try { await sendOverdueReminders(); } catch (e) { console.error('❌ Overdue reminder cron:', e.message); }
  }, { timezone: 'Asia/Kolkata' });

  console.log('✅ All cron jobs initialized');
  console.log('   12:01 AM — Fine update | 12:30 AM — Collection sync | 1:00 AM — Bucket migration');
  console.log('   1:30 AM — Loan status DPD | 2:00 AM — Scheduled reports | 2:30 AM — Reversal escalation');
  console.log('   3:00 AM — Automation rules | 3:30 AM — Log archival');
  console.log('   9:00 AM — Grievance escalation + EMI due reminders | 10:00 AM — Overdue reminders');
  console.log('   Sun 10:00 AM — Collateral/insurance expiry check');
}

// ─── Collection Case Sync (cron-safe, no req/res) ────────────────────────────

async function syncCollectionCasesCron() {
  console.log('🔄 Running collection case sync...');
  const ACTIVE_STATUSES = ["OPEN", "IN_PROGRESS", "PROMISE_TO_PAY", "BROKEN_PROMISE"];

  try {
    const loans = await prisma.loan.findMany({
      where: {
        fileStatus: { in: ["ACTIVE", "OVERDUE", "DEFAULTED", "UNDER_COLLECTION"] },
        isDeleted: false,
      },
      select: {
        id: true,
        fileNo: true,
        branchId: true,
        loanType: { select: { rules: true } },
      },
    });

    let created = 0, updated = 0, closed = 0;

    for (const loan of loans) {
      const collectionPolicy = getCollectionPolicy(loan.loanType?.rules);

      const overdueEmis = await prisma.eMI.findMany({
        where: { loanId: loan.id, status: { in: ["UNPAID", "PARTIAL"] }, paymentFor: { lte: new Date() } },
        select: { id: true, paymentFor: true, emiPayAmount: true, amountPaidSoFar: true, finePaid: true, fineAmount: true },
        orderBy: { paymentFor: 'asc' },
      });

      const summary = buildCollectionSummaryFromEmis(overdueEmis, loan.loanType?.rules);

      const existing = await prisma.collectionCase.findFirst({
        where: { loanId: loan.id, status: { in: ACTIVE_STATUSES } },
        orderBy: { createdAt: 'desc' },
      });

      if (!collectionPolicy.autoCreateOnOverdue) {
        if (existing) {
          await prisma.collectionCase.update({ where: { id: existing.id }, data: { status: "RESOLVED", resolutionType: "AUTO_SYNC_DISABLED_BY_POLICY" } });
          closed++;
        }
        continue;
      }

      if (summary.dpd <= 0 || summary.overdueEmiCount <= 0 || summary.totalDue <= 0) {
        if (existing) {
          await prisma.collectionCase.update({ where: { id: existing.id }, data: { status: "RESOLVED", resolutionType: "AUTO_SYNC_CLOSED" } });
          closed++;
        }
        continue;
      }

      const isBrokenPromise =
        existing?.status === "PROMISE_TO_PAY" &&
        existing.latestPromiseDate &&
        isBefore(addDays(new Date(existing.latestPromiseDate), collectionPolicy.promiseToPayGraceDays || 3), new Date());

      const payload = {
        branchId: loan.branchId,
        bucket: summary.bucket,
        dpd: summary.dpd,
        priority: summary.priority,
        overdueEmiCount: summary.overdueEmiCount,
        overdueAmount: summary.overdueAmount,
        overdueFineAmount: summary.overdueFineAmount,
        totalDue: summary.totalDue,
        oldestDueDate: summary.oldestDueDate,
      };

      if (existing) {
        await prisma.collectionCase.update({
          where: { id: existing.id },
          data: { ...payload, status: isBrokenPromise ? "BROKEN_PROMISE" : existing.status },
        });
        updated++;
      } else {
        await prisma.collectionCase.create({ data: { loanId: loan.id, ...payload } });
        created++;
      }
    }

    console.log(`✅ Collection sync done: ${created} created, ${updated} updated, ${closed} closed`);
    return { created, updated, closed };
  } catch (err) {
    console.error('❌ Collection sync failed:', err.message);
    throw err;
  }
}

// ─── Bucket Migration Cron ───────────────────────────────────────────────────
// Migrates open collection cases to a new bucket when DPD crosses thresholds

async function migrateBucketsCron() {
  console.log('🔄 Running collection bucket migration...');
  try {
    const ACTIVE_STATUSES = ["OPEN", "IN_PROGRESS", "PROMISE_TO_PAY", "BROKEN_PROMISE"];
    const cases = await prisma.collectionCase.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      select: { id: true, dpd: true, bucket: true, loan: { select: { loanType: { select: { rules: true } } } } },
    });

    let migrated = 0;
    for (const c of cases) {
      const newBucket = getCollectionBucket(c.dpd, c.loan?.loanType?.rules);
      if (newBucket !== c.bucket) {
        await prisma.collectionCase.update({ where: { id: c.id }, data: { bucket: newBucket, priority: getCollectionPriority(c.dpd, newBucket) } });
        migrated++;
      }
    }

    console.log(`✅ Bucket migration done: ${migrated} cases migrated`);
    return { migrated };
  } catch (err) {
    console.error('❌ Bucket migration failed:', err.message);
    throw err;
  }
}

// ─── Grievance Auto-Escalation Cron ─────────────────────────────────────────

async function escalateOverdueGrievancesCron() {
  console.log('🔄 Running grievance auto-escalation...');
  try {
    const now = new Date();

    // Find open/in-progress grievances past their dueAt
    const overdue = await prisma.grievanceTicket.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        dueAt: { lt: now },
      },
      select: { id: true, priority: true, dueAt: true },
    });

    const ESCALATION_MAP = { LOW: "MEDIUM", MEDIUM: "HIGH", HIGH: "URGENT", URGENT: "URGENT" };
    let escalated = 0;

    for (const g of overdue) {
      const newPriority = ESCALATION_MAP[g.priority] || g.priority;
      await prisma.grievanceTicket.update({
        where: { id: g.id },
        data: { priority: newPriority },
      });
      escalated++;
    }

    console.log(`✅ Grievance escalation done: ${escalated} tickets escalated`);
    return { escalated };
  } catch (err) {
    console.error('❌ Grievance escalation failed:', err.message);
    throw err;
  }
}

// ─── Loan fileStatus DPD Migration Cron ──────────────────────────────────────
// Updates Loan.fileStatus based on DPD: ACTIVE → OVERDUE → DEFAULTED → UNDER_COLLECTION

async function updateLoanStatusByDPD() {
  console.log('🔄 Running loan status DPD migration...');
  try {
    const cases = await prisma.collectionCase.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "PROMISE_TO_PAY", "BROKEN_PROMISE"] } },
      select: { loanId: true, dpd: true, loan: { select: { fileStatus: true, loanType: { select: { rules: true } } } } },
    });

    const DPD_OVERDUE = 1;
    const DPD_DEFAULTED = 90;
    const DPD_COLLECTION = 120;

    let updated = 0;
    for (const c of cases) {
      const { dpd, loan } = c;
      if (!loan) continue;
      let newStatus = loan.fileStatus;
      if (dpd >= DPD_COLLECTION && loan.fileStatus !== "UNDER_COLLECTION") newStatus = "UNDER_COLLECTION";
      else if (dpd >= DPD_DEFAULTED && loan.fileStatus === "ACTIVE") newStatus = "DEFAULTED";
      else if (dpd >= DPD_OVERDUE && loan.fileStatus === "ACTIVE") newStatus = "OVERDUE";
      if (newStatus !== loan.fileStatus) {
        await prisma.loan.update({ where: { id: c.loanId }, data: { fileStatus: newStatus, isDefaulted: newStatus === "DEFAULTED" } });
        updated++;
      }
    }

    console.log(`✅ Loan status DPD migration: ${updated} loans updated`);
    return { updated };
  } catch (err) {
    console.error('❌ Loan status DPD migration failed:', err.message);
    throw err;
  }
}

// ─── Scheduled Reports Cron ───────────────────────────────────────────────────

async function runScheduledReports() {
  console.log('🔄 Running scheduled reports...');
  try {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const dayOfMonth = now.getDate();

    const reports = await prisma.savedReport.findMany({
      where: { isActive: true, schedule: { not: "NONE" } },
    });

    let ran = 0;
    for (const report of reports) {
      const shouldRun =
        report.schedule === "DAILY" ||
        (report.schedule === "WEEKLY" && dayOfWeek === 1) || // Mondays
        (report.schedule === "MONTHLY" && dayOfMonth === 1);

      if (!shouldRun) continue;

      // Trigger a report run (reuse the savedReport runner logic inline)
      try {
        await prisma.reportRun.create({
          data: {
            savedReportId: report.id,
            status: "TRIGGERED",
            triggeredAt: now,
            metadata: { trigger: "SCHEDULED_CRON" },
          },
        });
        await prisma.savedReport.update({ where: { id: report.id }, data: { lastRunAt: now } });
        ran++;
      } catch (e) {
        console.error(`   Report ${report.id} failed:`, e.message);
      }
    }

    console.log(`✅ Scheduled reports: ${ran} triggered`);
    return { ran };
  } catch (err) {
    console.error('❌ Scheduled reports cron failed:', err.message);
    throw err;
  }
}

// ─── Collateral / Insurance Expiry Cron ──────────────────────────────────────

async function checkCollateralAndInsuranceExpiry() {
  console.log('🔄 Checking collateral & insurance expiry...');
  try {
    const soon = addDays(new Date(), 30);
    const loans = await prisma.loan.findMany({
      where: { insuranceValidTill: { lte: soon }, insuranceAlert: false, isClosed: false },
      select: { id: true },
    });
    if (loans.length) {
      await prisma.loan.updateMany({
        where: { id: { in: loans.map(l => l.id) } },
        data: { insuranceAlert: true },
      });
      // Create tasks for each
      for (const loan of loans) {
        await prisma.taskQueue.create({
          data: {
            taskType: "INSURANCE_RENEWAL",
            entityType: "LOAN",
            entityId: loan.id,
            title: "Insurance expiring within 30 days",
            priority: "HIGH",
            dueAt: soon,
          },
        });
      }
    }

    // Collateral valuation due (>6 months since last valuation)
    const sixMonthsAgo = addDays(new Date(), -180);
    const collaterals = await prisma.collateralRecord.findMany({
      where: { status: "ACTIVE", OR: [{ lastValuationDate: { lte: sixMonthsAgo } }, { lastValuationDate: null }] },
      select: { id: true, loanId: true },
    });
    for (const c of collaterals) {
      const existing = await prisma.taskQueue.findFirst({
        where: { entityType: "COLLATERAL", entityId: c.id, taskType: "VALUATION", status: { in: ["OPEN", "IN_PROGRESS"] } },
      });
      if (!existing) {
        await prisma.taskQueue.create({
          data: {
            taskType: "VALUATION",
            entityType: "COLLATERAL",
            entityId: c.id,
            title: "Collateral valuation overdue (>6 months)",
            priority: "MEDIUM",
          },
        });
      }
    }

    console.log(`✅ Insurance alerts: ${loans.length}, Valuation tasks: ${collaterals.length}`);
    return { insuranceAlerts: loans.length, valuationTasks: collaterals.length };
  } catch (err) {
    console.error('❌ Collateral/insurance expiry check failed:', err.message);
    throw err;
  }
}

// ─── Reversal Escalation Cron ─────────────────────────────────────────────────

async function escalateStaleReversals() {
  console.log('🔄 Running reversal escalation...');
  try {
    const threeDaysAgo = addDays(new Date(), -3);
    const stale = await prisma.reversalRequest.findMany({
      where: { status: "PENDING", createdAt: { lte: threeDaysAgo } },
      select: { id: true },
    });
    if (stale.length) {
      await prisma.reversalRequest.updateMany({
        where: { id: { in: stale.map(r => r.id) } },
        data: { status: "ESCALATED" },
      });
    }
    console.log(`✅ Reversal escalation: ${stale.length} escalated`);
    return { escalated: stale.length };
  } catch (err) {
    console.error('❌ Reversal escalation failed:', err.message);
    throw err;
  }
}

// ─── Data Retention / Log Archival Cron ──────────────────────────────────────

async function archiveOldLogs() {
  console.log('🔄 Running log archival...');
  try {
    // Get retention days from AppConfig (default 90)
    const config = await prisma.appConfig.findUnique({ where: { key: "LOG_RETENTION_DAYS" } });
    const retentionDays = Number(config?.value) || 90;
    const cutoff = addDays(new Date(), -retentionDays);

    const tables = [
      { model: 'actionLog', prismaKey: 'actionLog' },
      { model: 'commLog', prismaKey: 'commLog' },
      { model: 'notificationLog', prismaKey: 'notificationLog' },
    ];

    let totalArchived = 0;
    for (const { prismaKey } of tables) {
      const rows = await prisma[prismaKey].findMany({
        where: { createdAt: { lte: cutoff } },
        take: 500,
      });
      for (const row of rows) {
        await prisma.archivedLog.create({
          data: { sourceTable: prismaKey, sourceId: row.id, data: row },
        });
        await prisma[prismaKey].delete({ where: { id: row.id } });
        totalArchived++;
      }
    }

    console.log(`✅ Log archival: ${totalArchived} records archived`);
    return { archived: totalArchived };
  } catch (err) {
    console.error('❌ Log archival failed:', err.message);
    throw err;
  }
}

// ─── EMI Due Reminder (3 days before due date) ───────────────────────────────
async function sendEmiDueReminders() {
  const { sendByCategory } = require('./notificationService');
  console.log('📱 Running EMI due reminder job...');

  const today = new Date();
  const reminderDate = addDays(today, 3);
  const reminderDateStart = new Date(reminderDate);
  reminderDateStart.setHours(0, 0, 0, 0);
  const reminderDateEnd = new Date(reminderDate);
  reminderDateEnd.setHours(23, 59, 59, 999);

  try {
    const emis = await prisma.eMI.findMany({
      where: {
        status: { in: ['UNPAID', 'PARTIAL'] },
        dueDate: { gte: reminderDateStart, lte: reminderDateEnd },
      },
      include: {
        loan: {
          select: {
            fileNo: true,
            user: { select: { id: true, firstName: true, lastName: true, mobileNumber: true } },
          },
        },
      },
    });

    let sent = 0;
    for (const emi of emis) {
      const user = emi.loan?.user;
      if (!user?.mobileNumber) continue;

      const dueAmount = (emi.totalAmount || 0) - (emi.paidAmount || 0);
      await sendByCategory('EMI_DUE_REMINDER', 'SMS', user.mobileNumber, {
        name: user.firstName,
        fileNo: emi.loan.fileNo,
        dueDate: new Date(emi.dueDate).toLocaleDateString('en-IN'),
        amount: Math.round(dueAmount).toLocaleString('en-IN'),
      }, { targetType: 'USER', targetId: user.id });

      sent++;
    }

    console.log(`✅ EMI due reminders sent: ${sent}`);
  } catch (err) {
    console.error('❌ EMI due reminder failed:', err.message);
  }
}

// ─── Overdue Reminder Sequence (1 / 7 / 30 DPD) ─────────────────────────────
async function sendOverdueReminders() {
  const { sendByCategory } = require('./notificationService');
  console.log('📱 Running overdue reminder job...');

  const today = new Date();
  const DPD_MILESTONES = [1, 7, 30];

  try {
    for (const dpd of DPD_MILESTONES) {
      const targetDate = addDays(today, -dpd);
      const targetStart = new Date(targetDate);
      targetStart.setHours(0, 0, 0, 0);
      const targetEnd = new Date(targetDate);
      targetEnd.setHours(23, 59, 59, 999);

      const emis = await prisma.eMI.findMany({
        where: {
          status: { in: ['UNPAID', 'PARTIAL'] },
          dueDate: { gte: targetStart, lte: targetEnd },
        },
        include: {
          loan: {
            select: {
              fileNo: true,
              user: { select: { id: true, firstName: true, lastName: true, mobileNumber: true } },
            },
          },
        },
      });

      for (const emi of emis) {
        const user = emi.loan?.user;
        if (!user?.mobileNumber) continue;

        const dueAmount = (emi.totalAmount || 0) - (emi.paidAmount || 0);
        const category = dpd <= 7 ? 'OVERDUE_NOTICE' : 'LEGAL_NOTICE';

        await sendByCategory(category, 'SMS', user.mobileNumber, {
          name: user.firstName,
          fileNo: emi.loan.fileNo,
          dpd: String(dpd),
          amount: Math.round(dueAmount).toLocaleString('en-IN'),
        }, { targetType: 'USER', targetId: user.id });
      }
    }

    console.log('✅ Overdue reminders sent');
  } catch (err) {
    console.error('❌ Overdue reminder failed:', err.message);
  }
}

module.exports = {
  updateAllOverdueFines,
  initializeCronJobs,
  syncCollectionCasesCron,
  migrateBucketsCron,
  escalateOverdueGrievancesCron,
  updateLoanStatusByDPD,
  runScheduledReports,
  checkCollateralAndInsuranceExpiry,
  escalateStaleReversals,
  archiveOldLogs,
  sendEmiDueReminders,
  sendOverdueReminders,
};
