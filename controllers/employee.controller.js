const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const logAction = require("../utils/adminLogger");
const SECRET = process.env.SECRET_KEY;

// 🔍 Get employee by ID
exports.getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await prisma.employee.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        isBlocked: true,
        region: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
            permissions: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!employee) {
      return res.status(404).json({ status: 404, error: "Employee not found" });
    }

    res.json({ status: 200, data: employee });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 500, error: "Failed to fetch employee" });
  }
};

// CREATE EMPLOYEE
exports.createEmployee = async (req, res) => {
  try {
    const { name, email, password, roleId, regionId, branchId } = req.body;

    const existingEmployee = await prisma.employee.findUnique({
      where: { email, isDeleted: false },
    });
    if (existingEmployee)
      return res
        .status(400)
        .json({
          error: "Employee already exists with this email or phone number",
          status: 400,
        });
    if (!roleId)
      return res
        .status(400)
        .json({ error: "Role ID is required", status: 400 });

    const region = regionId
      ? await prisma.region.findUnique({
          where: { id: regionId, isDeleted: false },
        })
      : null;

    const hashedPassword = await bcrypt.hash(password, 10);

    const employee = await prisma.employee.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: { connect: { id: roleId } },
        region: regionId ? { connect: { id: regionId } } : undefined,
        city: region ? { connect: { id: region.cityId } } : null,
        state: region ? { connect: { id: region.stateId } } : null,
        branch: branchId ? { connect: { id: branchId } } : undefined,
        admin: { connect: { id: req.user.adminId } },
      },
      include: { role: true, region: true },
    });

    await logAction({
      adminId: req.user.adminId,
      loginActivityId: req.user.loginActivityId,
      action: "CREATED EMPLOYEE",
      table: "Employee",
      targetId: employee.id,
      metadata: employee,
    });

    res.status(201).json({ message: "Employee Created", data: employee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE EMPLOYEE
exports.putEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, roleId, regionId, firstName, lastName, email, phone , branchId } =
      req.body;

    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });

    const updateData = {
      name,
      role: { connect: { id: roleId } },
      region: regionId ? { connect: { id: regionId } } : undefined,
      firstName,
      lastName,
      email,
      phone,
      branch: branchId ? { connect: { id: branchId } } : undefined,
    };

    const updated = await prisma.employee.update({
      where: { id },
      data: updateData,
      include: { role: true, region: true, branch: true },
    });

    await logAction({
      adminId: req.user.adminId,
      loginActivityId: req.user.loginActivityId,
      action: "UPDATED EMPLOYEE",
      table: "Employee",
      targetId: id,
      metadata: updateData,
    });

    res.status(200).json({ message: "Employee updated", data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// update password
exports.updatePassword = async (req, res) => {
  try {
    const { password } = req.body;

    // Check if employee exists
    const employee = await prisma.employee.findUnique({
      where: { 
        id: req.params.id,
        isDeleted: false
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update password
    await prisma.employee.update({
      where: { id: req.params.id },
      data: { password: hashedPassword },
    });

    // Log the action
    await prisma.actionLog.create({
      data: {
        adminId: req.user.id, // The admin who performed this action
        action: 'UPDATE_PASSWORD',
        targetId: employee.id,
        table: 'Employee',
        metadata: { employeeId: employee.id }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update password',
      error: error.message,
    });
  }
};

// DELETE EMPLOYEE (soft delete)
exports.deleteEmployee = async (req, res) => {
  const { id } = req.params;
  try {
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee || employee.isDeleted)
      return res.status(404).json({ error: "Not found", status: 404 });

    await prisma.employee.update({
      where: { id },
      data: { isDeleted: true },
    });

    await logAction({
      adminId: req.user.adminId,
      loginActivityId: req.user.loginActivityId,
      action: "DELETED EMPLOYEE",
      table: "Employee",
      targetId: id,
      metadata: { name: employee.name, email: employee.email },
    });

    res.status(200).json({ message: "Employee deleted successfully", status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500});
  }
};

// BLOCK/UNBLOCK EMPLOYEE
exports.blockedEmployee = async (req, res) => {
  const { id } = req.params;
  const { isBlocked } = req.body;
  try {
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee || employee.isDeleted)
      return res.status(404).json({ error: "Not found", status: 404 });

    const updated = await prisma.employee.update({
      where: { id },
      data: { isBlocked },
    });

    await logAction({
      adminId: req.user.adminId,
      loginActivityId: req.user.loginActivityId,
      action: isBlocked ? "BLOCKED EMPLOYEE" : "UNBLOCKED EMPLOYEE",
      table: "Employee",
      targetId: id,
      metadata: { name: employee.name },
    });

    res.json({
      message: `Employee ${isBlocked ? "blocked" : "unblocked"} successfully`,
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

// LOGIN
exports.employeeLogin = async (req, res) => {
  const { email, password, deviceName, deviceType, latitude, longitude } =
    req.body;
  try {
    const employee = await prisma.employee.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        isBlocked: true,
        region: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
            permissions: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!employee || !(await bcrypt.compare(password, employee.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (employee.isBlocked)
      return res.status(400).json({ error: "Account is blocked" });

    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    const loginActivity = await prisma.loginActivity.create({
      data: {
        employeeId: employee.id,
        role: "EMPLOYEE",
        deviceName,
        deviceType,
        latitude: latitude === "" ? null : parseFloat(latitude),
        longitude: longitude === "" ? null : parseFloat(longitude),
        ipAddress: ip,
      },
    });

    const token = jwt.sign(
      {
        employeeId: employee.id,
        type: "EMPLOYEE",
        loginActivityId: loginActivity.id,
      },
      SECRET,
      { expiresIn: "7d" }
    );

    delete employee.password; // Remove password from the response
    delete employee.isBlocked; // Remove isBlocked from the response

    res.json({ status: 200, data: { token, employee: employee } });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Internal server error", error: error, status: 500 });
  }
};

// Get login history for an employee
exports.getActivityLogs = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Check if employee exists
    const employee = await prisma.employee.findUnique({
      where: { 
        id: req.user.employeeId,
        isDeleted: false
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Get activity logs
    const logs = await prisma.actionLog.findMany({
      where: { employeeId: req.params.id },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit),
    });

    // Get total count
    const total = await prisma.actionLog.count({
      where: { employeeId: req.params.id },
    });

    res.status(200).json({
      success: true,
      count: logs.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: logs,
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get activity logs',
      error: error.message,
    });
  }
};

// Get login history
exports.getLoginHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Check if employee exists
    const employee = await prisma.employee.findUnique({
      where: { 
        id: req.user.employeeId,
        isDeleted: false
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Get login history
    const loginHistory = await prisma.loginActivity.findMany({
      where: { employeeId: req.params.id },
      orderBy: { loggedInAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit),
    });

    // Get total count
    const total = await prisma.loginActivity.count({
      where: { employeeId: req.params.id },
    });

    res.status(200).json({
      success: true,
      count: loginHistory.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: loginHistory,
    });
  } catch (error) {
    console.error('Get login history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get login history',
      error: error.message,
    });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Check if employee exists
    const employee = await prisma.employee.findUnique({
      where: { 
        id: req.user.employeeId,
        isDeleted: false
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Get users
    const users = await prisma.user.findMany({
      where: { 
        employeeId: req.params.id,
        isBlocked: false
      },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        createdAt: true,
        loans: {
          select: {
            id: true,
            fileStatus: true
          }
        }
      }
    });

    // Get total count
    const total = await prisma.user.count({
      where: { 
        employeeId: req.params.id,
        isBlocked: false
      },
    });

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: users,
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users',
      error: error.message,
    });
  }
};

/**
 * Get employee's loans
 * @route GET /api/employees/:id/loans
 * @access Private/Admin
 */
exports.getLoans = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    // Check if employee exists
    const employee = await prisma.employee.findUnique({
      where: { 
        id: req.user.employeeId,
        isDeleted: false
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    const filters = { employeeId: req.params.id };
    
    // Add status filter if provided
    if (status) {
      filters.fileStatus = status;
    }

    // Get loans
    const loans = await prisma.loan.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit),
      select: {
        id: true,
        fileNo: true,
        principalLoanAmount: true,
        fileStatus: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        },
        loanType: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Get total count
    const total = await prisma.loan.count({
      where: filters,
    });

    res.status(200).json({
      success: true,
      count: loans.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: loans,
    });
  } catch (error) {
    console.error('Get loans error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get loans',
      error: error.message,
    });
  }
};