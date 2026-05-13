const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

// Generate the next number for a given entity type
async function generateNext(entityType, tx = prisma) {
  const format = await tx.numberingFormat.findUnique({ where: { entityType } });
  if (!format) throw new Error(`No numbering format configured for ${entityType}`);

  // Reset sequence monthly if configured
  if (format.resetMonthly) {
    const now = new Date();
    const lastReset = format.lastResetAt ? new Date(format.lastResetAt) : null;
    if (!lastReset || lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
      await tx.numberingFormat.update({
        where: { entityType },
        data: { currentSeq: 0, lastResetAt: now },
      });
      format.currentSeq = 0;
    }
  }

  const nextSeq = format.currentSeq + 1;
  await tx.numberingFormat.update({ where: { entityType }, data: { currentSeq: nextSeq } });

  const padded = String(nextSeq).padStart(format.padLength, "0");
  const parts = [format.prefix, padded, format.suffix].filter(Boolean);
  return parts.join(format.separator);
}

exports.generateNumber = async (req, res) => {
  try {
    const { entityType } = req.params;
    const number = await generateNext(entityType);
    res.json({ data: { entityType, number } });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate number", message: err.message });
  }
};

exports.listFormats = async (req, res) => {
  try {
    const formats = await prisma.numberingFormat.findMany({ orderBy: { entityType: "asc" } });
    res.json({ data: formats });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch numbering formats" });
  }
};

exports.upsertFormat = async (req, res) => {
  try {
    const { entityType, prefix, suffix, separator, padLength, resetMonthly } = req.body;
    if (!entityType) return res.status(400).json({ error: "entityType is required" });

    const existing = await prisma.numberingFormat.findUnique({ where: { entityType } });

    const data = {
      prefix: prefix ?? null,
      suffix: suffix ?? null,
      separator: separator ?? "-",
      padLength: padLength ?? 6,
      resetMonthly: resetMonthly ?? false,
      updatedByAdminId: req.user.adminId,
    };

    // Build example string
    const padded = "1".padStart(data.padLength, "0");
    const parts = [data.prefix, padded, data.suffix].filter(Boolean);
    data.example = parts.join(data.separator);

    let format;
    if (existing) {
      format = await prisma.numberingFormat.update({ where: { entityType }, data });
    } else {
      format = await prisma.numberingFormat.create({ data: { entityType, ...data } });
    }

    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: `NUMBERING_FORMAT_UPSERTED: ${entityType}`, table: "NumberingFormat", targetId: format.id });
    res.json({ message: "Format saved", data: format });
  } catch (err) {
    res.status(500).json({ error: "Failed to save numbering format", message: err.message });
  }
};

exports.resetSequence = async (req, res) => {
  try {
    const { entityType } = req.params;
    const format = await prisma.numberingFormat.update({
      where: { entityType },
      data: { currentSeq: 0, lastResetAt: new Date() },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: `NUMBERING_SEQUENCE_RESET: ${entityType}`, table: "NumberingFormat", targetId: format.id });
    res.json({ message: "Sequence reset to 0", data: format });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset sequence", message: err.message });
  }
};

module.exports.generateNext = generateNext;
