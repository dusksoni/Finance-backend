const prisma = require("../lib/prisma");

/**
  Checks if a user (ADMIN or EMPLOYEE) has permission to verify payments.
  Returns an object with:
    - verified: boolean
    - verifiedByAdminId: string|null
    - verifiedByEmployeeId: string|null
*/
async function checkVerifyPermission(user, permission) {
  if (!user || !user.type || !user.id) {
    return false;
  }
  
  if (user.type === "EMPLOYEE") {
    const employee = await prisma.employee.findUnique({
      where: { id: user.id },
      include: {
        role: {
          include: {
            permissions: true,
          },
        },
      },
    });

    const hasPermission = employee?.role?.permissions?.includes(permission);

    return hasPermission;
  }

  return false;
}

module.exports = checkVerifyPermission;
