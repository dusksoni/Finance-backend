/**
 * Regional notification helper.
 *
 * notifyRegionalApprovers — finds all active employees in the same region
 * (or state / company-wide depending on their accessScope) who hold a given
 * permission, then pushes an in-app notification to each of them.
 *
 * Use this instead of hard-coding "notify admin" so that the right people
 * in the right region receive the alert.
 *
 * notifyCreator — notify the employee who created a record (loan, payment…).
 * notifyGrievanceManagers — notify all employees with GRIEVANCE_MANAGE (company-wide).
 */

const prisma = require("../lib/prisma");
const { pushInApp } = require("./notificationService");

/**
 * Find all eligible approvers for a given branch + permission and push to each.
 *
 * @param {object} opts
 * @param {string}  opts.branchId      - The branch the record belongs to (used to resolve region/state)
 * @param {string}  opts.permission    - e.g. "LOAN_APPROVE", "PAYMENT_VERIFY", "KYC_APPROVE"
 * @param {string}  opts.title
 * @param {string}  opts.message
 * @param {string}  opts.linkUrl
 * @param {string}  [opts.triggerEvent]
 * @param {string}  [opts.excludeEmployeeId]  - Skip this employee (e.g. the one who created the record)
 */
async function notifyRegionalApprovers({ branchId, permission, title, message, linkUrl, triggerEvent, excludeEmployeeId }) {
  try {
    // Resolve the branch's region and state
    const branch = branchId
      ? await prisma.branch.findUnique({
          where: { id: branchId },
          select: { regionId: true, region: { select: { stateId: true } } },
        })
      : null;

    const regionId = branch?.regionId || null;
    const stateId = branch?.region?.stateId || null;

    // Find employees who have this permission AND can see this region
    const candidates = await prisma.employee.findMany({
      where: {
        isDeleted: false,
        isBlocked: false,
        role: { permissions: { has: permission } },
        OR: [
          { accessScope: "ALL" },
          ...(stateId ? [{ accessScope: "STATE", stateId }] : []),
          ...(regionId ? [{ regionId }] : []),
          ...(regionId ? [{ extraRegionIds: { has: regionId } }] : []),
        ],
        ...(excludeEmployeeId ? { id: { not: excludeEmployeeId } } : {}),
      },
      select: { id: true },
    });

    await Promise.all(
      candidates.map((emp) =>
        pushInApp({
          targetType: "EMPLOYEE",
          targetId: emp.id,
          title,
          message,
          linkUrl,
          triggerEvent: triggerEvent || permission,
        }).catch(() => {})
      )
    );
  } catch (_) {}
}

/**
 * Notify the employee who created/owns a record.
 */
async function notifyCreator({ employeeId, title, message, linkUrl, triggerEvent }) {
  if (!employeeId) return;
  try {
    await pushInApp({ targetType: "EMPLOYEE", targetId: employeeId, title, message, linkUrl, triggerEvent: triggerEvent || "RECORD_UPDATE" });
  } catch (_) {}
}

/**
 * Notify all employees with GRIEVANCE_MANAGE permission (company-wide — no region filter).
 */
async function notifyGrievanceManagers({ title, message, linkUrl, excludeEmployeeId }) {
  try {
    const candidates = await prisma.employee.findMany({
      where: {
        isDeleted: false,
        isBlocked: false,
        role: { permissions: { has: "GRIEVANCE_MANAGE" } },
        ...(excludeEmployeeId ? { id: { not: excludeEmployeeId } } : {}),
      },
      select: { id: true },
    });

    await Promise.all(
      candidates.map((emp) =>
        pushInApp({ targetType: "EMPLOYEE", targetId: emp.id, title, message, linkUrl, triggerEvent: "GRIEVANCE_RAISED" }).catch(() => {})
      )
    );
  } catch (_) {}
}

/**
 * Notify a customer (User) via in-app push (WebSocket room USER:<id>).
 */
async function notifyUser({ userId, title, message, linkUrl, triggerEvent }) {
  if (!userId) return;
  try {
    await pushInApp({ targetType: "USER", targetId: userId, title, message, linkUrl, triggerEvent: triggerEvent || "USER_NOTIFICATION" });
  } catch (_) {}
}

module.exports = { notifyRegionalApprovers, notifyCreator, notifyGrievanceManagers, notifyUser };
