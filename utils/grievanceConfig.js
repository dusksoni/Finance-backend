const { buildEffectiveConfigMap } = require("./appConfig");

const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const VALID_SOURCES = ["BRANCH", "CALL_CENTER", "EMAIL", "WEB", "APP", "OTHER"];

const normalizeUpperString = (value, fallback = null) => {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || fallback;
};

const getGrievanceSettings = async (prisma) => {
  const records = await prisma.appConfig.findMany({
    where: {
      key: {
        in: ["grievance.management"],
      },
    },
  });

  const configs = buildEffectiveConfigMap(records);
  const grievance = configs["grievance.management"] || {};

  return {
    categories: Array.isArray(grievance.categories) ? grievance.categories.map((item) => normalizeUpperString(item)) : [],
    publicCategories: Array.isArray(grievance.publicCategories)
      ? grievance.publicCategories.map((item) => normalizeUpperString(item))
      : [],
    defaultPriority: normalizeUpperString(grievance.defaultPriority, "MEDIUM"),
    publicDefaultPriority: normalizeUpperString(grievance.publicDefaultPriority, "MEDIUM"),
    ticketPrefix: String(grievance.ticketPrefix || "GRV").trim() || "GRV",
    publicCommentEnabled: grievance.publicCommentEnabled !== false,
    autoAssignToBranchEmployee: Boolean(grievance.autoAssignToBranchEmployee),
    slaHours: grievance.slaHours || {
      LOW: 72,
      MEDIUM: 48,
      HIGH: 24,
      URGENT: 8,
    },
  };
};

const validationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const resolveGrievancePriority = (settings, priority, { isPublic = false } = {}) => {
  const fallback = isPublic ? settings.publicDefaultPriority : settings.defaultPriority;
  const normalized = normalizeUpperString(priority, fallback);
  if (!VALID_PRIORITIES.includes(normalized)) {
    throw validationError("Invalid grievance priority");
  }
  return normalized;
};

const resolveGrievanceCategory = (settings, category, { isPublic = false } = {}) => {
  const normalized = normalizeUpperString(category);
  const allowed = isPublic ? settings.publicCategories : settings.categories;
  if (!normalized || !allowed.includes(normalized)) {
    throw validationError("Invalid grievance category");
  }
  return normalized;
};

const resolveGrievanceSource = (source, fallback = "BRANCH") => {
  const normalized = normalizeUpperString(source, fallback);
  if (!VALID_SOURCES.includes(normalized)) {
    throw validationError("Invalid grievance source");
  }
  return normalized;
};

const calculateDueAtForPriority = (settings, priority) => {
  const hours = Number(settings.slaHours?.[priority] ?? settings.slaHours?.MEDIUM ?? 48);
  return new Date(Date.now() + hours * 60 * 60 * 1000);
};

const buildGrievanceTicketNumber = async (prisma, prefix = "GRV") => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await prisma.grievanceTicket.count({
    where: {
      createdAt: {
        gte: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
      },
    },
  });

  return `${prefix}-${datePart}-${String(count + 1).padStart(4, "0")}`;
};

module.exports = {
  buildGrievanceTicketNumber,
  calculateDueAtForPriority,
  getGrievanceSettings,
  resolveGrievanceCategory,
  resolveGrievancePriority,
  resolveGrievanceSource,
};
