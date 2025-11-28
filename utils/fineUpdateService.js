// utils/fineUpdateService.js
// Automated fine update service with cron jobs
// Runs daily at 12:01 AM and every 6 hours as backup

const cron = require('node-cron');
const Decimal = require('decimal.js');
const prisma = require('../lib/prisma');
const { calculateFine } = require('./calculateFine');

// Configure Decimal.js for precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// Helper functions for Decimal.js operations
const toDecimal = (n) => new Decimal(n || 0);
const toNumber = (d) => Number(d.toFixed(2));

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

        const { daysLate, fineAmt } = calculateFine(e.paymentFor, emiDue);
        const newFine = toNumber(toDecimal(fineAmt));
        const newDelay = Number(daysLate || 0);
        const isDelayed = newDelay > 0;

        // Only update if changed
        if (
          toNumber(toDecimal(e.fineAmount || 0)) !== newFine ||
          Number(e.delayDays || 0) !== newDelay
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

  console.log('✅ Fine update cron jobs initialized successfully');
  console.log('   - Daily update: 12:01 AM (Asia/Kolkata)');
  console.log('   - Backup update: Every 6 hours');
}

module.exports = {
  updateAllOverdueFines,
  initializeCronJobs
};