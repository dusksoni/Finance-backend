const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

// ─── Saved Reports CRUD ───────────────────────────────────────────────────────

exports.createReport = async (req, res) => {
  try {
    const { name, description, entityType, filtersJson, columnsJson, sortJson, schedule, outputFormat } = req.body;
    const report = await prisma.savedReport.create({
      data: { name, description, entityType, filtersJson, columnsJson, sortJson, schedule: schedule ?? "NONE", outputFormat: outputFormat ?? "EXCEL", createdByAdminId: req.user.adminId, createdByEmployeeId: req.user.employeeId },
    });
    res.status(201).json({ message: "Report saved", data: report });
  } catch (err) {
    res.status(500).json({ error: "Failed to create saved report", message: err.message });
  }
};

exports.listReports = async (req, res) => {
  try {
    const { entityType } = req.query;
    const reports = await prisma.savedReport.findMany({
      where: { isActive: true, ...(entityType ? { entityType } : {}) },
      orderBy: { name: "asc" },
    });
    res.json({ data: reports });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch saved reports" });
  }
};

exports.updateReport = async (req, res) => {
  try {
    const report = await prisma.savedReport.update({ where: { id: req.params.id }, data: req.body });
    res.json({ message: "Report updated", data: report });
  } catch (err) {
    res.status(500).json({ error: "Failed to update report", message: err.message });
  }
};

exports.deleteReport = async (req, res) => {
  try {
    await prisma.savedReport.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: "Report deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete report" });
  }
};

// ─── Run Report ───────────────────────────────────────────────────────────────

const ENTITY_QUERIES = {
  LOANS: async (filters) => {
    const where = {};
    if (filters.fileStatus) where.fileStatus = filters.fileStatus;
    if (filters.branchId) where.branchId = filters.branchId;
    if (filters.loanTypeId) where.loanTypeId = filters.loanTypeId;
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) where.createdAt.lte = new Date(filters.toDate);
    }
    return prisma.loan.findMany({ where, include: { user: { select: { firstName: true, lastName: true, phone: true } }, loanType: { select: { name: true } }, branch: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: filters.limit ?? 5000 });
  },
  PAYMENTS: async (filters) => {
    const where = {};
    if (filters.status) where.status = filters.status;
    if (filters.paymentMode) where.paymentMode = filters.paymentMode;
    if (filters.fromDate || filters.toDate) {
      where.paymentDate = {};
      if (filters.fromDate) where.paymentDate.gte = new Date(filters.fromDate);
      if (filters.toDate) where.paymentDate.lte = new Date(filters.toDate);
    }
    return prisma.payment.findMany({ where, include: { loan: { select: { fileNo: true } } }, orderBy: { paymentDate: "desc" }, take: filters.limit ?? 5000 });
  },
  USERS: async (filters) => {
    const where = {};
    if (filters.isBlocked !== undefined) where.isBlocked = filters.isBlocked === "true";
    if (filters.isDefaulter !== undefined) where.isDefaulter = filters.isDefaulter === "true";
    return prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, take: filters.limit ?? 5000 });
  },
  COLLECTIONS: async (filters) => {
    const where = {};
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.bucket) where.bucket = filters.bucket;
    if (filters.branchId) where.branchId = filters.branchId;
    return prisma.collectionCase.findMany({ where, include: { loan: { select: { fileNo: true } } }, orderBy: { createdAt: "desc" }, take: filters.limit ?? 5000 });
  },
  EMIS: async (filters) => {
    const where = {};
    if (filters.status) where.status = filters.status;
    if (filters.fromDate || filters.toDate) {
      where.paymentFor = {};
      if (filters.fromDate) where.paymentFor.gte = new Date(filters.fromDate);
      if (filters.toDate) where.paymentFor.lte = new Date(filters.toDate);
    }
    return prisma.eMI.findMany({ where, include: { loan: { select: { fileNo: true, userId: true } } }, orderBy: { paymentFor: "asc" }, take: filters.limit ?? 5000 });
  },
  PARTNERS: async (filters) => {
    const where = {};
    if (filters.partnerType) where.partnerType = filters.partnerType;
    if (filters.status) where.status = filters.status;
    return prisma.channelPartner.findMany({ where, include: { payouts: { select: { status: true, netAmount: true } } }, orderBy: { name: "asc" } });
  },
  EMPLOYEES: async (filters) => {
    const where = { isDeleted: false };
    if (filters.roleId) where.roleId = filters.roleId;
    if (filters.branchId) where.branchId = filters.branchId;
    return prisma.employee.findMany({ where, include: { role: { select: { name: true } }, branch: { select: { name: true } } }, orderBy: { name: "asc" } });
  },
};

exports.runReport = async (req, res) => {
  try {
    const report = await prisma.savedReport.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: "Report not found" });

    const queryFn = ENTITY_QUERIES[report.entityType];
    if (!queryFn) return res.status(400).json({ error: `Unsupported entity type: ${report.entityType}` });

    const filters = report.filtersJson || {};
    const run = await prisma.reportRun.create({
      data: { reportId: report.id, status: "PENDING", triggeredByAdminId: req.user.adminId, triggeredByEmployeeId: req.user.employeeId },
    });

    // Execute query
    const rows = await queryFn(filters);

    // Filter to requested columns
    const columns = Array.isArray(report.columnsJson) && report.columnsJson.length > 0 ? report.columnsJson : null;
    const data = columns ? rows.map((row) => Object.fromEntries(columns.map((col) => [col, row[col]]))) : rows;

    await prisma.reportRun.update({ where: { id: run.id }, data: { status: "COMPLETED", rowCount: data.length, completedAt: new Date() } });
    await prisma.savedReport.update({ where: { id: report.id }, data: { lastRunAt: new Date() } });

    res.json({ message: "Report executed", runId: run.id, rowCount: data.length, data });
  } catch (err) {
    res.status(500).json({ error: "Failed to run report", message: err.message });
  }
};

exports.runAdHoc = async (req, res) => {
  try {
    const { entityType, filters = {}, columns = [] } = req.body;
    const queryFn = ENTITY_QUERIES[entityType];
    if (!queryFn) return res.status(400).json({ error: `Unsupported entity type: ${entityType}` });
    const rows = await queryFn(filters);
    const data = columns.length > 0 ? rows.map((row) => Object.fromEntries(columns.map((col) => [col, row[col]]))) : rows;
    res.json({ rowCount: data.length, data });
  } catch (err) {
    res.status(500).json({ error: "Failed to run ad-hoc report", message: err.message });
  }
};

exports.listRuns = async (req, res) => {
  try {
    const runs = await prisma.reportRun.findMany({
      where: { reportId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json({ data: runs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch report runs" });
  }
};
