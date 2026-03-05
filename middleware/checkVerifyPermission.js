const prisma = require("../lib/prisma");

const PERMISSION_CACHE_TTL_MS = 60 * 1000;
const permissionCache = new Map();

const getCachedPermissions = (employeeId) => {
  const cached = permissionCache.get(employeeId);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    permissionCache.delete(employeeId);
    return null;
  }
  return cached.permissions;
};

const setCachedPermissions = (employeeId, permissions) => {
  permissionCache.set(employeeId, {
    permissions,
    expiresAt: Date.now() + PERMISSION_CACHE_TTL_MS,
  });
};

/**
  Enhanced permission checking middleware that supports both ADMIN and EMPLOYEE users
  with caching to improve performance.
  
  @param {Object} user - The user object from the request
  @param {String} permission - The permission string to check
  @param {Object} options - Additional options
  @param {Boolean} options.throwError - Whether to throw an error if permission is denied
  @returns {Boolean} - Whether the user has the requested permission
*/
async function checkVerifyPermission(user, permission, options = {}) {
  // Return false if user data is incomplete
  if (!user || !user.type) {
    return false;
  }
  
  // Check permission based on user type
  if (user.type === "ADMIN") {
    // Admins have all permissions by default
    return true;
  } else if (user.type === "EMPLOYEE") {
    // For employees, check their role permissions
    if (!user.employeeId) return false;

    let permissions = getCachedPermissions(user.employeeId);
    if (!permissions) {
      const employee = await prisma.employee.findUnique({
        where: { id: user.employeeId },
        include: {
          role: true
        },
      });
      permissions = employee?.role?.permissions || [];
      setCachedPermissions(user.employeeId, permissions);
    }
    // Check if the employee has the required permission
    const hasPermission = permissions.includes(permission);
    
    // If throwError option is true and permission is denied, throw an error
    if (options.throwError && !hasPermission) {
      const error = new Error("Permission denied");
      error.statusCode = 403;
      throw error;
    }

    return hasPermission;
  }

  return false;
}

module.exports = checkVerifyPermission;
