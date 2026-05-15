const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");
const { buildFieldChanges } = require("../utils/activityDiff");

// ---------------- State ----------------

exports.createState = async (req, res) => {
  try {
    const { name } = req.body;
    const state = await prisma.state.create({ data: { name } });

    await logAction({
      action: "CREATED STATE",
      table: "State",
      targetId: state.id,
      metadata: state,
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.status(201).json({ message: "State created", data: state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateState = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const existing = await prisma.state.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) return res.status(404).json({ error: "State not found" });

    const state = await prisma.state.update({ where: { id }, data: { name } });
    const changes = buildFieldChanges(existing, state, {
      name: "State name",
    });

    await logAction({
      action: "UPDATED STATE",
      table: "State",
      targetId: id,
      metadata: {
        stateId: id,
        name: state.name,
        changes,
        summary:
          changes.length === 1
            ? changes[0].message
            : changes.length > 1
            ? `Updated ${changes.length} state fields`
            : "Updated state details",
      },
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.json({ message: "State updated", data: state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteState = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await prisma.state.delete({ where: { id } });

    await logAction({
      action: "DELETED STATE",
      table: "State",
      targetId: id,
      metadata: deleted,
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.json({ message: "State deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStates = async (req, res) => {
  try {
    const states = await prisma.state.findMany({ include: { city: true } });
    res.status(200).json(states);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStateById = async (req, res) => {
  try {
    const { id } = req.params;
    const state = await prisma.state.findUnique({ where: { id }, include: { city: true } });
    if (!state) return res.status(404).json({ error: "State not found" });
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ---------------- City ----------------

exports.createCity = async (req, res) => {
  try {
    const { name, stateId } = req.body;
    const city = await prisma.city.create({ data: { name, stateId } });

    await logAction({
      action: "CREATED CITY",
      table: "City",
      targetId: city.id,
      metadata: city,
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.status(201).json({ message: "City created", data: city });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateCity = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, stateId } = req.body;
    const existing = await prisma.city.findUnique({
      where: { id },
      select: { id: true, name: true, stateId: true },
    });
    if (!existing) return res.status(404).json({ error: "City not found" });

    const city = await prisma.city.update({
      where: { id },
      data: { name, stateId },
    });
    const changes = buildFieldChanges(existing, city, {
      name: "City name",
      stateId: "State",
    });

    await logAction({
      action: "UPDATED CITY",
      table: "City",
      targetId: id,
      metadata: {
        cityId: id,
        name: city.name,
        stateId: city.stateId,
        changes,
        summary:
          changes.length === 1
            ? changes[0].message
            : changes.length > 1
            ? `Updated ${changes.length} city fields`
            : "Updated city details",
      },
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.json({ message: "City updated", data: city });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteCity = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await prisma.city.delete({ where: { id } });

    await logAction({
      action: "DELETED CITY",
      table: "City",
      targetId: id,
      metadata: deleted,
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.json({ message: "City deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCities = async (req, res) => {
  try {
    const { stateId } = req.query;
    const where = stateId ? { stateId } : {};
    const cities = await prisma.city.findMany({ where, include: { state: true }, orderBy: { name: "asc" } });
    res.status(200).json(cities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCityById = async (req, res) => {
  try {
    const { id } = req.params;
    const city = await prisma.city.findUnique({ where: { id }, include: { state: true } });
    if (!city) return res.status(404).json({ error: "City not found" });
    res.json(city);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
