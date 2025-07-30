const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const SECRET = process.env.SECRET_KEY;

exports.getPermissions = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await prisma.employee.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ permissions: user.role.permissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
