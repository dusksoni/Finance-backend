const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  buildLoginSecurityContext,
  decorateLoginActivity,
} = require("../utils/loginSecurity");
const SECRET = process.env.SECRET_KEY;

const resolveAdminId = (req) => {
  if (req?.user?.type === "ADMIN" && req.user?.adminId) {
    return req.user.adminId;
  }
  if (req.params?.id) return req.params.id;
  if (req.body?.id) return req.body.id;
  return null;
};

exports.adminLogin = async (req, res) => {
  const {
    email,
    password,
    deviceName,
    deviceType,
    latitude,
    longitude,
    locationAccuracy,
  } =
    req.body;
  try {
    const admin = await prisma.admin.findUnique({ where: { email } });

    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res
        .status(401)
        .json({ status: 401, error: "Invalid credentials" });
    }

    const security = await buildLoginSecurityContext({
      req,
      deviceName,
      deviceType,
      latitude,
      longitude,
      locationAccuracy,
      alertsEnabled: String(process.env.SECURITY_ALERTS_ENABLED || "false").toLowerCase() === "true",
    });

    const loginActivity = await prisma.loginActivity.create({
      data: {
        adminId: admin.id,
        role: "ADMIN",
        deviceName,
        deviceType,
        latitude: security.latitude,
        longitude: security.longitude,
        ipAddress: security.normalizedIp,
        context: security.context,
      },
    });
    
    const token = jwt.sign({ adminId: admin.id, type: "ADMIN", loginActivityId: loginActivity.id }, SECRET, {
      expiresIn: "7d",
    });
    res.json({ status: 200, data: { token } });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Internal server error", error: error, status: 500 });
  }
};

exports.getAdminProfile = async (req, res) => {
  try {
    const adminId = resolveAdminId(req);
    if (!adminId) {
      return res.status(400).json({
        status: 400,
        message: "Unable to resolve admin id",
      });
    }

    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      return res.status(401).json({
        status: 401,
        message: "Session expired. Please log in again.",
      });
    }

    res.status(200).json({
      status: 200,
      data: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get admin profile error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch admin profile",
      error: error.message,
    });
  }
};

exports.updateAdmin = async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;

    // Check if admin exists
    let admin = await prisma.admin.findUnique({
      where: { 
        id: req.params.id,
        isDeleted: false
      },
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    // Check if email is already taken by another admin
    if (email) {
      const existingAdmin = await prisma.admin.findFirst({
        where: {
          email,
          NOT: {
            id: req.params.id,
          },
          isDeleted: false
        },
      });

      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          message: 'Email is already taken',
        });
      }
    }

    // Update admin
    const updatedAdmin = await prisma.admin.update({
      where: { id: req.params.id },
      data: {
        ...(firstName || lastName
          ? {
              name: [firstName, lastName].filter(Boolean).join(" ").trim() || admin.name,
            }
          : {}),
        ...(email ? { email } : {}),
      },
    });

    // Log the action
    await logAction({
        adminId: req.user.id, // The admin who performed this action
        employeeId: req.user.employeeId,
        loginActivityId: req.user.loginActivityId,
        action: 'UPDATE',
        targetId: updatedAdmin.id,
        table: 'Admin',
        metadata: { adminId: updatedAdmin.id }
     
    });

    res.status(200).json({
      success: true,
      message: 'Admin updated successfully',
      data: updatedAdmin,
    });
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update admin',
      error: error.message,
    });
  }
};

exports.updateAdminPassword = async (req, res) => {
  try {
    const { password } = req.body;

    // Check if admin exists
    const admin = await prisma.admin.findUnique({
      where: { 
        id: req.params.id,
        isDeleted: false
      },
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update password
    await prisma.admin.update({
      where: { id: req.params.id },
      data: { password: hashedPassword },
    });

    // Log the action
    await logAction({
        adminId: req.user.id, // The admin who performed this action
        employeeId: req.user.employeeId,
        loginActivityId: req.user.loginActivityId,
        action: 'UPDATE_PASSWORD',
        targetId: admin.id,
        table: 'Admin',
        metadata: { adminId: admin.id }
      
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

exports.getActivityLogs = async (req, res) => {
  try {
    const { page = 1, limit = 10, logId, loginActivityId } = req.query;
    const parsedPage = Number(page);
    const parsedLimit = Number(limit);
    const pageNumber = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
    const limitNumber = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 10;

    const adminId = resolveAdminId(req);

    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: "Unable to resolve admin id",
      });
    }

    // Check if admin exists
    const admin = await prisma.admin.findUnique({
      where: {
        id: adminId,
      },
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    const where = {
      adminId,
    };

    if (logId) {
      where.id = logId;
    }

    if (loginActivityId) {
      where.loginActivityId = loginActivityId;
    }

    const queryOptions = {
      where,
      orderBy: { createdAt: 'desc' },
      include: { loginActivity: true },
    };

    if (logId) {
      queryOptions.skip = 0;
      queryOptions.take = 1;
    } else {
      queryOptions.skip = Math.max(0, (pageNumber - 1) * limitNumber);
      queryOptions.take = Math.max(1, limitNumber);
    }

    const logs = await prisma.actionLog.findMany(queryOptions);

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
    console.error('Get activity logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get activity logs',
      error: error.message,
    });
  }
};



exports.getLoginHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10, loginId } = req.query;
    const parsedPage = Number(page);
    const parsedLimit = Number(limit);
    const pageNumber = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
    const limitNumber = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 10;
    const skip = Math.max(0, (pageNumber - 1) * limitNumber);

    const adminId = resolveAdminId(req);

    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: "Unable to resolve admin id",
      });
    }

    // Check if admin exists
    const admin = await prisma.admin.findUnique({
      where: {
        id: adminId,
      },
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    const where = {
      adminId,
    };

    if (loginId) {
      where.id = loginId;
    }

    const queryOptions = {
      where,
      orderBy: { loggedInAt: 'desc' },
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
    const data = loginHistory.map((item) => decorateLoginActivity(item));

    // Get total count
    const total = await prisma.loginActivity.count({
      where,
    });

    const totalPages = limitNumber ? Math.ceil(total / limitNumber) || 1 : 1;

    res.status(200).json({
      success: true,
      count: data.length,
      total,
      totalPages,
      currentPage: pageNumber,
      data,
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


exports.getEmployees = async (req, res) => {
  const adminId = req.user.adminId;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const isDeleted = req.query.isDeleted === "true" ? true : false;

  const where = {
    isDeleted: isDeleted,
    OR: [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { role: { name: { contains: search, mode: "insensitive" } } },
    ],
  };

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        isBlocked: true,
        photoUrl: true,
        accessScope: true,
        extraRegionIds: true,
        extraStateIds: true,
        region: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
          },
        },
        email: true,
        role: {
          select: {
            name: true,
            description: true,
            permissions: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.employee.count({ where }),
  ]);

  res.json({
    status: 200,
    data: employees,
    total,
    page,
    limit,
  });
};

// ─── Forgot Password ───────────────────────────────────────────────────────
// Generates a reset token and stores it. In production, email this link to admin.
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const admin = await prisma.admin.findFirst({ where: { email } });
    // Always return success to prevent email enumeration
    if (!admin) return res.json({ message: "If this email exists, a reset link has been sent." });

    const crypto = require("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.admin.update({
      where: { id: admin.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetLink = `${frontendUrl}/reset-password/${token}`;
    // TODO: Replace console.log with actual email sending (nodemailer/sendgrid)
    console.log(`[PASSWORD-RESET] Reset link for ${email}: ${resetLink}`);

    res.json({ message: "If this email exists, a reset link has been sent." });
  } catch (err) {
    res.status(500).json({ error: "Failed to process forgot password", message: err.message });
  }
};

// ─── Reset Password ────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters" });

    const admin = await prisma.admin.findFirst({
      where: { resetToken: token, resetTokenExpiry: { gte: new Date() } },
    });

    if (!admin) return res.status(400).json({ error: "Invalid or expired reset token" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.admin.update({
      where: { id: admin.id },
      data: { password: hashed, resetToken: null, resetTokenExpiry: null },
    });

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset password", message: err.message });
  }
};

// ─── Refresh Token ─────────────────────────────────────────────────────────
exports.refreshToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token is required" });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }

    // Check if token is too old (more than 30 days)
    const issued = decoded.iat * 1000;
    if (Date.now() - issued > 30 * 24 * 60 * 60 * 1000) {
      return res.status(401).json({ error: "Token too old, please log in again" });
    }

    // Verify the admin/employee still exists
    const { adminId, employeeId } = decoded;
    if (adminId) {
      const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: { id: true, isActive: true } });
      if (!admin || !admin.isActive) return res.status(401).json({ error: "Account not active" });
    } else if (employeeId) {
      const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, isActive: true } });
      if (!emp || !emp.isActive) return res.status(401).json({ error: "Account not active" });
    }

    // Issue new 7-day token
    const newToken = jwt.sign(
      { adminId: decoded.adminId, employeeId: decoded.employeeId, role: decoded.role, activity: decoded.activity },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token: newToken });
  } catch (err) {
    res.status(500).json({ error: "Failed to refresh token", message: err.message });
  }
};
