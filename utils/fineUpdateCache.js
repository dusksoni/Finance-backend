// utils/fineUpdateCache.js
// Simple in-memory cache to track last fine update time per loan
// Helps avoid unnecessary database updates within the 1-hour window

/**
 * Cache structure: Map<loanId, lastUpdateTimestamp>
 * Stores when fines were last updated for each loan
 */
const fineUpdateCache = new Map();

/**
 * Cache duration: 1 hour in milliseconds
 * Fines will only be updated if more than 1 hour has passed since last update
 */
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check if a loan's fines should be updated based on cache
 * @param {string} loanId - The loan ID to check
 * @returns {boolean} - True if fines should be updated (cache expired or not cached)
 */
function shouldUpdateLoanFines(loanId) {
  if (!loanId) return true;

  const lastUpdate = fineUpdateCache.get(loanId);

  // If no cache entry, should update
  if (!lastUpdate) return true;

  // Check if cache has expired (more than 1 hour since last update)
  const now = Date.now();
  const timeSinceUpdate = now - lastUpdate;

  return timeSinceUpdate >= CACHE_DURATION_MS;
}

/**
 * Mark that a loan's fines were just updated
 * @param {string} loanId - The loan ID to mark as updated
 */
function markLoanFinesUpdated(loanId) {
  if (!loanId) return;

  fineUpdateCache.set(loanId, Date.now());
}

/**
 * Clear all cache entries
 * Useful for testing or forced refresh scenarios
 */
function clearCache() {
  fineUpdateCache.clear();
  console.log('🧹 Fine update cache cleared');
}

/**
 * Get cache statistics for monitoring
 * @returns {object} - Cache stats (size, entries)
 */
function getCacheStats() {
  return {
    size: fineUpdateCache.size,
    entries: Array.from(fineUpdateCache.entries()).map(([loanId, timestamp]) => ({
      loanId,
      lastUpdate: new Date(timestamp),
      age: Date.now() - timestamp,
    })),
  };
}

module.exports = {
  shouldUpdateLoanFines,
  markLoanFinesUpdated,
  clearCache,
  getCacheStats,
  CACHE_DURATION_MS,
};
