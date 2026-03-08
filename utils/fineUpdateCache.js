// utils/fineUpdateCache.js
// DB-based staleness check for fine refresh — works correctly under PM2 multi-process.
// Instead of an in-memory Map (which is per-process), we check the EMI table directly:
// if no UNPAID/PARTIAL EMI for this loan has been updated within the last hour we skip.
//
// The caller passes the Prisma client (or tx client) so this works inside transactions too.

const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check if a loan's fines should be refreshed.
 * Returns true when at least one UNPAID/PARTIAL EMI for the loan was last updated
 * more than 1 hour ago (i.e. fines may be stale).
 *
 * @param {object} prismaClient - Prisma client or transaction client
 * @param {string} loanId
 * @returns {Promise<boolean>}
 */
async function shouldUpdateLoanFines(prismaClient, loanId) {
  if (!loanId) return true;

  const threshold = new Date(Date.now() - CACHE_DURATION_MS);

  // Count EMIs that are overdue AND haven't been touched in the last hour
  const staleCount = await prismaClient.eMI.count({
    where: {
      loanId,
      status: { in: ["UNPAID", "PARTIAL"] },
      updatedAt: { lt: threshold },
    },
  });

  return staleCount > 0;
}

/**
 * Mark fines as refreshed by touching updatedAt on all UNPAID/PARTIAL EMIs.
 * Uses updateMany for a single round-trip.
 *
 * @param {object} prismaClient - Prisma client or transaction client
 * @param {string} loanId
 */
async function markLoanFinesUpdated(prismaClient, loanId) {
  if (!loanId) return;

  await prismaClient.eMI.updateMany({
    where: {
      loanId,
      status: { in: ["UNPAID", "PARTIAL"] },
    },
    data: { updatedAt: new Date() },
  });
}

module.exports = {
  shouldUpdateLoanFines,
  markLoanFinesUpdated,
  CACHE_DURATION_MS,
};
