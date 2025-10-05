const prisma = require("../lib/prisma");

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
    const employee = await prisma.employee.findUnique({
      where: { id: user.employeeId },
      include: {
        role: true
      },
    });
    // Check if the employee has the required permission
    const hasPermission = employee?.role?.permissions?.includes(permission);
    
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
