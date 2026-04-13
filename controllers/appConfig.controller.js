const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");
const {
  buildEffectiveConfigList,
  getConfigDefinition,
  prepareConfigValue,
} = require("../utils/appConfig");

const buildActorFields = (req) => ({
  updatedByAdminId: req.user?.adminId || null,
  updatedByEmployeeId: req.user?.employeeId || null,
});

exports.listAppConfigs = async (req, res) => {
  try {
    const category = req.query.category ? String(req.query.category) : null;
    const publicOnly = String(req.query.publicOnly || "false").toLowerCase() === "true";

    const records = await prisma.appConfig.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(publicOnly ? { isPublic: true } : {}),
      },
      orderBy: [{ category: "asc" }, { key: "asc" }],
    });

    const effective = buildEffectiveConfigList(records).filter((item) => {
      if (category && item.category !== category) return false;
      if (publicOnly && !item.isPublic) return false;
      return true;
    });

    return res.json({
      status: 200,
      data: effective,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to fetch app configs",
      message: error.message,
    });
  }
};

exports.getPublicAppConfigs = async (_req, res) => {
  try {
    const records = await prisma.appConfig.findMany({
      where: { isPublic: true },
      orderBy: [{ category: "asc" }, { key: "asc" }],
    });

    const effective = buildEffectiveConfigList(records).filter((item) => item.isPublic);

    return res.json({
      status: 200,
      data: effective,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to fetch public app configs",
      message: error.message,
    });
  }
};

exports.getAppConfigByKey = async (req, res) => {
  try {
    const { key } = req.params;
    const record = await prisma.appConfig.findUnique({ where: { key } });
    const effective = buildEffectiveConfigList(record ? [record] : []).find((item) => item.key === key);

    if (!effective) {
      return res.status(404).json({
        status: 404,
        error: "App config not found",
      });
    }

    return res.json({
      status: 200,
      data: effective,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to fetch app config",
      message: error.message,
    });
  }
};

exports.upsertAppConfig = async (req, res) => {
  try {
    const { key } = req.params;
    const { value, category, label, description, isPublic } = req.body || {};

    if (value === undefined) {
      return res.status(400).json({
        status: 400,
        error: "Config value is required",
      });
    }

    const definition = getConfigDefinition(key);
    const existing = await prisma.appConfig.findUnique({
      where: { key },
    });
    const preparedValue = prepareConfigValue({
      key,
      value,
      existingValue: existing?.value,
    });
    const data = {
      category: category || existing?.category || definition?.category || "custom",
      label: label || existing?.label || definition?.label || key,
      description: description ?? existing?.description ?? definition?.description ?? null,
      isPublic:
        typeof isPublic === "boolean"
          ? isPublic
          : typeof existing?.isPublic === "boolean"
            ? existing.isPublic
            : definition?.isPublic || false,
      value: preparedValue,
      ...buildActorFields(req),
    };

    const saved = await prisma.appConfig.upsert({
      where: { key },
      update: data,
      create: {
        key,
        ...data,
      },
    });

    await logAction({
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
      loginActivityId: req.user?.loginActivityId,
      action: "UPSERTED APP CONFIG",
      table: "AppConfig",
      targetId: saved.id,
      metadata: {
        key: saved.key,
        category: saved.category,
      },
    });

    return res.json({
      status: 200,
      message: "App config saved successfully",
      data: saved,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      status,
      error: status === 500 ? "Failed to save app config" : error.message,
      message: error.message,
    });
  }
};
