const jwt = require("jsonwebtoken");
const SECRET = process.env.SECRET_KEY;
const checkVerifyPermission = require("./checkVerifyPermission");

/**
 * Authentication middleware that verifies JWT tokens
 * Sets the user object in the request for downstream middleware
 */
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token missing" });

  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    
    // Set session expiry time (24 hours from now)
    req.user.sessionExpiry = Date.now() + (24 * 60 * 60 * 1000);
    
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
 * @param {String} permission - The permission required to access the route
 * @returns {Function} - Express middleware function
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      const hasPermission = await checkVerifyPermission(req.user, permission, { throwError: false });
      
      if (!hasPermission) {
        return res.status(403).json({ 
          error: "Forbidden: Insufficient permissions",
          requiredPermission: permission
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
  requirePermission 
};
