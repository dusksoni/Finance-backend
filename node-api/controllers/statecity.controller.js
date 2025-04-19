const prisma = require("../lib/prisma");

// Create State
exports.createState = async (req, res) => {
  try {
    const { name } = req.body;
    const state = await prisma.state.create({ data: { name } });
    res.status(201).json({ message: "State created", data: state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get All States (with cities)
exports.getStates = async (req, res) => {
  try {
    const states = await prisma.state.findMany({ include: { city: true } });
    res.status(200).json(states);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get Single State by ID
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

// Update State
exports.updateState = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const state = await prisma.state.update({ where: { id }, data: { name } });
    res.json({ message: "State updated", data: state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete State
exports.deleteState = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.state.delete({ where: { id } });
    res.json({ message: "State deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Create City
exports.createCity = async (req, res) => {
  try {
    const { name, stateId } = req.body;
    const city = await prisma.city.create({
      data: { name, stateId }
    });
    res.status(201).json({ message: "City created", data: city });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get All Cities (with state)
exports.getCities = async (req, res) => {
  try {
    const cities = await prisma.city.findMany({ include: { state: true } });
    res.status(200).json(cities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get City by ID
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

// Update City
exports.updateCity = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, stateId } = req.body;
    const city = await prisma.city.update({
      where: { id },
      data: { name, stateId }
    });
    res.json({ message: "City updated", data: city });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete City
exports.deleteCity = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.city.delete({ where: { id } });
    res.json({ message: "City deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};