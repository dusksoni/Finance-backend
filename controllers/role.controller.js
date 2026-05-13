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

// Return all available permission IDs and groups (used by frontend role editor)
exports.listAllPermissions = (req, res) => {
  const permissionGroups = [
    { name: "User Management", permissions: [
      { id: "USER_ALL_VIEW", label: "View All Users", type: "read" },
      { id: "USER_LOAN_VIEW", label: "View User Loans", type: "read" },
      { id: "USER_DEFAULTER_ALL_VIEW", label: "View All Defaulters", type: "read" },
      { id: "USER_CREATE", label: "Create User", type: "create" },
      { id: "USER_EDIT", label: "Edit User", type: "update" },
      { id: "USER_BLOCK", label: "Block User", type: "update" },
      { id: "USER_ACTIVITY_VIEW", label: "View User Activity", type: "read" },
    ]},
    { name: "Employee Management", permissions: [
      { id: "EMPLOYEE_ALL_VIEW", label: "View All Employees", type: "read" },
      { id: "EMPLOYEE_CREATE", label: "Create Employee", type: "create" },
      { id: "EMPLOYEE_EDIT", label: "Edit Employee", type: "update" },
      { id: "EMPLOYEE_EDIT_PASSWORD", label: "Edit Employee Password", type: "update" },
      { id: "EMPLOYEE_BLOCK", label: "Block Employee", type: "update" },
      { id: "EMPLOYEE_DELETE", label: "Delete Employee", type: "delete" },
      { id: "EMPLOYEE_ACTIVITY_VIEW", label: "View Employee Activity", type: "read" },
      { id: "EMPLOYEE_LOGIN_HISTORY_VIEW", label: "View Employee Login History", type: "read" },
    ]},
    { name: "Role Management", permissions: [
      { id: "ROLE_ALL_VIEW", label: "View All Roles", type: "read" },
      { id: "ROLE_CREATE", label: "Create Role", type: "create" },
      { id: "ROLE_EDIT", label: "Edit Role", type: "update" },
      { id: "ROLE_DELETE", label: "Delete Role", type: "delete" },
    ]},
    { name: "Loan Management", permissions: [
      { id: "LOAN_ALL_VIEW", label: "View All Loans", type: "read" },
      { id: "LOAN_CREATE", label: "Create Loan", type: "create" },
      { id: "LOAN_EDIT", label: "Edit Loan", type: "update" },
      { id: "LOAN_CLOSE", label: "Close Loan", type: "update" },
      { id: "LOAN_APPROVE", label: "Approve Loan", type: "update" },
    ]},
    { name: "Loan Type Management", permissions: [
      { id: "LOANTYPE_ALL_VIEW", label: "View All Loan Types", type: "read" },
      { id: "LOANTYPE_CREATE", label: "Create Loan Type", type: "create" },
      { id: "LOANTYPE_EDIT", label: "Edit Loan Type", type: "update" },
      { id: "LOANTYPE_DELETE", label: "Delete Loan Type", type: "delete" },
    ]},
    { name: "Payment Management", permissions: [
      { id: "PAYMENT_VIEW_BY_LOAN", label: "View Payment by Loan", type: "read" },
      { id: "PAYMENT_ALL_VIEW", label: "View All Payments", type: "read" },
      { id: "PAYMENT_CREATE", label: "Create Payment", type: "create" },
      { id: "PAYMENT_EDIT", label: "Edit Payment", type: "update" },
      { id: "PAYMENT_VERIFY", label: "Verify Payment", type: "update" },
      { id: "PAYMENT_DELETE", label: "Delete Payment", type: "delete" },
    ]},
    { name: "Seized Management", permissions: [
      { id: "SEIZED_VIEW_BY_LOAN", label: "View Seized by Loan", type: "read" },
      { id: "SEIZED_ALL_VIEW", label: "View All Seized", type: "read" },
      { id: "SEIZED_CREATE", label: "Create Seized", type: "create" },
      { id: "SEIZED_EDIT", label: "Edit Seized", type: "update" },
      { id: "SEIZED_COMPLETE", label: "Complete Seized", type: "update" },
      { id: "SEIZED_RELEASE", label: "Release Seized", type: "update" },
      { id: "SEIZED_CLOSE", label: "Close Seized", type: "update" },
    ]},
    { name: "Foreclosure Management", permissions: [
      { id: "FORECLOSE_VIEW", label: "View Foreclosure", type: "read" },
      { id: "FORECLOSE_CREATE", label: "Create Foreclosure", type: "create" },
      { id: "FORECLOSE_EDIT", label: "Edit Foreclosure", type: "update" },
      { id: "FORECLOSE_VERIFY", label: "Approve Foreclosure", type: "update" },
    ]},
    { name: "Location Management", permissions: [
      { id: "STATE_ALL_VIEW", label: "View All States", type: "read" },
      { id: "STATE_CREATE", label: "Create State", type: "create" },
      { id: "STATE_EDIT", label: "Edit State", type: "update" },
      { id: "STATE_DELETE", label: "Delete State", type: "delete" },
      { id: "CITY_ALL_VIEW", label: "View All Cities", type: "read" },
      { id: "CITY_CREATE", label: "Create City", type: "create" },
      { id: "CITY_EDIT", label: "Edit City", type: "update" },
      { id: "CITY_DELETE", label: "Delete City", type: "delete" },
      { id: "REGION_VIEW", label: "View Region", type: "read" },
      { id: "REGION_ALL_VIEW", label: "View All Regions", type: "read" },
      { id: "REGION_CREATE", label: "Create Region", type: "create" },
      { id: "REGION_EDIT", label: "Edit Region", type: "update" },
      { id: "REGION_DELETE", label: "Delete Region", type: "delete" },
    ]},
    { name: "Master Data", permissions: [
      { id: "MASTER_BRANCH_ALL_VIEW", label: "View Branch Master", type: "read" },
      { id: "MASTER_BRANCH_CREATE", label: "Create Branch", type: "create" },
      { id: "MASTER_BRANCH_EDIT", label: "Edit Branch", type: "update" },
      { id: "MASTER_BRANCH_DELETE", label: "Delete Branch", type: "delete" },
      { id: "MASTER_SHOWROOM_ALL_VIEW", label: "View Showroom Master", type: "read" },
      { id: "MASTER_SHOWROOM_CREATE", label: "Create Showroom", type: "create" },
      { id: "MASTER_SHOWROOM_EDIT", label: "Edit Showroom", type: "update" },
      { id: "MASTER_SHOWROOM_DELETE", label: "Delete Showroom", type: "delete" },
      { id: "MASTER_VEHICLE_ALL_VIEW", label: "View Vehicle Master", type: "read" },
      { id: "MASTER_VEHICLE_CREATE", label: "Create Vehicle", type: "create" },
      { id: "MASTER_VEHICLE_EDIT", label: "Edit Vehicle", type: "update" },
      { id: "MASTER_VEHICLE_DELETE", label: "Delete Vehicle", type: "delete" },
    ]},
    { name: "Termination Management", permissions: [
      { id: "TERMINATION_ALL_VIEW", label: "View All Terminations", type: "read" },
      { id: "TERMINATION_CREATE", label: "Create Termination", type: "create" },
      { id: "TERMINATION_EDIT", label: "Edit Termination", type: "update" },
    ]},
    { name: "Photo ID Management", permissions: [
      { id: "PHOTOID_ALL_VIEW", label: "View All Photo ID Types", type: "read" },
      { id: "PHOTOID_CREATE", label: "Create Photo ID Type", type: "create" },
      { id: "PHOTOID_EDIT", label: "Edit Photo ID Type", type: "update" },
      { id: "PHOTOID_DELETE", label: "Delete Photo ID Type", type: "delete" },
    ]},
  ];

  res.json({ data: permissionGroups });
};
