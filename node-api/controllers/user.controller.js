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
    return res
      .status(403)
      .json({ error: "Only Admin or Employee can create user details" });
  }

  try {
    const { userId } = req.params;
    const {
      photoIdTypeId,
      photoIdNumber,
      photoIdTypeImage = [],
      proofOfIncome,
      proofOfIncomeImage = [],
      creditScore,
      profession,
      address,
      photoUrl,
    } = req.body;

    // Validate photoIdType
    const type = await prisma.photoIdType.findUnique({
      where: { id: photoIdTypeId },
    });

    if (!type) {
      return res.status(400).json({ error: "Invalid Photo ID type" });
    }

    // Validate using regex if defined
    if (type.validation && !new RegExp(type.validation).test(photoIdNumber)) {
      return res.status(400).json({
        error: `Photo ID does not match format: ${type.numberTypeEg}`,
      });
    }

    // Check if userDetails already exists
    const existing = await prisma.userDetails.findUnique({
      where: { userId },
    });

    if (existing) {
      return res.status(400).json({ error: "User details already exist" });
    }

    const created = await prisma.userDetails.create({
      data: {
        userId,
        photoIdTypeId,
        photoIdNumber,
        photoIdTypeImage,
        proofOfIncome,
        proofOfIncomeImage,
        creditScore: creditScore ? parseInt(creditScore) : null,
        profession,
        address,
        photoUrl,
      },
    });

    // Log the action
    await logAction({
      action: "CREATED USER DETAILS",
      table: "UserDetails",
      targetId: created.id,
      metadata: created,
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res
      .status(201)
      .json({ message: "User details created successfully", data: created });
  } catch (err) {
    console.error("Create UserDetails Error:", err);
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
    if (!details)
      return res.status(404).json({ error: "User details not found" });
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE
exports.updateUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      photoIdTypeId,
      photoIdNumber,
      photoIdTypeImage = [],
      proofOfIncome,
      proofOfIncomeImage = [],
      creditScore,
      profession,
      address,
      photoUrl,
    } = req.body;

    // Validate PhotoIdType
    const type = await prisma.photoIdType.findUnique({
      where: { id: photoIdTypeId },
    });

    if (!type) {
      return res.status(400).json({ error: "Invalid Photo ID type" });
    }

    if (type.validation && !new RegExp(type.validation).test(photoIdNumber)) {
      return res.status(400).json({
        error: `Photo ID does not match format: ${type.numberTypeEg}`,
      });
    }

    const updated = await prisma.userDetails.update({
      where: { userId },
      data: {
        photoIdTypeId,
        photoIdNumber,
        photoIdTypeImage,
        proofOfIncome,
        proofOfIncomeImage,
        creditScore: creditScore ? parseInt(creditScore) : null,
        profession,
        address,
        photoUrl,
      },
    });

    await logAction({
      action: "UPDATED USER DETAILS",
      table: "UserDetails",
      targetId: updated.id,
      metadata: updated,
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.json({
      status: 200,
      data: updated,
      message: "User details updated successfully",
    });
  } catch (err) {
    console.error("Update UserDetails Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// DELETE
exports.deleteUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const existing = await prisma.userDetails.findUnique({
      where: { userId },
    });

    if (!existing) {
      return res.status(404).json({ error: "User details not found" });
    }

    await prisma.userDetails.delete({
      where: { userId },
    });

    await logAction({
      action: "DELETED USER DETAILS",
      table: "UserDetails",
      targetId: existing.id,
      metadata: existing,
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.json({ message: "User details deleted successfully" });
  } catch (err) {
    console.error("Delete UserDetails Error:", err);
    res.status(500).json({ error: err.message });
  }
};
