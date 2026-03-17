const prisma = require("../lib/prisma");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");
const logAction = require("../utils/adminLogger");
const { buildFieldChanges } = require("../utils/activityDiff");

// CREATE
exports.createPhotoIdType = async (req, res) => {
  try {
    const {
      name,
      description,
      minLength,
      maxLength,
      numberTypeEg,
      validation,
    } = req.body;

    const permissions = await checkVerifyPermission(req.user, "PHOTOID_CREATE");

    if (!permissions) {
      return res.status(403).json({ error: "Access denied", status: 403 });
    }

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
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res
      .status(201)
      .json({ status: 201, message: "Photo ID Type created", data: newType });
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
    res.status(200).json({ data: type, status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE
exports.updatePhotoIdType = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      minLength,
      maxLength,
      numberTypeEg,
      validation,
    } = req.body;

    const permissions = await checkVerifyPermission(req.user, "PHOTOID_EDIT");

    if (!permissions) {
      return res.status(403).json({ error: "Access denied", status: 403 });
    }
    const existing = await prisma.photoIdType.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        minLength: true,
        maxLength: true,
        numberTypeEg: true,
        validation: true,
      },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

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
    const changes = buildFieldChanges(existing, updated, {
      name: "Name",
      description: "Description",
      minLength: "Minimum length",
      maxLength: "Maximum length",
      numberTypeEg: "Example number",
      validation: "Validation regex",
    });
    await logAction({
      action: "UPDATED PHOTO ID TYPE",
      table: "PhotoIdType",
      targetId: id,
      metadata: {
        photoIdTypeId: id,
        name: updated.name,
        changes,
        summary:
          changes.length === 1
            ? changes[0].message
            : changes.length > 1
            ? `Updated ${changes.length} photo ID type fields`
            : "Updated photo ID type details",
      },
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
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

    const permissions = await checkVerifyPermission(req.user, "PHOTOID_DELETE");

    if (!permissions) {
      return res.status(403).json({ error: "Access denied", status: 403 });
    }

    const deleted = await prisma.photoIdType.delete({ where: { id } });

    await logAction({
      action: "DELETED PHOTO ID TYPE",
      table: "PhotoIdType",
      targetId: id,
      metadata: deleted,
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
