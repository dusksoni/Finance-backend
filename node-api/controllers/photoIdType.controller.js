const prisma = require("../lib/prisma");

// CREATE
exports.createPhotoIdType = async (req, res) => {
  try {
    const { name, description, minLength, maxLength, numberTypeEg, validation } = req.body;
    const newType = await prisma.photoIdType.create({
      data: { name, description, minLength, maxLenght: maxLength, numberTypeEg, validation },
    });
    res.status(201).json({ status: 201, message: "Photo ID Type created", data: newType });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// READ ALL
exports.getAllPhotoIdTypes = async (req, res) => {
  try {
    const types = await prisma.photoIdType.findMany();
    res.json({ status: 200, data: types });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// READ BY ID
exports.getPhotoIdTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    const type = await prisma.photoIdType.findUnique({ where: { id } });
    if (!type) return res.status(404).json({ error: "Not found" });
    res.json(type);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE
exports.updatePhotoIdType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, minLength, maxLength, numberTypeEg, validation } = req.body;
    const updated = await prisma.photoIdType.update({
      where: { id },
      data: { name, description, minLength, maxLenght: maxLength, numberTypeEg, validation },
    });
    res.json({ message: "Updated successfully", data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE
exports.deletePhotoIdType = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.photoIdType.delete({ where: { id } });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
