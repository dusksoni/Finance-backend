const prisma = require("../lib/prisma");

/** 
 * Log activity (admin or employee)
 * @param {Object} params
 * @param {string} [params.adminId] - ID of the admin performing the action
 * @param {string} [params.employeeId] - ID of the employee performing the action
 * @param {string} [params.loginActivityId] - ID of the session in which action happened
 * @param {string} params.action - Description of what happened (e.g. 'UPDATED USER')
 * @param {string} params.table - The affected table name
 * @param {string} [params.targetId] - ID of the record that was affected
 * @param {Object} [params.metadata] - Extra context about the action (will be stored as JSON)
 */
const logAction = async ({
  adminId,
  employeeId,
  loginActivityId,
  action,
  table,
  targetId,
  message,
  metadata = {},
}) => {
  try {
    let normalizedMetadata = metadata;
    if (!normalizedMetadata || typeof normalizedMetadata !== "object" || Array.isArray(normalizedMetadata)) {
      normalizedMetadata = { value: normalizedMetadata };
    }
    if (message) {
      if (!normalizedMetadata.message) normalizedMetadata.message = message;
      if (!normalizedMetadata.summary) normalizedMetadata.summary = message;
    }

    await prisma.actionLog.create({
      data: {
        adminId,
        employeeId,
        loginActivityId,
        action,
        table,
        targetId,
        metadata: normalizedMetadata,
      },
    });
  } catch (error) {
    console.error("❌ Failed to log action:", error.message);
  }
};

module.exports = logAction;
