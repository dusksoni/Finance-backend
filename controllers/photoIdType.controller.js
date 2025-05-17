const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

// CREATE
exports.createPhotoIdType = async (req, res) => {
  try {
    const { name, description, minLength, maxLength, numberTypeEg, validation } = req.body;

    const newType = await prisma.photoIdType.create({
      data: {
        name,
        description,
        minLength,
        maxLength,
        numberTypeEg,
        validation,
      },
    });

    await logAction({
      action: "CREATED PHOTO ID TYPE",
      table: "PhotoIdType",
      targetId: newType.id,
      metadata: newType,
      loginActivityId: req.user.loginActivityId,
      admin: req.user?.adminId
        ? { connect: { id: req.user.adminId } }
        : undefined,
      employee: req.user?.employeeId
        ? { connect: { id: req.user.employeeId } }
        : undefined,
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
      data: {
        name,
        description,
        minLength,
        maxLength,
        numberTypeEg,
        validation,
      },
    });

    await logAction({
      action: "UPDATED PHOTO ID TYPE",
      table: "PhotoIdType",
      targetId: id,
      metadata: updated,
      loginActivityId: req.user.loginActivityId,
      admin: req.user?.adminId
        ? { connect: { id: req.user.adminId } }
        : undefined,
      employee: req.user?.employeeId
        ? { connect: { id: req.user.employeeId } }
        : undefined,
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

    const deleted = await prisma.photoIdType.delete({ where: { id } });

    await logAction({
      action: "DELETED PHOTO ID TYPE",
      table: "PhotoIdType",
      targetId: id,
      metadata: deleted,
      loginActivityId: req.user.loginActivityId,
      admin: req.user?.adminId
        ? { connect: { id: req.user.adminId } }
        : undefined,
      employee: req.user?.employeeId
        ? { connect: { id: req.user.employeeId } }
        : undefined,
    });

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
