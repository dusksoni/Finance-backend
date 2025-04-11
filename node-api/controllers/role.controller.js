const prisma = require("../lib/prisma");

// List all roles
exports.listRoles = async (req, res) => {
  const roles = await prisma.role.findMany();
  res.json({data:roles, status: 200});
};

// Get one role by ID
exports.getRoleById = async (req, res) => {
  const role = await prisma.role.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!role) return res.status(404).json({ error: "Role not found" });
  res.json(role);
};

// Create a new role
exports.createRole = async (req, res) => {
  const { name, description, permissions } = req.body;
  try {
    const newRole = await prisma.role.create({
      data: { name, description, permissions }
    });
    res.status(201).json(newRole);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update a role
exports.updateRole = async (req, res) => {
  const { name, description, permissions } = req.body;
  try {
    const updated = await prisma.role.update({
      where: { id: parseInt(req.params.id) },
      data: { name, description, permissions }
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete a role
exports.deleteRole = async (req, res) => {
  try {
    await prisma.role.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "Role deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
