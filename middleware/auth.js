const jwt = require("jsonwebtoken");
const SECRET = process.env.SECRET_KEY;
const checkVerifyPermission = require("./checkVerifyPermission");
const prisma = require("../lib/prisma");

/**
 * Authentication middleware that verifies JWT tokens and enriches req.user
 * with full regional context (regionId, branchId, stateId, accessScope,
 * extraRegionIds, permissions) loaded fresh from DB on every request.
 */
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token missing" });

  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    req.user.sessionExpiry = Date.now() + 24 * 60 * 60 * 1000;

    if (payload.type === "EMPLOYEE" && payload.employeeId) {
      try {
        const emp = await prisma.employee.findUnique({
          where: { id: payload.employeeId },
          select: {
            id: true,
            regionId: true,
            branchId: true,
            stateId: true,
            accessScope: true,
            extraRegionIds: true,
            extraStateIds: true,
            role: { select: { permissions: true } },
          },
        });
        if (emp) {
          req.user.regionId = emp.regionId || null;
          req.user.branchId = emp.branchId || null;
          req.user.stateId = emp.stateId || null;
          req.user.accessScope = emp.accessScope || "REGION";
          req.user.extraRegionIds = emp.extraRegionIds || [];
          req.user.extraStateIds = emp.extraStateIds || [];
          req.user.permissions = emp.role?.permissions || [];
        }
      } catch (_) {
        // Non-fatal — proceed without regional enrichment
      }
    }

    if (payload.type === "ADMIN") {
      req.user.accessScope = "ALL";
      req.user.extraRegionIds = [];
    }

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * Middleware that only allows admin users to access the route
 */
function adminOnly(req, res, next) {
  if (req.user?.type !== "ADMIN") {
    return res.status(403).json({ error: "Admins only" });
  }
  next();
}

/**
 * Middleware that allows both admin and employee users to access the route
 */
function onlyAdminOrEmployee(req, res, next) {
  if (!["ADMIN", "EMPLOYEE"].includes(req.user?.type)) {
    return res.status(403).json({ error: "Not allowed" });
  }
  next();
}

/**
 * Middleware factory that creates permission-checking middleware
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      const hasPermission = await checkVerifyPermission(req.user, permission, { throwError: false });
      if (!hasPermission) {
        return res.status(403).json({
          error: "Forbidden: Insufficient permissions",
          requiredPermission: permission,
        });
      }
      next();
    } catch (error) {
      return res.status(500).json({ error: "Error checking permissions" });
    }
  };
}

/**
 * Legacy function for checking permissions directly
 * @deprecated Use requirePermission middleware instead
 */
function checkPermission(req, permission) {
  const userPermissions = req.user?.permissions || [];
  if (!userPermissions.includes(permission)) {
    return res.status(403).json({ error: "Forbidden: No access" });
  }
}

module.exports = {
  authMiddleware,
  adminOnly,
  onlyAdminOrEmployee,
  checkPermission,
  requirePermission,
};
