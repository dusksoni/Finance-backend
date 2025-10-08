const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const logAction = require("../utils/adminLogger");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");
const SECRET = process.env.SECRET_KEY;

const selectEmployeeProfile = {
  id: true,
  name: true,
  email: true,
  isBlocked: true,
  createdAt: true,
  updatedAt: true,
  role: {
    select: {
      id: true,
      name: true,
    },
  },
  region: {
    select: {
      id: true,
      name: true,
    },
  },
};

const resolveEmployeeId = (req) => {
  if (req?.user?.type === "EMPLOYEE" && req.user?.employeeId) {
    return req.user.employeeId;
  }
  if (req.params?.id) return req.params.id;
  if (req.body?.id) return req.body.id;
  return null;
};

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
        photoUrl: true,
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

exports.getSelfProfile = async (req, res) => {
  try {
    const employeeId = resolveEmployeeId(req);
    if (!employeeId) {
      return res.status(400).json({
        status: 400,
        message: "Unable to resolve employee id",
      });
    }

    const employee = await prisma.employee.findUnique({
      where: {
        id: employeeId,
        isDeleted: false,
      },
      select: selectEmployeeProfile,
    });

    if (!employee) {
      return res
        .status(404)
        .json({ status: 404, message: "Employee not found" });
    }

    res.json({ status: 200, data: employee });
  } catch (error) {
    console.error("Employee self profile error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch employee profile",
      error: error.message,
    });
  }
};

exports.updateSelfProfile = async (req, res) => {
  try {
    const employeeId = resolveEmployeeId(req);
    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Unable to resolve employee id",
      });
    }

    const { name, email } = req.body;

    const employee = await prisma.employee.findUnique({
      where: {
        id: employeeId,
        isDeleted: false,
      },
    });

    if (!employee) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    if (email && email !== employee.email) {
      const existingEmployee = await prisma.employee.findFirst({
        where: {
          email,
          NOT: { id: employeeId },
          isDeleted: false,
        },
      });

      if (existingEmployee) {
        return res.status(400).json({
          success: false,
          message: "Email is already in use",
        });
      }
    }

    const updated = await prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
      },
      select: selectEmployeeProfile,
    });

    await logAction({
      employeeId,
      loginActivityId: req.user?.loginActivityId,
      action: "UPDATED_SELF_PROFILE",
      table: "Employee",
      targetId: employeeId,
      metadata: {
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
      },
    });

    res.json({ status: 200, message: "Profile updated", data: updated });
  } catch (error) {
    console.error("Update self profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};

exports.updateSelfPassword = async (req, res) => {
  try {
    const employeeId = resolveEmployeeId(req);
    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Unable to resolve employee id",
      });
    }

    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const employee = await prisma.employee.findUnique({
      where: {
        id: employeeId,
        isDeleted: false,
      },
    });

    if (!employee) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await prisma.employee.update({
      where: { id: employeeId },
      data: { password: hashedPassword },
    });

    await logAction({
      employeeId,
      loginActivityId: req.user?.loginActivityId,
      action: "UPDATED_SELF_PASSWORD",
      table: "Employee",
      targetId: employeeId,
    });

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Employee password update error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update password",
      error: error.message,
    });
  }
};

// CREATE EMPLOYEE
exports.createEmployee = async (req, res) => {
  try {
    const { name, email, password, roleId, regionId, branchId, photo } =
      req.body;

    const existingEmployee = await prisma.employee.findUnique({
      where: { email, isDeleted: false },
    });
    const hasPermission = checkVerifyPermission(req.user, "EMPLOYEE_CREATE");

    if (!hasPermission) {
      return res.status(403).json({ error: "Permission denied", status: 403 });
    }

    if (existingEmployee)
      return res.status(400).json({
        error: "Employee already exists with this email or phone number",
        status: 400,
      });
    if (!roleId)
      return res
        .status(400)
        .json({ error: "Role ID is required", status: 400 });

    const region = regionId
      ? await prisma.region.findUnique({
          where: { id: regionId },
        })
      : null;

    const hashedPassword = await bcrypt.hash(password, 10);
    const profilePhoto = photo ? await createFiles([photo]) : [];
    const data = {
      name,
      email,
      password: hashedPassword,
      ...(req.user.adminId
        ? { admin: { connect: { id: req.user.adminId } } }
        : {}),
      ...(regionId ? { region: { connect: { id: regionId } } } : {}),
      ...(roleId ? { role: { connect: { id: roleId } } } : {}),
      ...(branchId ? { branch: { connect: { id: branchId } } } : {}),
      ...(region ? { city: { connect: { id: region.cityId } } } : {}),
      ...(region ? { state: { connect: { id: region.stateId } } } : {}),
      ...(profilePhoto?.length
        ? { photoUrl: { connect: { id: profilePhoto[0].id } } }
        : {}),
    };

    // IMPORTANT: Do NOT spread req.body if it includes *_id or *_Id etc.
    // e.g. avoid: data: { ...req.body, ...data }
    const employee = await prisma.employee.create({ data });

    await logAction({
      adminId: req.user.adminId || null,
      employeeId: req.user?.employeeId || null,
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
    const {
      name,
      roleId,
      regionId,
      firstName,
      lastName,
      email,
      phone,
      branchId,
      photo,
    } = req.body;

    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    const hasPermission = checkVerifyPermission(req.user, "EMPLOYEE_EDIT");

    if (!hasPermission) {
      return res.status(403).json({ error: "Permission denied", status: 403 });
    }

    const updateData = {
      name,
      role: { connect: { id: roleId } },
      region: regionId ? { connect: { id: regionId } } : undefined,
      firstName,
      lastName,
      email,
      phone,
      branch: branchId ? { connect: { id: branchId } } : undefined,
      ...(photo?.secure_url
        ? {
            photoUrl: photo.secure_url,
            photoPublicId: photo.public_id,
            photoFormat: photo.format,
          }
        : {}),
    };

    const updated = await prisma.employee.update({
      where: { id },
      data: updateData,
      include: { role: true, region: true, branch: true },
    });

    await logAction({
      adminId: req.user.adminId,
      employeeId: req.user.employeeId,
      loginActivityId: req.user.loginActivityId,
      action: "UPDATED EMPLOYEE",
      table: "Employee",
      targetId: id,
      metadata: updated,
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
        isDeleted: false,
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }
    console.log(req.user);

    const hasPermission = await checkVerifyPermission(
      req.user,
      "EMPLOYEE_EDIT_PASSWORD"
    );

    if (!hasPermission) {
      return res
        .status(403)
        .json({ error: "Forbidden. Access denied.", status: 403 });
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
    await logAction({
      adminId: req.user.adminId, // The admin who performed this action
      employeeId: req.user.employeeId,
      loginActivityId: req.user.loginActivityId,
      action: "UPDATE_PASSWORD",
      targetId: employee.id,
      table: "Employee",
      metadata: { id: employee.id },
    });

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Update password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update password",
      error: error.message,
    });
  }
};

// DELETE EMPLOYEE (soft delete)
exports.deleteEmployee = async (req, res) => {
  const { id } = req.params;
  try {
    const hasPermission = checkVerifyPermission(req.user, "EMPLOYEE_DELETE");
    if (!hasPermission) {
      return res.status(403).json({ error: "Permission denied", status: 403 });
    }
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee || employee.isDeleted)
      return res.status(404).json({ error: "Not found", status: 404 });

    await prisma.employee.update({
      where: { id },
      data: { isDeleted: true },
    });

    await logAction({
      adminId: req.user.adminId,
      employeeId: req.user.employeeId,
      loginActivityId: req.user.loginActivityId,
      action: "DELETED EMPLOYEE",
      table: "Employee",
      targetId: id,
      metadata: { name: employee.name, email: employee.email },
    });

    res
      .status(200)
      .json({ message: "Employee deleted successfully", status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

// BLOCK/UNBLOCK EMPLOYEE
exports.blockedEmployee = async (req, res) => {
  const { id } = req.params;
  const { isBlocked } = req.body;
  try {
    const hasPermission = checkVerifyPermission(
      req.user,
      "EMPLOYEE_BLOCK"
    );
    if (!hasPermission) {
      return res.status(403).json({ error: "Permission denied", status: 403 });
    }
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee || employee.isDeleted)
      return res.status(404).json({ error: "Not found", status: 404 });

    const updated = await prisma.employee.update({
      where: { id },
      data: { isBlocked },
    });

    await logAction({
      adminId: req.user.adminId,
      employeeId: req.user.employeeId,
      loginActivityId: req.user.loginActivityId,
      action: isBlocked ? "BLOCKED EMPLOYEE" : "UNBLOCKED EMPLOYEE",
      table: "Employee",
      targetId: id,
      metadata: { name: employee.name },
    });

    res.status(200).json({
      message: `Employee ${isBlocked ? "blocked" : "unblocked"} successfully`,
      data: updated,
      status: 200,
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
      return res
        .status(401)
        .json({ error: "Invalid credentials", status: 401 });
    }

    if (employee.isBlocked)
      return res.status(400).json({ error: "Account is blocked", status: 400 });

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
exports.getActivityLogs = async (req, res) => {
  try {
    const { page = 1, limit = 10, logId, loginActivityId } = req.query;
    const parsedPage = Number(page);
    const parsedLimit = Number(limit);
    const pageNumber =
      Number.isFinite(parsedPage) && parsedPage > 0
        ? Math.floor(parsedPage)
        : 1;
    const limitNumber =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.floor(parsedLimit)
        : 10;

    const employeeId =
      req.params.id || req.query.employeeId || resolveEmployeeId(req);

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Unable to resolve employee id",
      });
    }

    const employee = await prisma.employee.findUnique({
      where: {
        id: employeeId,
        isDeleted: false,
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }
    if (req.user?.type === "EMPLOYEE") {
      const allowed = await checkVerifyPermission(
        req.user,
        "EMPLOYEE_ACTIVITY_VIEW",
        { throwError: false }
      );

      if (!allowed) {
        return res.status(200).json({ status: 200, message: "Access denied" });
      }
    }

    const where = {
      employeeId,
    };

    if (logId) {
      where.id = logId;
    }

    if (loginActivityId) {
      where.loginActivityId = loginActivityId;
    }

    const queryOptions = {
      where,
      orderBy: { createdAt: "desc" },
      include: { loginActivity: true, employee: true, admin: true },
    };

    if (logId) {
      queryOptions.skip = 0;
      queryOptions.take = 1;
    } else {
      queryOptions.skip = Math.max(0, (pageNumber - 1) * limitNumber);
      queryOptions.take = Math.max(1, limitNumber);
    }

    // Get activity logs
    const logs = await prisma.actionLog.findMany(queryOptions);

    // Get total count
    const total = await prisma.actionLog.count({
      where,
    });

    const totalPages = limitNumber ? Math.ceil(total / limitNumber) || 1 : 1;

    res.status(200).json({
      success: true,
      count: logs.length,
      total,
      totalPages,
      currentPage: pageNumber,
      data: logs,
    });
  } catch (error) {
    console.error("Get activity logs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get activity logs",
      error: error.message,
    });
  }
};

exports.getLoginHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10, loginId } = req.query;
    const parsedPage = Number(page);
    const parsedLimit = Number(limit);
    const pageNumber =
      Number.isFinite(parsedPage) && parsedPage > 0
        ? Math.floor(parsedPage)
        : 1;
    const limitNumber =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.floor(parsedLimit)
        : 10;
    const skip = Math.max(0, (pageNumber - 1) * limitNumber);

    const employeeId =
      req.params.id || req.query.employeeId || resolveEmployeeId(req);

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Unable to resolve employee id",
      });
    }

    const employee = await prisma.employee.findUnique({
      where: {
        id: employeeId,
        isDeleted: false,
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const where = {
      employeeId,
    };

    if (loginId) {
      where.id = loginId;
    }

    const queryOptions = {
      where,
      orderBy: { loggedInAt: "desc" },
    };

    if (loginId) {
      queryOptions.skip = 0;
      queryOptions.take = 1;
    } else {
      queryOptions.skip = skip;
      queryOptions.take = Math.max(1, limitNumber);
    }

    // Get login history
    const loginHistory = await prisma.loginActivity.findMany(queryOptions);

    // Get total count
    const total = await prisma.loginActivity.count({
      where,
    });

    const totalPages = limitNumber ? Math.ceil(total / limitNumber) || 1 : 1;

    res.status(200).json({
      success: true,
      count: loginHistory.length,
      total,
      totalPages,
      currentPage: pageNumber,
      data: loginHistory,
    });
  } catch (error) {
    console.error("Get login history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get login history",
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
        isDeleted: false,
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Get users
    const users = await prisma.user.findMany({
      where: {
        employeeId: req.params.id,
        isBlocked: false,
      },
      orderBy: { createdAt: "desc" },
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
            fileStatus: true,
          },
        },
      },
    });

    // Get total count
    const total = await prisma.user.count({
      where: {
        employeeId: req.params.id,
        isBlocked: false,
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
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get users",
      error: error.message,
    });
  }
};

exports.getLoans = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    // Check if employee exists
    const employee = await prisma.employee.findUnique({
      where: {
        id: req.user.employeeId,
        isDeleted: false,
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
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
      orderBy: { createdAt: "desc" },
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
            phone: true,
          },
        },
        loanType: {
          select: {
            id: true,
            name: true,
          },
        },
      },
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
    console.error("Get loans error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get loans",
      error: error.message,
    });
  }
};
