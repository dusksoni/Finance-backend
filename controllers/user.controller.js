const prisma = require("../lib/prisma");
const twilio = require("twilio");
const logAction = require("../utils/adminLogger");
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

exports.createUser = async (req, res) => {
  const { name, phone, otp, email, isDefaulter } = req.body;

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
        isDefaulter: isDefaulter === "true" ? true : false,
        email: email || null,
      },
    });

    res
      .status(201)
      .json({ message: "User created successfully", data: newUser });
  } catch (err) {
    console.error("Create user error:", err.message);
    res.status(500).json({ error: "Failed to verify OTP or create user" });
  }
};
// =============== CREATE USER DETAILS ===============
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
      cityText,
      country,
      stateId,
      cityId,
      regionId,
      photo,
      photoIdTypeImages = [],
      proofOfIncomeImages = [],
    } = req.body;

    const type = await prisma.photoIdType.findUnique({
      where: { id: photoIdTypeId },
    });
    if (!type) return res.status(400).json({ error: "Invalid Photo ID type" });

    if (type.validation && !new RegExp(type.validation).test(photoIdNumber)) {
      return res
        .status(400)
        .json({ error: `Invalid ID format: ${type.numberTypeEg}` });
    }

    const existing = await prisma.userDetails.findUnique({ where: { userId } });
    if (existing)
      return res.status(400).json({ error: "User details already exist" });

    const createFiles = async (files) =>
      Promise.all(
        files.map((file) =>
          prisma.file.create({
            data: {
              url: file.secure_url,
              publicId: file.public_id,
              resourceType: file.resource_type,
              format: file.format,
            },
          })
        )
      ).then((created) => created.map((f) => ({ id: f.id })));

    const [photoFile, photoIdTypeImageIds, proofOfIncomeImageIds] =
      await Promise.all([
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

    const created = await prisma.userDetails.create({
      data: {
        userId,
        photoIdTypeId,
        photoIdNumber,
        proofOfIncome,
        creditScore: creditScore ? parseInt(creditScore) : null,
        profession,
        address,
        cityText,
        country,
        stateId,
        cityId,
        regionId,
        photoId: photoFile?.id || null,
        photoIdTypeImages: { connect: photoIdTypeImageIds },
        proofOfIncomeImages: { connect: proofOfIncomeImageIds },
      },
    });

    await logAction({
      action: "CREATED USER DETAILS",
      table: "UserDetails",
      targetId: created.id,
      metadata: created,
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.status(201).json({ message: "User details created", data: created });
  } catch (err) {
    console.error("Error creating user details:", err);
    res.status(500).json({ error: err.message });
  }
};

// =============== UPDATE USER DETAILS ===============
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
      cityText,
      country,
      stateId,
      cityId,
      regionId,
      photo,
      photoIdTypeImages = [],
      proofOfIncomeImages = [],
    } = req.body;

    const existing = await prisma.userDetails.findUnique({ where: { userId } });
    if (!existing)
      return res.status(404).json({ error: "User details not found" });

    let photoFileId = null;
    if (photo?.secure_url && !photo.id) {
      const newPhoto = await prisma.file.create({
        data: {
          url: photo.secure_url,
          publicId: photo.public_id,
          resourceType: photo.resource_type,
          format: photo.format,
        },
      });
      photoFileId = newPhoto.id;
    }

    const prepareFileIds = async (files = []) => {
      const existingIds = files.filter((f) => f.id).map((f) => ({ id: f.id }));
      const newFiles = files.filter((f) => !f.id && f.secure_url);

      const createdFiles = await Promise.all(
        newFiles.map((file) =>
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

      return [...existingIds, ...createdFiles.map((f) => ({ id: f.id }))];
    };

    const [photoIdTypeImageIds, proofOfIncomeImageIds] = await Promise.all([
      prepareFileIds(photoIdTypeImages),
      prepareFileIds(proofOfIncomeImages),
    ]);

    const updated = await prisma.userDetails.update({
      where: { userId },
      data: {
        photoIdTypeId,
        photoIdNumber,
        proofOfIncome,
        creditScore: creditScore ? parseInt(creditScore) : null,
        profession,
        address,
        cityText,
        country,
        stateId,
        cityId,
        regionId,
        ...(photoFileId && { photoId: photoFileId }),
        photoIdTypeImages: { set: photoIdTypeImageIds },
        proofOfIncomeImages: { set: proofOfIncomeImageIds },
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

    res.status(200).json({ message: "User details updated", data: updated });
  } catch (err) {
    console.error("Update UserDetails Error:", err);
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

// DELETE
exports.deleteUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const existing = await prisma.userDetails.findUnique({ where: { userId } });
    if (!existing)
      return res.status(404).json({ error: "User details not found" });

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

// GET Defaulters with Search Filters
exports.getDefaulters = async (req, res) => {
  try {
    const { photoIdNumber, name, phone, email } = req.query;

    const users = await prisma.user.findMany({
      where: {
        isDefaulter: true,
        ...(name && {
          name: {
            contains: name,
            mode: "insensitive",
          },
        }),
        ...(phone && {
          phone: {
            contains: phone,
          },
        }),
        ...(email && {
          email: {
            contains: email,
            mode: "insensitive",
          },
        }),
        ...(photoIdNumber && {
          details: {
            is: {
              photoIdNumber: {
                contains: photoIdNumber,
                mode: "insensitive",
              },
            },
          },
        }),
      },
      include: {
        details: true,
        loans: true,
      },
    });
    res.status(200).json({ data: users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
