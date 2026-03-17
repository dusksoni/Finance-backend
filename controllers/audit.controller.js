const prisma = require("../lib/prisma");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");
const { decorateLoginActivity } = require("../utils/loginSecurity");

const mapUserForPermission = (user) => {
  if (!user) return null;
  if (user.type === "EMPLOYEE" && user.employeeId && !user.id) {
    return { ...user, id: user.employeeId };
  }
  if (user.type === "ADMIN" && user.adminId && !user.id) {
    return { ...user, id: user.adminId };
  }
  return user;
};

const ensureEmployeePermission = async (req, permission) => {
  if (req.user?.type !== "EMPLOYEE") {
    return true;
  }

  const permissionUser = mapUserForPermission(req.user);
  if (!permissionUser?.id) {
    return false;
  }

  return checkVerifyPermission(permissionUser, permission, { throwError: false });
};

exports.getActivityLogDetail = async (req, res) => {
  try {
    const { logId } = req.params;

    if (!logId) {
      return res.status(400).json({
        success: false,
        message: "Activity log id is required",
      });
    }

    const log = await prisma.actionLog.findUnique({
      where: { id: logId },
      include: {
        admin: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
            role: {
              select: {
                name: true,
              },
            },
          },
        },
        loginActivity: {
          include: {
            admin: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            employee: {
              select: {
                id: true,
                name: true,
                email: true,
                role: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Activity log not found",
      });
    }

    if (req.user?.type === "EMPLOYEE") {
      const ownsLog = log.employeeId === req.user?.employeeId;
      if (!ownsLog) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const allowed = await ensureEmployeePermission(req, "EMPLOYEE_ACTIVITY_VIEW");
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
    }

    res.status(200).json({
      success: true,
      data: log,
    });
  } catch (error) {
    console.error("Get activity log detail error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get activity log detail",
      error: error.message,
    });
  }
};

exports.getLoginHistoryDetail = async (req, res) => {
  try {
    const { loginId } = req.params;

    if (!loginId) {
      return res.status(400).json({
        success: false,
        message: "Login history id is required",
      });
    }

    const loginHistory = await prisma.loginActivity.findUnique({
      where: { id: loginId },
      include: {
        admin: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
            role: {
              select: {
                name: true,
              },
            },
          },
        },
        actionLogs: {
          orderBy: { createdAt: "desc" },
          include: {
            admin: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            employee: {
              select: {
                id: true,
                name: true,
                email: true,
                role: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!loginHistory) {
      return res.status(404).json({
        success: false,
        message: "Login history entry not found",
      });
    }

    if (req.user?.type === "EMPLOYEE") {
      const ownsEntry = loginHistory.employeeId === req.user?.employeeId;
      if (!ownsEntry) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const allowed = await ensureEmployeePermission(req, "EMPLOYEE_LOGIN_HISTORY_VIEW");
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
    }

    res.status(200).json({
      success: true,
      data: decorateLoginActivity(loginHistory),
    });
  } catch (error) {
    console.error("Get login history detail error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get login history detail",
      error: error.message,
    });
  }
};
