const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");
const { buildFieldChanges } = require("../utils/activityDiff");

// CREATE
exports.createRegion = async (req, res) => {
  try {
    const { name, stateId, cityId } = req.body;

    // Check for duplicate region
    const existingRegion = await prisma.region.findFirst({
      where: {
        name: name,
        stateId: stateId,
        cityId: cityId,
      },
    });

    if (existingRegion) {
      return res.status(400).json({ error: "Region with the same name, state, and city already exists" });
    }

    const region = await prisma.region.create({
      data: {
        name: name,
        state: {
          connect: { id: stateId },
        },
        city: { connect: { id: cityId } },
      },
    });

    await logAction({
      action: "CREATED REGION",
      table: "Region",
      targetId: region.id,
      metadata: region,
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.status(201).json({ message: "Region created", data: region });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET ALL
exports.getAllRegions = async (req, res) => {
  try {
    const regions = await prisma.region.findMany({
      include: {
        state: true,
        city: true,
        employees: true,
        users: true,
        branches: true,
      },
    });
    res.json({ status: 200, data: regions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET BY ID
exports.getRegionById = async (req, res) => {
  try {
    const { id } = req.params;
    const region = await prisma.region.findUnique({
      where: { id },
      include: { state: true, city: true, users: true, employees: true },
    });
    if (!region) return res.status(404).json({ error: "Region not found" });
    res.json({ status: 200, data: region });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE
exports.updateRegion = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, stateId, cityId } = req.body;
    const existing = await prisma.region.findUnique({
      where: { id },
      select: { id: true, name: true, stateId: true, cityId: true },
    });
    if (!existing) return res.status(404).json({ error: "Region not found" });

    const updated = await prisma.region.update({
      where: { id },
      data: { name, stateId, cityId },
    });
    const changes = buildFieldChanges(existing, updated, {
      name: "Region name",
      stateId: "State",
      cityId: "City",
    });

    await logAction({
      action: "UPDATED REGION",
      table: "Region",
      targetId: id,
      metadata: {
        regionId: id,
        name: updated.name,
        stateId: updated.stateId,
        cityId: updated.cityId,
        changes,
        summary:
          changes.length === 1
            ? changes[0].message
            : changes.length > 1
            ? `Updated ${changes.length} region fields`
            : "Updated region details",
      },
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.json({ message: "Region updated", data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE
exports.deleteRegion = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await prisma.region.delete({ where: { id } });

    await logAction({
      action: "DELETED REGION",
      table: "Region",
      targetId: id,
      metadata: deleted,
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.json({ message: "Region deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
