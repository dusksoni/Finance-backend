const prisma = require("../lib/prisma");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");
const logAction = require("../utils/adminLogger");
const { buildFieldChanges } = require("../utils/activityDiff");

// List all roles
exports.listRoles = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" }},
        ],
      }
    : {};

  const [roles, total] = await Promise.all([
    prisma.role.findMany({
      where,
      skip,
      take: limit,
    }),
    prisma.role.count({ where }),
  ]);

  res.json({
    status: 200,
    data: roles,
    total,
    page,
    limit,
  });
};


// Get one role by ID
exports.getRoleById = async (req, res) => {
  const role = await prisma.role.findUnique({ where: { id: req.params.id } });
  if (!role) return res.status(404).json({ error: "Role not found" });
  res.json(role);
};

// Create a new role
exports.createRole = async (req, res) => {
  const { name, description, permissions } = req.body;
  try {
    const existingRole = await prisma.role.findUnique({
      where: { name },
    });

    if (existingRole) {
      return res.status(400).json({ error: "Role already in use" });
    }

    const hasPermission = await checkVerifyPermission(req.user, "ROLE_CREATE");
    if (!hasPermission) {
      return res.status(403).json({ error: "Permission denied", status: 403 });
    }

    const newRole = await prisma.role.create({
      data: { name, description, permissions },
    });

    await logAction({
      adminId: req.user.adminId,
      employeeId: req.user.employeeId,
      loginActivityId: req.user.activity,
      action: "CREATED ROLE",
      table: "Role",
      targetId: newRole.id,
      metadata: newRole,
    });

    res.status(201).json({ message: "Employee Created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update a role
exports.updateRole = async (req, res) => {
  const { name, description, permissions } = req.body;
  const roleId = req.params.id; // Ensure the ID is an integer
  
  try {
    const hasPermission = await checkVerifyPermission(req.user, "ROLE_UPDATE");
    if (!hasPermission) {
      return res.status(403).json({ error: "Permission denied", status: 403 });
    }
    const existingRole = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, description: true, permissions: true },
    });
    if (!existingRole) {
      return res.status(404).json({ error: "Role not found" });
    }

    const updatedRole = await prisma.role.update({
      where: { id: roleId },
      data: { name, description, permissions },
    });
    const changes = buildFieldChanges(existingRole, updatedRole, {
      name: "Role name",
      description: "Description",
      permissions: "Permissions",
    });

    await logAction({
      adminId: req.user.adminId,
      employeeId: req.user.employeeId,
      loginActivityId: req.user.activity,
      action: "UPDATED ROLE",
      table: "Role",
      targetId: updatedRole.id,
      metadata: {
        roleId: updatedRole.id,
        roleName: updatedRole.name,
        changes,
        summary:
          changes.length === 1
            ? changes[0].message
            : changes.length > 1
            ? `Updated ${changes.length} role fields`
            : "Updated role details",
      },
    });
    res.status(200).json({ message: "Role Updated", data: updatedRole });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete a role
exports.deleteRole = async (req, res) => {
  try {
    const hasPermission = await checkVerifyPermission(req.user, "ROLE_DELETE");
    if (!hasPermission) {
      return res.status(403).json({ error: "Permission denied", status: 403 });
    }
    const deleted = await prisma.role.delete({ where: { id: req.params.id } });

    await logAction({
      adminId: req.user.adminId,
      employeeId: req.user.employeeId,
      loginActivityId: req.user.activity,
      action: "DELETED ROLE",
      table: "Role",
      targetId: deleted.id,
      metadata: { name: deleted.name },
    });

    res.status(200).json({ message: "Role deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
