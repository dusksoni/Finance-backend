// controllers/superAdmin.controller.js
// Platform-level super admin: platform stats, admin management, system config

const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");

// ─── Platform stats ────────────────────────────────────────────────────────
exports.getPlatformStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalLoans,
      totalAdmins,
      totalEmployees,
      activeLoans,
      overdueLoans,
      npaLoans,
      totalDisbursed,
      totalCollected,
    ] = await Promise.all([
      prisma.user.count({ where: { isDeleted: false } }),
      prisma.loan.count(),
      prisma.admin.count(),
      prisma.employee.count(),
      prisma.loan.count({ where: { status: "ACTIVE" } }),
      prisma.loan.count({ where: { status: "OVERDUE" } }),
      prisma.loan.count({ where: { status: "NPA" } }),
      prisma.loan.aggregate({ _sum: { principalLoanAmount: true } }),
      prisma.payment.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
    ]);

    res.json({
      data: {
        totalUsers,
        totalLoans,
        totalAdmins,
        totalEmployees,
        activeLoans,
        overdueLoans,
        npaLoans,
        totalDisbursed: Math.round(totalDisbursed._sum.principalLoanAmount || 0),
        totalCollected: Math.round(totalCollected._sum.amount || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get platform stats", message: err.message });
  }
};

// ─── List all admins ───────────────────────────────────────────────────────
exports.listAdmins = async (req, res) => {
  try {
    const admins = await prisma.admin.findMany({
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: admins });
  } catch (err) {
    res.status(500).json({ error: "Failed to list admins", message: err.message });
  }
};

// ─── Reset admin password ─────────────────────────────────────────────────
exports.resetAdminPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.admin.update({ where: { id: req.params.id }, data: { password: hashed } });

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset password", message: err.message });
  }
};

// ─── System AppConfig management ──────────────────────────────────────────
exports.listAppConfig = async (req, res) => {
  try {
    const configs = await prisma.appConfig.findMany({ orderBy: { key: "asc" } });
    res.json({ data: configs });
  } catch (err) {
    res.status(500).json({ error: "Failed to get config", message: err.message });
  }
};

exports.upsertAppConfig = async (req, res) => {
  try {
    const { key, value, description } = req.body;
    if (!key || value === undefined) return res.status(400).json({ error: "key and value are required" });

    const config = await prisma.appConfig.upsert({
      where: { key },
      create: { key, value, description },
      update: { value, description },
    });

    res.json({ data: config });
  } catch (err) {
    res.status(500).json({ error: "Failed to upsert config", message: err.message });
  }
};

// ─── Action log viewer (platform-wide) ────────────────────────────────────
exports.getActionLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, adminId, action, fromDate, toDate } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (adminId) where.adminId = adminId;
    if (action) where.action = { contains: action, mode: "insensitive" };
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

    const [logs, total] = await Promise.all([
      prisma.actionLog.findMany({
        where,
        include: {
          admin: { select: { name: true, email: true } },
          employee: { select: { firstName: true, lastName: true, employeeId: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.actionLog.count({ where }),
    ]);

    res.json({ data: logs, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: "Failed to get action logs", message: err.message });
  }
};

// ─── Branch management ─────────────────────────────────────────────────────
exports.listBranches = async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      include: {
        _count: { select: { loans: true, employees: true } },
        region: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });
    res.json({ data: branches });
  } catch (err) {
    res.status(500).json({ error: "Failed to list branches", message: err.message });
  }
};

// ─── Database health / counts ──────────────────────────────────────────────
exports.getSystemHealth = async (req, res) => {
  try {
    const counts = await Promise.all([
      prisma.user.count(),
      prisma.loan.count(),
      prisma.payment.count(),
      prisma.eMI.count(),
      prisma.actionLog.count(),
      prisma.notificationLog.count(),
    ]);

    res.json({
      data: {
        users: counts[0],
        loans: counts[1],
        payments: counts[2],
        emis: counts[3],
        actionLogs: counts[4],
        notificationLogs: counts[5],
        dbStatus: "connected",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Health check failed", message: err.message });
  }
};
