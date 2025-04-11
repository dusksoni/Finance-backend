const prisma = require("../lib/prisma");

/**
 * Log admin activity
 * @param {Object} params
 * @param {number} params.adminId
 * @param {string} params.action - What happened (e.g. 'CREATED EMPLOYEE')
 * @param {string} params.table - Affected table (e.g. 'Employee')
 * @param {number} [params.targetId] - Affected record ID
 * @param {Object} [params.metadata] - Optional context (sent as JSON)
 */
const logAdminAction = async ({ adminId, action, table, targetId, metadata }) => {
  try {
    await prisma.adminActionLog.create({
      data: {
        adminId,
        action,
        table,
        targetId,
        metadata,
      },
    });
  } catch (error) {
    console.error("Failed to log admin action:", error.message);
  }
};

module.exports = logAdminAction;
