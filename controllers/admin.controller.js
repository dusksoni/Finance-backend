const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const SECRET = process.env.SECRET_KEY;

exports.adminLogin = async (req, res) => {
  const { email, password, deviceName, deviceType, latitude, longitude } =
    req.body;
  try {
    const admin = await prisma.admin.findUnique({ where: { email } });

    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res
        .status(401)
        .json({ status: 401, error: "Invalid credentials" });
    }

    
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    
   const loginActivity = await prisma.LoginActivity.create({
      data: {
        adminId: admin.id,
        role: "ADMIN",
        deviceName,
        deviceType,
        latitude: latitude === "" ? null : parseFloat(latitude),
        longitude: longitude === "" ? null : parseFloat(longitude),
        ipAddress: ip,
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
