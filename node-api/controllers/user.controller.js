const prisma = require("../lib/prisma");

exports.createUser = async (req, res) => {
  const { name, email, phone } = req.body;
  let data = {
    name,
    email,
    phone,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (req.user?.type === "ADMIN") {
    data.adminId = req.user.adminId;
    data.createdBy = "ADMIN";
  } else if (req.user?.type === "EMPLOYEE") {
    data.employeeId = req.user.employeeId;
    data.createdBy = "EMPLOYEE";
  } else {
    return res.status(403).json({ error: "Not authorized to create users" });
  }

  const user = await prisma.user.create({ data });
  res.json(user);
};

exports.createUserDetails = async (req, res) => {
  if (req.user?.type !== "ADMIN" && req.user?.type !== "EMPLOYEE") {
    return res.status(403).json({ error: "Only Admin or Employee can create user details" });
  }

  try {
    const { userId } = req.params;
    const { aadhaar, pan, address, photoUrl } = req.body;

    const existing = await prisma.userDetails.findUnique({
      where: { userId: parseInt(userId) },
    });

    if (existing) return res.status(400).json({ error: "User details already exist" });

    const details = await prisma.userDetails.create({
      data: { userId: parseInt(userId), aadhaar, pan, address, photoUrl },
    });

    res.json(details);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// READ
exports.getUserDetailsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const details = await prisma.userDetails.findUnique({
      where: { userId: parseInt(userId) },
    });
    if (!details) return res.status(404).json({ error: "User details not found" });
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE
exports.updateUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const { aadhaar, pan, address, photoUrl } = req.body;

    const updated = await prisma.userDetails.update({
      where: { userId: parseInt(userId) },
      data: { aadhaar, pan, address, photoUrl },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE
exports.deleteUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    await prisma.userDetails.delete({
      where: { userId: parseInt(userId) },
    });
    res.json({ message: "User details deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};