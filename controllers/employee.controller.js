const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const logAction = require("../utils/adminLogger");
const SECRET = process.env.SECRET_KEY;

// CREATE EMPLOYEE
exports.createEmployee = async (req, res) => {
  try {
    const { name, email, password, roleId, regionId } = req.body;

    const existingEmployee = await prisma.employee.findUnique({
      where: { email },
    });
    if (existingEmployee)
      return res.status(400).json({ error: "Email already in use" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const employee = await prisma.employee.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: { connect: { id: roleId } },
        region: regionId ? { connect: { id: regionId } } : undefined,
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
      metadata: { name, email, roleId, regionId },
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
    const { name, password, roleId, regionId } = req.body;

    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });

    const updateData = {
      name,
      role: { connect: { id: roleId } },
      region: regionId ? { connect: { id: regionId } } : undefined,
    };

    if (password && password.trim()) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.employee.update({
      where: { id },
      data: updateData,
      include: { role: true, region: true },
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

// DELETE EMPLOYEE (soft delete)
exports.deleteEmployee = async (req, res) => {
  const { id } = req.params;
  try {
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee || employee.isDeleted)
      return res.status(404).json({ error: "Not found" });

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

    res.json({ message: "Employee deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// BLOCK/UNBLOCK EMPLOYEE
exports.blockedEmployee = async (req, res) => {
  const { id } = req.params;
  const { isBlocked } = req.body;
  try {
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee || employee.isDeleted)
      return res.status(404).json({ error: "Not found" });

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
    res.status(500).json({ error: err.message });
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
          }
        },
        role: {
          select: {
            id: true,
            name: true,
            permissions: true,
          }
        },
        createdAt: true,
        updatedAt: true
      }
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
