const prisma = require("../lib/prisma");
const jwt = require("jsonwebtoken");

const SECRET = process.env.SECRET_KEY_NODE_AUTH;

// STEP 1: Request OTP
exports.requestOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number required" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await prisma.user.upsert({
      where: { phone },
      update: { otp },
      create: { phone, otp, name: "New User", createdBy: "SELF" },
    });

    console.log(`OTP for ${phone}: ${otp}`);

    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("requestOtp error:", err.message);
    res.status(500).json({ error: "Failed to send OTP" });
  }
};

// STEP 2: Verify OTP
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP required" });

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
  } catch (err) {
    console.error("verifyOtp error:", err.message);
    res.status(500).json({ error: "OTP verification failed" });
  }
};
