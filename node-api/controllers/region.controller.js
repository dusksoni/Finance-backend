const prisma = require("../lib/prisma");

exports.createRegion = async (req, res) => {
  try {
    const { name, stateId, cityId } = req.body;
    const region = await prisma.region.create({
      data: {
        name,
        stateId,
        cityId,
      },
    });
    res.status(201).json({ message: "Region created", data: region });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllRegions = async (req, res) => {
  try {
    const regions = await prisma.region.findMany({
      include: {
        state: true,
        city: true,
        employees: true,
        userDetails: true
      },
    });
    res.json({ status: 200, data: regions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

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

exports.updateRegion = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, stateId, cityId } = req.body;

    const updated = await prisma.region.update({
      where: { id },
      data: { name, stateId, cityId },
    });
    res.json({ message: "Region updated", data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteRegion = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.region.delete({ where: { id } });
    res.json({ message: "Region deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
