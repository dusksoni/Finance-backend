const prisma = require("../lib/prisma");
const twilio = require("twilio");
const logAction = require("../utils/adminLogger");
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

exports.createUser = async (req, res) => {
  const {
    firstName,
    middleName,
    lastName,
    relationFirstName,
    relationMiddleName,
    relationLastName,
    genderId,
    relationTypeId,
    pincode,
    addressCategoryId,
    dateOfBirth,
    maritalStatus,
    qualification,
    phone,
    email,
    isDefaulter,
    photo,
    photoIds = [],
    proofOfIncome,
    creditScore,
    profession,
    address,
    cityText,
    country,
    stateId,
    cityId,
    proofOfIncomeImages = [],
  } = req.body;

  if (!firstName || !phone) {
    return res.status(400).json({ error: "First name and phone are required" });
  }

  try {
    const matches = await prisma.user.findMany({
      where: {
        photoIds: {
          some: {
            OR: photoIds.map((pid) => ({
              photoIdTypeId: pid.photoIdTypeId,
              photoIdNumber: pid.photoIdNumber,
            })),
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        phone: true,
        photoIds: {
          select: {
            photoIdTypeId: true,
            photoIdNumber: true,
          },
        },
      },
    });

    if (matches.length > 0) {
      return res.status(400).json({
        error: "User already exists with this document",
        users: matches,
      });
    }

    const region = await prisma.region.findFirst({
      where: { stateId, cityId },
      select: { id: true },
    });

    if (!region) {
      return res
        .status(400)
        .json({ error: "Region not found for given state and city" });
    }

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
    const profilePhoto = photo ? await createFiles([photo]) : [];

    const user = await prisma.user.create({
      data: {
        firstName,
        middleName,
        lastName,
        relationType: { connect: { id: relationTypeId } },
        addressCategory: {
          connect: { id: addressCategoryId },
        },
        relationFirstName,
        relationMiddleName,
        relationLastName,
        dateOfBirth,
        phone,
        pincode,
        gender: { connect: { id: genderId } },
        maritalStatus,
        email,
        isDefaulter: isDefaulter === "true" ? true : false,
        proofOfIncome,
        creditScore,
        profession,
        address,
        cityText,
        country,
        qualification,
        state: { connect: { id: stateId } },
        city: { connect: { id: cityId } },
        region: { connect: { id: region.id } },
        createdBy: req.user?.type || "unknown",
        admin: req.user?.adminId ? { connect: { id: req.user.adminId } } : null,
        employee: req.user?.employeeId
          ? { connect: { id: req.user.employeeId } }
          : null,
        proofOfIncomeImages: { connect: proofIncomeImages },
        photo: profilePhoto.length
          ? { connect: { id: profilePhoto[0].id } }
          : null,
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
        photoIds: { include: { images: true } },
        proofOfIncomeImages: true,
        photo: true,
      },
    });

    await logAction({
      action: "CREATED USER",
      table: "User",
      targetId: user.id,
      metadata: user,
      loginActivity: req.user.loginActivityId
        ? { connect: { id: req.user.loginActivityId } }
        : null,
      admin: req.user?.adminId ? { connect: { id: req.user.adminId } } : null,
      employee: req.user?.employeeId
        ? { connect: { id: req.user.employeeId } }
        : null,
    });

    res.status(201).json({ message: "User created successfully", data: user });
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const {
      search = "",
      name,
      phone,
      email,
      photoIdNumber,
      regionId,
      isDefaulter,
      page = 1,
      limit = 10,
    } = req.query;

    const orConditions = [];

    if (search) {
      orConditions.push(
        { firstName: { contains: search, mode: "insensitive" } },
        { middleName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
        {
          photoIds: {
            some: {
              photoIdNumber: {
                contains: search,
                mode: "insensitive",
              },
            },
          },
        }
      );
    }

    const filters = {
      AND: [
        ...(orConditions.length ? [{ OR: orConditions }] : []),

        ...(name
          ? [
              {
                OR: [
                  { firstName: { contains: name, mode: "insensitive" } },
                  { middleName: { contains: name, mode: "insensitive" } },
                  { lastName: { contains: name, mode: "insensitive" } },
                ],
              },
            ]
          : []),

        ...(phone ? [{ phone: { contains: phone } }] : []),
        ...(email
          ? [{ email: { contains: email, mode: "insensitive" } }]
          : []),
        ...(isDefaulter !== undefined
          ? [{ isDefaulter: isDefaulter === "true" }]
          : []),
        ...(photoIdNumber
          ? [
              {
                photoIds: {
                  some: {
                    photoIdNumber: {
                      contains: photoIdNumber,
                      mode: "insensitive",
                    },
                  },
                },
              },
            ]
          : []),
        ...(regionId ? [{ regionId }] : []),
      ],
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
          city: true,
          gender: true,
          addressCategory: true,
          relationType: true,
          employee: true,
          photo: true,
          state: true,
          region: true,
          proofOfIncomeImages: true,
          loans: true,
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
         city: true,
          gender: true,
          addressCategory: true,
          relationType: true,
          employee: true,
          photo: true,
          state: true,
          region: true,
          proofOfIncomeImages: true,
          loans: {
            include: {
              loanType: true,
             
            },
          },
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ status: 200, data: user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const {
    firstName,
    middleName,
    lastName,
    relationFirstName,
    relationMiddleName,
    relationLastName,
    genderId,
    relationTypeId,
    pincode,
    addressCategoryId,
    dateOfBirth,
    maritalStatus,
    qualification,
    phone,
    email,
    isDefaulter,
    photo,
    photoIds = [],
    proofOfIncome,
    creditScore,
    profession,
    address,
    cityText,
    country,
    stateId,
    cityId,
    proofOfIncomeImages = [],
  } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isAdmin = req.user?.type?.includes("ADMIN");
    // File upload helper
    const createFiles = async (files = []) =>
      Promise.all(
        files.map(async (file) => {
          if (file.id) {
            return { id: file.id }; // already exists
          }
          const newFile = await prisma.file.create({
            data: {
              url: file.secure_url,
              publicId: file.public_id,
              resourceType: file.resource_type,
              format: file.format,
            },
          });
          return { id: newFile.id };
        })
      );

    const profilePhoto = photo ? await createFiles([photo]) : [];
    const proofIncomeFileLinks = await createFiles(proofOfIncomeImages);
    const formattedPhotoIds = await Promise.all(
      photoIds.map(async (pid) => ({
        photoIdNumber: pid.photoIdNumber,
        photoIdTypeId: pid.photoIdTypeId,
        images: {
          connect: await createFiles(pid.images),
        },
      }))
    );
    console.log(isAdmin);
    if (isAdmin) {
      const region = await prisma.region.findFirst({
        where: { stateId, cityId },
        select: { id: true },
      });

      if (!region) {
        return res
          .status(400)
          .json({ error: "Region not found for state and city" });
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data:{
          firstName,
          middleName,
          lastName,
          relationFirstName,
          relationMiddleName,
          relationLastName,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          phone,
          pincode,
          email,
          isDefaulter: isDefaulter === "true",
          proofOfIncome,
          creditScore,
          profession,
          address,
          cityText,
          country,
          maritalStatus,
          qualification,
          relationType: relationTypeId
          ? { connect: { id: relationTypeId } }
          : undefined,
          // genderId: genderId || null,
          addressCategory: addressCategoryId
            ? { connect: { id: addressCategoryId } }
            : undefined,
          state: stateId ? { connect: { id: stateId } } : undefined,
          city: cityId ? { connect: { id: cityId } } : undefined,
          region: { connect: { id: region.id } },
          proofOfIncomeImages: {
            set: [],
            connect: proofIncomeFileLinks,
          },
          photo: profilePhoto.length
            ? { connect: { id: profilePhoto[0].id } }
            : undefined,
          photoIds: {
            create: formattedPhotoIds,
          },
        },
        include: {
          photoIds: {
            include: { images: true, photoIdType: true },
          },
          photo: true,
          proofOfIncomeImages: true,
        },
      });

      await logAction({
        action: "UPDATED USER",
        table: "User",
        targetId: updatedUser.id,
        metadata: req.body,
        loginActivity: req.user?.loginActivityId
          ? { connect: { id: req.user.loginActivityId } }
          : null,
        admin: req.user?.adminId ? { connect: { id: req.user.adminId } } : null,
        employee: req.user?.employeeId
          ? { connect: { id: req.user.employeeId } }
          : null,
      });

      return res.status(200).json({
        status: 200,
        message: "User updated successfully",
        data: updatedUser,
      });
    }
    console.log("object");
    // Employee: Submit update request instead
    const requestPayload = {
      firstName,
      middleName,
      lastName,
      relationFirstName,
      relationMiddleName,
      relationLastName,
      dateOfBirth,
      phone,
      pincode,
      email,
      isDefaulter: isDefaulter === "true",
      proofOfIncome,
      creditScore,
      profession,
      address,
      cityText,
      country,
      maritalStatus,
      qualification,
      ...(genderId && { genderId }),
      ...(relationTypeId && { relationTypeId }),
      ...(addressCategoryId && { addressCategoryId }),
      ...(stateId && { stateId }),
      ...(cityId && { cityId }),
      ...(profilePhoto.length && { photoId: profilePhoto[0].id }),
      ...(proofIncomeFileLinks.length && {
        proofOfIncomeImageIds: proofIncomeFileLinks.map((f) => f.id),
      }),
      ...(photoIds.length && {
        photoIds: formattedPhotoIds,
      }),
    };

    const updateRequest = await prisma.userUpdateRequest.create({
      data: {
        userId: id,
        changes: requestPayload,
        requestedByAdminId: req.user?.adminId || null,
        requestedByEmployeeId: req.user?.employeeId || null,
        loginActivityId: req.user?.loginActivityId || null,
        status: "PENDING",
      },
    });

    await logAction({
      action: "REQUESTED USER UPDATE",
      table: "UserUpdateRequest",
      targetId: updateRequest.id,
      metadata: requestPayload,
      loginActivity: req.user?.loginActivityId
        ? { connect: { id: req.user.loginActivityId } }
        : null,
      admin: req.user?.adminId ? { connect: { id: req.user.adminId } } : null,
      employee: req.user?.employeeId
        ? { connect: { id: req.user.employeeId } }
        : null,
    });

    return res.status(202).json({
      status: 202,
      message: "Update request submitted for approval",
      data: updateRequest,
    });
  } catch (err) {
    console.error("User update error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.approveUserUpdate = async (req, res) => {
  const { requestId } = req.params;

  try {
    const request = await prisma.userUpdateRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.status !== "PENDING") {
      return res
        .status(400)
        .json({ error: "Invalid or already processed request" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: request.userId },
      data: request.changes,
    });

    await prisma.userUpdateRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        reviewedByAdminId: req.user?.adminId || null,
        updatedAt: new Date(),
      },
    });

    await logAction({
      action: "APPROVED USER UPDATE",
      table: "User",
      targetId: request.userId,
      metadata: request.changes,
      loginActivity: req.user.loginActivityId
        ? { connect: { id: req.user.loginActivityId } }
        : null,
      admin: req.user?.adminId ? { connect: { id: req.user.adminId } } : null,
    });

    res.json({
      status: 200,
      message: "Update approved and applied",
      data: updatedUser,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.rejectUserUpdate = async (req, res) => {
  const { requestId } = req.params;

  try {
    const request = await prisma.userUpdateRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.status !== "PENDING") {
      return res
        .status(400)
        .json({ error: "Invalid or already processed request" });
    }

    await prisma.userUpdateRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        reviewedByAdminId: req.user?.adminId || null,
        updatedAt: new Date(),
      },
    });

    await logAction({
      action: "REJECTED USER UPDATE REQUEST",
      table: "User",
      targetId: request.userId,
      metadata: request.changes,
      loginActivity: req.user.loginActivityId
        ? { connect: { id: req.user.loginActivityId } }
        : null,
      admin: req.user?.adminId ? { connect: { id: req.user.adminId } } : null,
    });

    res.json({
      status: 200,
      message: "Update approved and applied",
      data: updatedUser,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
exports.getPendingUserUpdateRequests = async (req, res) => {
  try {
    const requests = await prisma.userUpdateRequest.findMany({
      include: {
        user: true,
        requestedByEmployee: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({ data: requests });
  } catch (err) {
    console.error("Fetch update requests error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getUserUpdateRequestById = async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await prisma.userUpdateRequest.findUnique({
      where: { id: requestId },
      include: {
        user: true,
        requestedByEmployee: true,
      },
    });

    if (!request) {
      return res.status(404).json({ error: "Update request not found" });
    }

    res.status(200).json({ data: request });
  } catch (err) {
    console.error("Get request detail error:", err);
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
