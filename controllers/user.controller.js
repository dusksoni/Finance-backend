const prisma = require("../lib/prisma");
const twilio = require("twilio");
const logAction = require("../utils/adminLogger");
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
exports.createUser = async (req, res) => {
  const {
    name,
    phone,
    email,
    isDefaulter,
    photoIds = [],
    proofOfIncome,
    creditScore,
    profession,
    address,
    cityText,
    country,
    stateId,
    cityId,
    regionId,
    proofOfIncomeImages = [],
  } = req.body;

  if (!name || !phone)
    return res.status(400).json({ error: "Name, phone & OTP are required" });

  try {
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) return res.status(400).json({ error: "User already exists" });

    const createFiles = async (files = []) =>
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

    const proofIncomeImages = await createFiles(proofOfIncomeImages);

    const user = await prisma.user.create({
      data: {
        name,
        phone,
        email,
        isDefaulter: isDefaulter=== "true" ? true : false ,
        proofOfIncome,
        // creditScore,
        profession,
        address,
        cityText,
        country,
        stateId,
        cityId,
        // regionId,
        proofOfIncomeImages: { connect: proofIncomeImages },
        photoIds: {
          create: await Promise.all(
            photoIds.map(async (pid) => ({
              photoIdNumber: pid.photoIdNumber,
              photoIdTypeId: pid.photoIdTypeId,
              images: {
                connect: await createFiles(pid.images),
              },
            }))
          ),
        },
      },
      include: {
        photoIds: true,
      },
    });

    res.status(201).json({ message: "User created successfully", data: user });
  } catch (err) {
    console.error("Create user error:", err.message);
    res.status(500).json({ error: "Failed to create user" });
  }
};
exports.getAllUsers = async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      photoIdNumber,
      isDefaulter,
      page = 1,
      limit = 10,
    } = req.query;

    const filters = {
      ...(name && {
        name: { contains: name, mode: "insensitive" },
      }),
      ...(phone && {
        phone: { contains: phone },
      }),
      ...(email && {
        email: { contains: email, mode: "insensitive" },
      }),
      ...(isDefaulter !== undefined && {
        isDefaulter: isDefaulter === "true",
      }),
      ...(photoIdNumber && {
        photoIds: {
          some: {
            photoIdNumber: {
              contains: photoIdNumber,
              mode: "insensitive",
            },
          },
        },
      }),
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: filters,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          photoIds: {
            include: {
              images: true,
              photoIdType: true,
            },
          },
          proofOfIncomeImages: true,
          loans: true
        },
      }),
      prisma.user.count({ where: filters }),
    ]);

    res.status(200).json({
      data: users,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
     
    });
  } catch (err) {
    console.error("Get All Users Error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        photoIds: {
          include: {
            images: true,
            photoIdType: true,
          },
        },
        proofOfIncomeImages: true,
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ status: 200, data: user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      phone,
      email,
      isDefaulter,
      photoIds = [],
      proofOfIncome,
      creditScore,
      profession,
      address,
      cityText,
      country,
      stateId,
      cityId,
      regionId,
      proofOfIncomeImages = [],
    } = req.body;

    const createFiles = async (files = []) =>
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

    const proofIncomeImages = await createFiles(proofOfIncomeImages);

    await prisma.photoID.deleteMany({ where: { userId: id } });

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name,
        phone,
        email,
        isDefaulter,
        proofOfIncome,
        creditScore,
        profession,
        address,
        cityText,
        country,
        stateId,
        cityId,
        regionId,
        proofOfIncomeImages: {
          set: [],
          connect: proofIncomeImages,
        },
        photoIds: {
          create: await Promise.all(
            photoIds.map(async (pid) => ({
              photoIdNumber: pid.photoIdNumber,
              photoIdTypeId: pid.photoIdTypeId,
              images: {
                connect: await createFiles(pid.images),
              },
            }))
          ),
        },
      },
      include: {
        photoIds: true,
      },
    });

    res.json({ status: 200, message: "User updated", data: updatedUser });
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    await prisma.photoID.deleteMany({ where: { userId: id } });

    await prisma.user.delete({ where: { id } });

    res.json({ status: 200, message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
