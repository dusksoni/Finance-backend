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
exports.listAllPermissions = async (req, res) => {
  try {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ group: "asc" }, { name: "asc" }],
    });

    const groupMap = {};
    for (const p of permissions) {
      if (!groupMap[p.group]) groupMap[p.group] = [];
      groupMap[p.group].push({ id: p.name, label: p.label, type: p.type });
    }

    const permissionGroups = Object.entries(groupMap).map(([name, perms]) => ({
      name,
      permissions: perms,
    }));

    return res.json({ data: permissionGroups });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Legacy in-code fallback (unused, kept for reference)
exports._listAllPermissionsStatic = (req, res) => {
  const permissionGroups = [
    { name: "User Management", permissions: [
      { id: "USER_ALL_VIEW", label: "View All Users", type: "read" },
      { id: "USER_LOAN_VIEW", label: "View User Loans", type: "read" },
      { id: "USER_DEFAULTER_ALL_VIEW", label: "View All Defaulters", type: "read" },
      { id: "USER_ACTIVITY_VIEW", label: "View User Activity", type: "read" },
      { id: "USER_CREATE", label: "Create User", type: "create" },
      { id: "USER_EDIT", label: "Edit User", type: "update" },
      { id: "USER_BLOCK", label: "Block/Unblock User", type: "update" },
    ]},
    { name: "Employee Management", permissions: [
      { id: "EMPLOYEE_ALL_VIEW", label: "View All Employees", type: "read" },
      { id: "EMPLOYEE_ACTIVITY_VIEW", label: "View Employee Activity", type: "read" },
      { id: "EMPLOYEE_LOGIN_HISTORY_VIEW", label: "View Employee Login History", type: "read" },
      { id: "EMPLOYEE_CREATE", label: "Create Employee", type: "create" },
      { id: "EMPLOYEE_EDIT", label: "Edit Employee", type: "update" },
      { id: "EMPLOYEE_EDIT_PASSWORD", label: "Edit Employee Password", type: "update" },
      { id: "EMPLOYEE_BLOCK", label: "Block Employee", type: "update" },
      { id: "EMPLOYEE_DELETE", label: "Delete Employee", type: "delete" },
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
      { id: "PAYMENT_ALL_VIEW", label: "View All Payments", type: "read" },
      { id: "PAYMENT_VIEW_BY_LOAN", label: "View Payments by Loan", type: "read" },
      { id: "PAYMENT_CREATE", label: "Create Payment", type: "create" },
      { id: "PAYMENT_EDIT", label: "Edit Payment", type: "update" },
      { id: "PAYMENT_VERIFY", label: "Verify Payment", type: "update" },
      { id: "PAYMENT_DELETE", label: "Delete Payment", type: "delete" },
    ]},
    { name: "Cease/Seized Management", permissions: [
      { id: "SEIZED_ALL_VIEW", label: "View All Seized", type: "read" },
      { id: "SEIZED_VIEW", label: "View Seized", type: "read" },
      { id: "SEIZED_VIEW_BY_LOAN", label: "View Seized by Loan", type: "read" },
      { id: "SEIZED_CREATE", label: "Create Seized", type: "create" },
      { id: "SEIZED_EDIT", label: "Edit Seized", type: "update" },
      { id: "SEIZED_COMPLETE", label: "Complete Seized", type: "update" },
      { id: "SEIZED_RELEASE", label: "Release Seized", type: "update" },
      { id: "SEIZED_CLOSE", label: "Close Seized", type: "update" },
      { id: "SEIZED_CONTACT_ADD", label: "Add Seized Contact Attempt", type: "create" },
      { id: "SEIZED_DELETE", label: "Delete Seized", type: "delete" },
    ]},
    { name: "Foreclosure Management", permissions: [
      { id: "FORECLOSE_VIEW", label: "View Foreclosure", type: "read" },
      { id: "FORECLOSE_CREATE", label: "Create Foreclosure", type: "create" },
      { id: "FORECLOSE_EDIT", label: "Edit Foreclosure", type: "update" },
      { id: "FORECLOSE_VERIFY", label: "Approve Foreclosure Requests", type: "update" },
    ]},
    { name: "KYC Management", permissions: [
      { id: "KYC_VIEW", label: "View KYC Records", type: "read" },
      { id: "KYC_LIST_VIEW", label: "View KYC List", type: "read" },
      { id: "KYC_APPROVE", label: "Approve KYC", type: "update" },
      { id: "KYC_REJECT", label: "Reject KYC", type: "update" },
      { id: "KYC_DOCUMENT_VERIFY", label: "Verify KYC Document", type: "update" },
    ]},
    { name: "Collection Management", permissions: [
      { id: "COLLECTION_MANAGE", label: "Manage Collections", type: "update" },
      { id: "COLLECTION_VIEW", label: "View Collections", type: "read" },
      { id: "COLLECTION_ASSIGN", label: "Assign Collection Cases", type: "update" },
    ]},
    { name: "Grievance Management", permissions: [
      { id: "GRIEVANCE_MANAGE", label: "Manage Grievances", type: "update" },
      { id: "GRIEVANCE_VIEW", label: "View Grievances", type: "read" },
      { id: "GRIEVANCE_CREATE", label: "Create Grievance", type: "create" },
      { id: "GRIEVANCE_ASSIGN", label: "Assign Grievance", type: "update" },
    ]},
    { name: "Dashboard", permissions: [
      { id: "DASHBOARD_VIEW_ALL", label: "View Full Dashboard", type: "read" },
      { id: "DASHBOARD_ORG_VIEW", label: "View Org Dashboard", type: "read" },
      { id: "DASHBOARD_BRANCH_VIEW", label: "View Branch Dashboard", type: "read" },
    ]},
    { name: "Legal Actions", permissions: [
      { id: "LEGAL_ACTION_VIEW", label: "View Legal Actions", type: "read" },
      { id: "LEGAL_ACTION_CREATE", label: "Create Legal Action", type: "create" },
      { id: "LEGAL_ACTION_EDIT", label: "Edit Legal Action", type: "update" },
    ]},
    { name: "NACH / Mandate", permissions: [
      { id: "NACH_VIEW", label: "View NACH Mandates", type: "read" },
      { id: "NACH_CREATE", label: "Create NACH Mandate", type: "create" },
      { id: "NACH_EDIT", label: "Edit NACH Mandate", type: "update" },
      { id: "NACH_CANCEL", label: "Cancel NACH Mandate", type: "update" },
    ]},
    { name: "Collateral Management", permissions: [
      { id: "COLLATERAL_VIEW", label: "View Collateral", type: "read" },
      { id: "COLLATERAL_CREATE", label: "Create Collateral", type: "create" },
      { id: "COLLATERAL_EDIT", label: "Edit Collateral", type: "update" },
      { id: "COLLATERAL_VALUATE", label: "Add Collateral Valuation", type: "create" },
    ]},
    { name: "Restructuring", permissions: [
      { id: "RESTRUCTURING_VIEW", label: "View Restructuring", type: "read" },
      { id: "RESTRUCTURING_CREATE", label: "Create Restructuring", type: "create" },
      { id: "RESTRUCTURING_APPLY", label: "Apply Restructuring", type: "update" },
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
      { id: "REGION_ALL_VIEW", label: "View All Regions", type: "read" },
      { id: "REGION_VIEW", label: "View Region", type: "read" },
      { id: "REGION_CREATE", label: "Create Region", type: "create" },
      { id: "REGION_EDIT", label: "Edit Region", type: "update" },
      { id: "REGION_DELETE", label: "Delete Region", type: "delete" },
    ]},
    { name: "Master Data Management", permissions: [
      { id: "MASTER_BRANCH_ALL_VIEW", label: "View Branch Master", type: "read" },
      { id: "MASTER_BRANCH_CREATE", label: "Create Branch", type: "create" },
      { id: "MASTER_BRANCH_EDIT", label: "Edit Branch", type: "update" },
      { id: "MASTER_BRANCH_DELETE", label: "Delete Branch", type: "delete" },
      { id: "MASTER_SHOWROOM_ALL_VIEW", label: "View Showroom Master", type: "read" },
      { id: "MASTER_SHOWROOM_CREATE", label: "Create Showroom", type: "create" },
      { id: "MASTER_SHOWROOM_EDIT", label: "Edit Showroom", type: "update" },
      { id: "MASTER_SHOWROOM_DELETE", label: "Delete Showroom", type: "delete" },
      { id: "MASTER_VEHICLE_ALL_VIEW", label: "View Vehicle Master", type: "read" },
      { id: "MASTER_VEHICLE_CREATE", label: "Create Vehicle Brand/Model", type: "create" },
      { id: "MASTER_VEHICLE_EDIT", label: "Edit Vehicle Brand/Model", type: "update" },
      { id: "MASTER_VEHICLE_DELETE", label: "Delete Vehicle Brand/Model", type: "delete" },
      { id: "MASTER_AGRICULTURE_ALL_VIEW", label: "View Agriculture Master", type: "read" },
      { id: "MASTER_AGRICULTURE_CREATE", label: "Create Equipment", type: "create" },
      { id: "MASTER_AGRICULTURE_EDIT", label: "Edit Equipment", type: "update" },
      { id: "MASTER_AGRICULTURE_DELETE", label: "Delete Equipment", type: "delete" },
    ]},
    { name: "Termination Management", permissions: [
      { id: "TERMINATION_ALL_VIEW", label: "View All Terminations", type: "read" },
      { id: "TERMINATION_CREATE", label: "Create Termination", type: "create" },
      { id: "TERMINATION_EDIT", label: "Edit Termination", type: "update" },
    ]},
    { name: "Photo ID Type Management", permissions: [
      { id: "PHOTOID_ALL_VIEW", label: "View All Photo ID Types", type: "read" },
      { id: "PHOTOID_CREATE", label: "Create Photo ID Type", type: "create" },
      { id: "PHOTOID_EDIT", label: "Edit Photo ID Type", type: "update" },
      { id: "PHOTOID_DELETE", label: "Delete Photo ID Type", type: "delete" },
    ]},
    { name: "Reports & Audit", permissions: [
      { id: "REPORT_VIEW", label: "View Reports", type: "read" },
      { id: "REPORT_DOWNLOAD", label: "Download Reports", type: "read" },
      { id: "AUDIT_VIEW", label: "View Audit Logs", type: "read" },
      { id: "NPA_REPORT_VIEW", label: "View NPA Reports", type: "read" },
    ]},
    { name: "App Configuration", permissions: [
      { id: "ADMIN_CONFIG", label: "Manage App Configuration", type: "update" },
    ]},
  ];

  res.json({ data: permissionGroups });
};
