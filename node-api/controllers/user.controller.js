const prisma = require("../lib/prisma");
const twilio = require("twilio");
const logAction = require("../utils/adminLogger");
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

exports.createUser = async (req, res) => {
  const { name, phone, otp, email } = req.body;

  if (!name || !phone || !otp)
    return res.status(400).json({ error: "Name, phone & OTP are required" });

  try {
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) return res.status(400).json({ error: "User already exists" });
    const check = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: `+91${phone}`, code: otp });

    if (check.status !== "approved") {
      return res.status(401).json({ error: "Invalid or expired OTP" });
    }


    const newUser = await prisma.user.create({
      data: {
        name,
        phone,
        createdBy: req.user?.type,
        adminId: req.user?.adminId || null,
        employeeId: req.user?.employeeId || null,
        isDefaulter: true,
        email: email || null,
      },
    });

    res.status(201).json({ message: "User created successfully", data: newUser });
  } catch (err) {
    console.error("Create user error:", err.message);
    res.status(500).json({ error: "Failed to verify OTP or create user" });
  }
};
exports.createUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      photoIdTypeId,
      photoIdNumber,
      proofOfIncome,
      creditScore,
      profession,
      address,
      city,
      country,
      photo, // single file object
      photoIdTypeImages = [], // array of file objects
      proofOfIncomeImages = [], // array of file objects
    } = req.body;

    // Validate Photo ID type
    const type = await prisma.photoIdType.findUnique({ where: { id: photoIdTypeId } });
    if (!type) return res.status(400).json({ error: "Invalid Photo ID type" });

    if (type.validation && !new RegExp(type.validation).test(photoIdNumber)) {
      return res.status(400).json({
        error: `Photo ID does not match format: ${type.numberTypeEg}`,
      });
    }

    // Check if details already exist
    const existing = await prisma.userDetails.findUnique({ where: { userId } });
    if (existing) return res.status(400).json({ error: "User details already exist" });

    // 🔁 Helper to save files and return file IDs
    const createFiles = async (files) => {
      const createdFiles = await Promise.all(
        files.map(file =>
          prisma.file.create({
            data: {
              url: file.secure_url,
              publicId: file.public_id,
              resourceType: file.resource_type,
              format: file.format,
            },
          })
        )
      );
      return createdFiles.map(f => ({ id: f.id }));
    };

    // 📸 Create related files
    const [photoFile, photoIdTypeImageIds, proofOfIncomeImageIds] = await Promise.all([
      photo
        ? prisma.file.create({
            data: {
              url: photo.secure_url,
              publicId: photo.public_id,
              resourceType: photo.resource_type,
              format: photo.format,
            },
          })
        : null,
      createFiles(photoIdTypeImages),
      createFiles(proofOfIncomeImages),
    ]);

    // 📝 Create User Details
    const created = await prisma.userDetails.create({
      data: {
        userId,
        photoIdTypeId,
        photoIdNumber,
        proofOfIncome,
        creditScore: creditScore ? parseInt(creditScore) : null,
        profession,
        address,
        city,
        country,
        photoId: photoFile?.id || null,
        photoIdTypeImages: {
          connect: photoIdTypeImageIds,
        },
        proofOfIncomeImages: {
          connect: proofOfIncomeImageIds,
        },
      },
    });

    // 🪵 Log Action
    await logAction({
      action: "CREATED USER DETAILS",
      table: "UserDetails",
      targetId: created.id,
      metadata: created,
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.status(201).json({
      message: "User details created successfully",
      data: created,
    });
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
      proofOfIncome,
      creditScore,
      profession,
      address,
      city,
      country,
      photoId,
      photoIdTypeImageIds = [],
      proofOfIncomeImageIds = [],
    } = req.body;

    // 1. Check if userDetails exist for given userId
    const existing = await prisma.userDetails.findUnique({ where: { userId } });
    if (!existing) {
      return res.status(404).json({ error: "User details not found" });
    }

    // 2. Validate the Photo ID Type
    const type = await prisma.photoIdType.findUnique({ where: { id: photoIdTypeId } });
    if (!type) {
      return res.status(400).json({ error: "Invalid Photo ID type" });
    }

    if (type.validation && !new RegExp(type.validation).test(photoIdNumber)) {
      return res.status(400).json({
        error: `Photo ID does not match format: ${type.numberTypeEg}`,
      });
    }

    // 3. Update userDetails
    const updated = await prisma.userDetails.update({
      where: { userId },
      data: {
        photoIdTypeId,
        photoIdNumber,
        proofOfIncome,
        creditScore: creditScore ? parseInt(creditScore) : null,
        profession,
        address,
        city,
        country,
        photoId: photoId || null,
        photoIdTypeImages: {
          set: photoIdTypeImageIds.map((id) => ({ id })),
        },
        proofOfIncomeImages: {
          set: proofOfIncomeImageIds.map((id) => ({ id })),
        },
      },
    });

    // 4. Log update
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
      message: "User details updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("Update UserDetails Error:", err.message);
    res.status(500).json({ error: err.message });
  }
};


// DELETE
exports.deleteUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const existing = await prisma.userDetails.findUnique({ where: { userId } });
    if (!existing) return res.status(404).json({ error: "User details not found" });

    await prisma.userDetails.delete({ where: { userId } });

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
