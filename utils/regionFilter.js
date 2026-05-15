/**
 * Region-based access filter helpers.
 *
 * Every list endpoint calls getRegionFilter() or getBranchFilter() and
 * spreads the result into its Prisma `where` clause.  Returning `null`
 * means "no filter" — admin or ALL-scope employees see everything.
 *
 * accessScope values (stored on Employee):
 *   REGION  – own regionId + any extraRegionIds (default)
 *   STATE   – all regions in selected states (stateId + extraStateIds)
 *   ALL     – no restriction
 */

/**
 * For models that carry `regionId` directly (User, KYCRecord via user,
 * Employee, GrievanceTicket when branch-less).
 *
 * @returns {object|null} Prisma where fragment, or null (no filter)
 */
function getRegionFilter(user) {
  if (!user) return null;
  if (user.type === "ADMIN" || user.accessScope === "ALL") return null;

  if (user.accessScope === "STATE") {
    const stateIds = [user.stateId, ...(user.extraStateIds || [])].filter(Boolean);
    if (stateIds.length === 0) return null;
    return { region: { stateId: { in: stateIds } } };
  }

  // REGION scope (default)
  const allowed = [user.regionId, ...(user.extraRegionIds || [])].filter(Boolean);
  if (allowed.length === 0) return null;
  return { regionId: { in: allowed } };
}

/**
 * For models that carry `branchId` (Loan, Payment via loan,
 * CollectionCase, GrievanceTicket).
 * Prisma path: `branch.regionId` / `branch.region.stateId`
 *
 * @returns {object|null}
 */
function getBranchFilter(user) {
  if (!user) return null;
  if (user.type === "ADMIN" || user.accessScope === "ALL") return null;

  if (user.accessScope === "STATE") {
    const stateIds = [user.stateId, ...(user.extraStateIds || [])].filter(Boolean);
    if (stateIds.length === 0) return null;
    return { branch: { region: { stateId: { in: stateIds } } } };
  }

  const allowed = [user.regionId, ...(user.extraRegionIds || [])].filter(Boolean);
  if (allowed.length === 0) return null;
  return { branch: { regionId: { in: allowed } } };
}

/**
 * For Payment list — payments are nested under loans which have branchId.
 * Use this when the Payment model itself doesn't have branchId but has loanId.
 *
 * @returns {object|null}
 */
function getPaymentBranchFilter(user) {
  const bf = getBranchFilter(user);
  if (!bf) return null;
  return { loan: bf };
}

module.exports = { getRegionFilter, getBranchFilter, getPaymentBranchFilter };
