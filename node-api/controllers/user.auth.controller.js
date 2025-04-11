const prisma = require("../lib/prisma");
const jwt = require("jsonwebtoken");

const SECRET = process.env.SECRET_KEY_NODE_AUTH;

// STEP 1: Request OTP
exports.requestOtp = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP

  const user = await prisma.user.upsert({
    where: { phone },
    update: { otp },
    create: { phone, otp, name: "New User", createdBy: "SELF" },
  });

  console.log(`OTP for ${phone}: ${otp}`); // You'd integrate SMS API here

  res.json({ message: "OTP sent successfully" });
};

// STEP 2: Verify OTP
exports.verifyOtp = async (req, res) => {
  const { phone, otp } = req.body;
  const user = await prisma.user.findUnique({ where: { phone } });

  if (!user || user.otp !== otp) {
    return res.status(401).json({ error: "Invalid OTP" });
  }

  await prisma.user.update({ where: { phone }, data: { otp: null } });

  const token = jwt.sign(
    { userId: user.id, type: "USER" },
    SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token, user });
};
