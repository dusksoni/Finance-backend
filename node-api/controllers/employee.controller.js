const logAdminAction = require("../utils/adminLogger");
const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const SECRET = process.env.SECRET_KEY;

exports.createEmployee = async (req, res) => {
  try {
    const { name, email, password, roleId } = req.body;
    // Check if the email already exists
    const existingEmployee = await prisma.employee.findUnique({
      where: { email },
    });

    if (existingEmployee) {
      return res.status(400).json({ error: "Email already in use" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const employee = await prisma.employee.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: { connect: { id: roleId } },
        admin: { connect: { id: req.user.adminId } },
      },
      include: {
        role: true,
      },
    });

    await logAdminAction({
      adminId: req.user.adminId,
      action: "CREATED EMPLOYEE",
      table: "Employee",
      targetId: employee.id,
      metadata: { name, email, roleId },
    });

    res.status(201).json({ message: "Employee Created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.putEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, password, roleId } = req.body;

    // Check if employee exists
    const employee = await prisma.employee.findUnique({ where: { id } });

    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    // Prepare update data
    const updateData = {
      name,
      role: { connect: { id: roleId } },
    };

    // Only update password if provided
    if (password && password.trim() !== "") {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }

    const updatedEmployee = await prisma.employee.update({
      where: { id },
      data: updateData,
      include: { role: true },
    });

    await logAdminAction({
      adminId: req.user.adminId,
      action: "UPDATED EMPLOYEE",
      table: "Employee",
      targetId: id,
      metadata: { name, roleId },
    });

    res.status(200).json({ message: "Employee updated successfully" });
  } catch (err) {
    console.error("Update Employee Error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await prisma.employee.findUnique({ where: { id } });

    if (!employee || employee.isDeleted) {
      return res.status(404).json({ error: "Employee not found" });
    }

    await prisma.employee.update({
      where: { id },
      data: { isDeleted: true },
    });

    await logAdminAction({
      adminId: req.user.adminId,
      action: "DELETED EMPLOYEE",
      table: "Employee",
      targetId: id,
      metadata: { name: employee.name, email: employee.email },
    });

    res.json({ message: "Employee deleted successfully" });
  } catch (err) {
    console.error("Delete Employee Error:", err);
    res.status(500).json({ error: "Failed to delete employee" });
  }
};
exports.blockedEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body;

    const employee = await prisma.employee.findUnique({ where: { id } });

    if (!employee || employee.isDeleted) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const updatedEmployee = await prisma.employee.update({
      where: { id },
      data: { isBlocked },
    });

    await logAdminAction({
      adminId: req.user.adminId,
      action: isBlocked ? "BLOCKED EMPLOYEE" : "UNBLOCKED EMPLOYEE",
      table: "Employee",
      targetId: id,
      metadata: { name: employee.name, email: employee.email },
    });

    res.json({
      message: `Employee ${isBlocked ? "blocked" : "unblocked"} successfully`,
      status: 200,
      data: updatedEmployee,
    });
  } catch (err) {
    console.error("Block/Unblock Employee Error:", err);
    res.status(500).json({ error: "Failed to update employee status" });
  }
};

exports.employeeLogin = async (req, res) => {
  const { email, password, deviceName, deviceType, latitude, longitude } =
    req.body;

  const employee = await prisma.employee.findUnique({ where: { email } });

  if (employee.isBlocked) {
    return res.status(400).json({ error: "This Account is Blocked" });
  }

  if (!employee || !(await bcrypt.compare(password, employee.password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { employeeId: employee.id, type: "EMPLOYEE" },
    SECRET,
    { expiresIn: "7d" }
  );

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  await prisma.loginActivity.create({
    data: {
      adminId: employee.adminId, // this links the login to the main admin
      role: "EMPLOYEE",
      deviceName,
      deviceType,
      latitude,
      longitude,
      ipAddress: ip,
    },
  });

  res.json({ status: 200, data: { token } });
};
