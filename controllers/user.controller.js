const prisma = require("../lib/prisma");
const twilio = require("twilio");
const logAction = require("../utils/adminLogger");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");
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
    dateOfBirth,
    maritalStatus,
    qualification,
    phone,
    officeNumber,
    email,
    isDefaulter,
    photo,
    photoIds = [],
    proofOfIncome,
    creditScore,
    profession,
    addresses = [], // Array of address objects
    proofOfIncomeImages = [],
    guarantors = [], // Array of guarantor objects
  } = req.body;

  if (!firstName || !phone) {
    return res.status(400).json({ error: "First name and phone are required" });
  }

  // Validate guarantors - minimum 2 required
  if (!guarantors || guarantors.length < 2) {
    return res.status(400).json({ error: "Minimum 2 guarantors are required" });
  }

  // Validate each guarantor has required fields
  for (let i = 0; i < guarantors.length; i++) {
    const g = guarantors[i];
    if (!g.name || !g.fatherName || !g.mobileNo || !g.address) {
      return res.status(400).json({
        error: `Guarantor ${i + 1}: name, fatherName, mobileNo, and address are required`
      });
    }
  }

  // Check for Aadhar in photoIds - at least one Aadhar is required
  const hasAadhar = photoIds.some(pid => {
    // Check if it's Aadhar by photoIdTypeId - we'll validate this later with the actual type
    return pid.photoIdNumber && pid.photoIdNumber.length === 12;
  });

  try {
    const matches = await prisma.user.findMany({
      where: {
        OR: [
          ...(photoIds.length > 0 ? [{
            photoIds: {
              some: {
                OR: photoIds.map((pid) => ({
                  photoIdTypeId: pid.photoIdTypeId,
                  photoIdNumber: pid.photoIdNumber,
                })),
              },
            }
          }] : []),
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ].filter(Boolean),
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
        error: "User already exists with this document or contact",
        users: matches,
      });
    }

    // Get region from first address if addresses provided
    let regionId = null;
    if (addresses && addresses.length > 0) {
      const firstAddress = addresses[0];
      const region = await prisma.region.findFirst({
        where: { stateId: firstAddress.stateId, cityId: firstAddress.cityId },
        select: { id: true },
      });
      regionId = region?.id || null;
    }

    // If no region found, use first available region
    if (!regionId) {
      const defaultRegion = await prisma.region.findFirst();
      regionId = defaultRegion?.id || null;
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
    const profilePhoto =
      photo && typeof photo === "object" && Object.keys(photo).length > 0
        ? await createFiles([photo])
        : [];

    const user = await prisma.user.create({
      data: {
        firstName,
        middleName,
        lastName,
        relationTypeId: relationTypeId,
        relationFirstName,
        relationMiddleName,
        relationLastName,
        dateOfBirth,
        phone,
        officeNumber,
        genderId: genderId,
        maritalStatus,
        email: email || null,
        isDefaulter: isDefaulter === "true" ? true : false,
        proofOfIncome,
        creditScore: creditScore ? parseInt(creditScore) : null,
        profession,
        qualification,
        regionId: regionId,
        createdBy: req.user?.type || "unknown",
        adminId: req.user?.adminId || null,
        employeeId: req.user?.employeeId || null,
        proofOfIncomeImages: { connect: proofIncomeImages },
        photoId: profilePhoto.length ? profilePhoto[0].id : null,
        photoIds: {
          create: await Promise.all(
            photoIds.map(async (pid) => ({
              photoIdNumber: pid.photoIdNumber,
              photoIdTypeId: pid.photoIdTypeId,
              images: {
                connect: await createFiles(pid.images || []),
              },
            }))
          ),
        },
        ...(addresses && addresses.length > 0 && {
          addresses: {
            create: addresses.map((addr) => ({
              addressCategoryId: addr.addressCategoryId,
              address: addr.address,
              country: addr.country,
              stateId: addr.stateId,
              cityId: addr.cityId,
              pincode: parseInt(addr.pincode),
            })),
          },
        }),
        // Create guarantors - stored separately, not in PhotoID table
        ...(guarantors && guarantors.length > 0 && {
          guarantors: {
            create: guarantors.map((g) => ({
              name: g.name,
              fatherName: g.fatherName,
              mobileNo: g.mobileNo,
              address: g.address,
              photoIdType1: g.photoIdType1 || null,
              photoIdNumber1: g.photoIdNumber1 || null,
              photoIdImages1: g.photoIdImages1 || null,
              photoIdType2: g.photoIdType2 || null,
              photoIdNumber2: g.photoIdNumber2 || null,
              photoIdImages2: g.photoIdImages2 || null,
            })),
          },
        }),
      },
      include: {
        photoIds: { include: { images: true } },
        proofOfIncomeImages: true,
        photo: true,
        region: true,
        gender: true,
        relationType: true,
        employee: true,
        admin: true,
        addresses: {
          include: {
            addressCategory: true,
            state: true,
            city: true,
          },
        },
        guarantors: true,
      },
    });

    await logAction({
      action: "CREATED USER",
      table: "User",
      targetId: user.id,
      metadata: user,
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.status(201).json({ message: "User created successfully", data: user });
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ error: "Failed to create user", details: err.message });
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
        ...(email ? [{ email: { contains: email, mode: "insensitive" } }] : []),
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
          gender: true,
          relationType: true,
          employee: true,
          photo: true,
          region: true,
          proofOfIncomeImages: true,
          loans: true,
          addresses: {
            include: {
              addressCategory: true,
              state: true,
              city: true,
            },
          },
          guarantors: true,
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

exports.getUserActivityLogs = async (req, res) => {
  try {
    const { id: userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    if (req.user?.type === "EMPLOYEE") {
      const allowed = await checkVerifyPermission(
        req.user,
        "USER_ACTIVITY_VIEW",
        {
          throwError: false,
        }
      );
      if (!allowed) {
        return res.status(403).json({ status: 403, message: "Access denied" });
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      prisma.actionLog.findMany({
        where: { targetId: userId, table: "User" },
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
        select: {
          id: true,
          action: true,
          metadata: true,
          createdAt: true,
          admin: {
            select: {
              id: true,
              name: true,
            },
          },
          employee: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.actionLog.count({ where: { targetId: userId, table: "User" } }),
    ]);

    res.json({
      status: 200,
      data: logs,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error("Get user activity logs error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch activity logs",
      error: error.message,
    });
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
        gender: true,
        relationType: true,
        employee: true,
        photo: true,
        region: true,
        proofOfIncomeImages: true,
        addresses: {
          include: {
            addressCategory: true,
            state: true,
            city: true,
          },
        },
        loans: {
          include: {
            loanType: true,
          },
        },
        guarantors: true,
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
    dateOfBirth,
    maritalStatus,
    qualification,
    phone,
    officeNumber,
    email,
    isDefaulter,
    photo,
    photoIds = [],
    proofOfIncome,
    creditScore,
    profession,
    addresses = [], // Array of address objects
    proofOfIncomeImages = [],
    guarantors = [], // Array of guarantor objects
  } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    // helper: create files, returns [{ id }]
    const createFiles = async (files = []) =>
      Promise.all(
        (files || []).map(async (file) => {
          if (!file) return null;
          if (file.id) return { id: file.id }; // already exists (db id)
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
      ).then(arr => arr.filter(Boolean));

    // Build region filter safely from first address, fall back to default
    let region = null;
    if (addresses && addresses.length > 0) {
      const firstAddress = addresses[0];
      const regionWhere = { stateId: firstAddress.stateId };
      if (firstAddress.cityId) regionWhere.cityId = firstAddress.cityId;

      region = await prisma.region.findFirst({ where: regionWhere });
      if (!region && firstAddress.stateId) {
        region = await prisma.region.findFirst({ where: { stateId: firstAddress.stateId } });
      }
      if (!region) {
        region = await prisma.region.findFirst();
      }
    }

    const parsedDOB =
      dateOfBirth ? new Date(dateOfBirth) : null;
    const dobValid = parsedDOB && !isNaN(parsedDOB.getTime()) ? parsedDOB : null;

    const isDefaulterBool =
      typeof isDefaulter === "boolean"
        ? isDefaulter
        : String(isDefaulter).toLowerCase() === "true";

    const creditScoreNum =
      creditScore === undefined || creditScore === null
        ? null
        : Number(creditScore);

    // Use a transaction for consistency
    const result = await prisma.$transaction(async (tx) => {
      const profilePhoto = photo ? await createFiles([photo]) : [];
      const proofIncomeFileLinks = await createFiles(proofOfIncomeImages);

      // Normalize photoIds: for each item, either update existing or create new,
      // and ALWAYS return { id } for connect.
      const formattedPhotoIds = await Promise.all(
        (photoIds || []).map(async (pid) => {
          const imagesToConnect = await createFiles(pid.images || []);

          if (pid.id) {
            // update existing PhotoID
            const updated = await tx.photoID.update({
              where: { id: pid.id },
              data: {
                photoIdNumber: pid.photoIdNumber ?? undefined,
                // set then connect to replace images (if that's desired)
                images: imagesToConnect?.length
                  ? { set: [], connect: imagesToConnect }
                  : undefined,
                // use relation field consistently
                ...(pid.photoIdTypeId
                  ? { photoIdType: { connect: { id: pid.photoIdTypeId } } }
                  : {}),
              },
              select: { id: true },
            });
            return { id: updated.id };
          }

          // create new PhotoID
          const created = await tx.photoID.create({
            data: {
              photoIdNumber: pid.photoIdNumber,
              ...(pid.photoIdTypeId
                ? { photoIdType: { connect: { id: pid.photoIdTypeId } } }
                : {}),
              images: imagesToConnect?.length
                ? { connect: imagesToConnect }
                : undefined,
            },
            select: { id: true },
          });
          return { id: created.id };
        })
      );

      const updatedUser = await tx.user.update({
        where: { id },
        data: {
          firstName,
          middleName,
          lastName,
          relationFirstName,
          relationMiddleName,
          relationLastName,
          dateOfBirth: dobValid,
          phone,
          email,
          isDefaulter: isDefaulterBool,
          proofOfIncome,
          creditScore: creditScoreNum,
          profession,
          maritalStatus,
          qualification,
          officeNumber,

          relationType: relationTypeId ? { connect: { id: relationTypeId } } : undefined,
          gender:        genderId      ? { connect: { id: genderId } }       : undefined,
          region:        region ? { connect: { id: region.id } } : undefined,

          // Replace all proofOfIncomeImages with provided set
          ...(proofIncomeFileLinks?.length
            ? { proofOfIncomeImages: { set: [], connect: proofIncomeFileLinks } }
            : {}),

          photo: profilePhoto?.length
            ? { connect: { id: profilePhoto[0].id } }
            : undefined,

          // Connect (and only connect) the PhotoIDs we created/updated above
          ...(formattedPhotoIds?.length
            ? { photoIds: { connect: formattedPhotoIds } }
            : {}),

          // Update addresses: delete all existing and create new ones
          ...(addresses?.length
            ? {
                addresses: {
                  deleteMany: {},
                  create: addresses.map((addr) => ({
                    addressCategoryId: addr.addressCategoryId,
                    address: addr.address,
                    country: addr.country,
                    stateId: addr.stateId,
                    cityId: addr.cityId,
                    pincode: parseInt(addr.pincode),
                  })),
                },
              }
            : {}),

          // Update guarantors: delete all existing and create new ones
          ...(guarantors?.length
            ? {
                guarantors: {
                  deleteMany: {},
                  create: guarantors.map((g) => ({
                    name: g.name,
                    fatherName: g.fatherName,
                    mobileNo: g.mobileNo,
                    address: g.address,
                    photoIdType1: g.photoIdType1 || null,
                    photoIdNumber1: g.photoIdNumber1 || null,
                    photoIdImages1: g.photoIdImages1 || null,
                    photoIdType2: g.photoIdType2 || null,
                    photoIdNumber2: g.photoIdNumber2 || null,
                    photoIdImages2: g.photoIdImages2 || null,
                  })),
                },
              }
            : {}),
        },
        include: {
          photoIds: { include: { images: true, photoIdType: true } },
          photo: true,
          proofOfIncomeImages: true,
          addresses: {
            include: {
              addressCategory: true,
              state: true,
              city: true,
            },
          },
          guarantors: true,
        },
      });

      await logAction({
        action: "UPDATED USER",
        table: "User",
        targetId: updatedUser.id,
        metadata: req.body,
        loginActivityId: req.user.loginActivityId,
        adminId: req.user?.adminId,
        employeeId: req.user?.employeeId,
      });

      return updatedUser;
    },
  { maxWait: 10_000, timeout: 30_000 } );

    return res.status(200).json({
      status: 200,
      message: "User updated successfully",
      data: result,
    });
  } catch (err) {
    console.error("User update error:", err);
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
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
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
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    res.json({
      status: 200,
      message: "Update request rejected",
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

exports.patchUser = async (req, res) => {
  const { id } = req.params;
  const body = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const createFiles = async (files = []) =>
      Promise.all(
        (files || []).map(async (file) => {
          if (!file) return null;
          if (file.id) return { id: file.id };
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
      ).then((arr) => arr.filter(Boolean));

    // Build only the fields that were sent
    const data = {};

    const scalarFields = [
      "firstName", "middleName", "lastName",
      "relationFirstName", "relationMiddleName", "relationLastName",
      "dateOfBirth", "maritalStatus", "qualification",
      "phone", "officeNumber", "email",
      "proofOfIncome", "profession",
    ];
    for (const field of scalarFields) {
      if (field in body) {
        if (field === "dateOfBirth") {
          const d = new Date(body.dateOfBirth);
          data.dateOfBirth = isNaN(d.getTime()) ? null : d;
        } else {
          data[field] = body[field] ?? null;
        }
      }
    }

    if ("isDefaulter" in body) {
      data.isDefaulter =
        typeof body.isDefaulter === "boolean"
          ? body.isDefaulter
          : String(body.isDefaulter).toLowerCase() === "true";
    }

    if ("creditScore" in body) {
      data.creditScore =
        body.creditScore === undefined || body.creditScore === null || body.creditScore === ""
          ? null
          : Number(body.creditScore);
    }

    if ("genderId" in body && body.genderId) {
      data.gender = { connect: { id: body.genderId } };
    }
    if ("relationTypeId" in body && body.relationTypeId) {
      data.relationType = { connect: { id: body.relationTypeId } };
    }

    if ("photo" in body && body.photo) {
      const [photoFile] = await createFiles([body.photo]);
      if (photoFile) data.photo = { connect: { id: photoFile.id } };
    }

    if ("proofOfIncomeImages" in body) {
      const links = await createFiles(body.proofOfIncomeImages || []);
      if (links.length) data.proofOfIncomeImages = { set: [], connect: links };
    }

    if ("photoIds" in body && Array.isArray(body.photoIds)) {
      const formatted = await Promise.all(
        body.photoIds.map(async (pid) => {
          const imgs = await createFiles(pid.images || []);
          if (pid.id) {
            return prisma.photoID.update({
              where: { id: pid.id },
              data: {
                photoIdNumber: pid.photoIdNumber ?? undefined,
                ...(pid.photoIdTypeId ? { photoIdType: { connect: { id: pid.photoIdTypeId } } } : {}),
                ...(imgs.length ? { images: { set: [], connect: imgs } } : {}),
              },
              select: { id: true },
            });
          }
          return prisma.photoID.create({
            data: {
              photoIdNumber: pid.photoIdNumber,
              ...(pid.photoIdTypeId ? { photoIdType: { connect: { id: pid.photoIdTypeId } } } : {}),
              ...(imgs.length ? { images: { connect: imgs } } : {}),
            },
            select: { id: true },
          });
        })
      );
      data.photoIds = { connect: formatted };
    }

    if ("addresses" in body && Array.isArray(body.addresses) && body.addresses.length > 0) {
      // Resolve region from first address
      let region = null;
      const first = body.addresses[0];
      if (first.stateId) {
        region = await prisma.region.findFirst({
          where: { stateId: first.stateId, ...(first.cityId ? { cityId: first.cityId } : {}) },
        });
        if (!region) region = await prisma.region.findFirst({ where: { stateId: first.stateId } });
        if (!region) region = await prisma.region.findFirst();
      }
      if (region) data.region = { connect: { id: region.id } };

      data.addresses = {
        deleteMany: {},
        create: body.addresses.map((addr) => ({
          addressCategoryId: addr.addressCategoryId,
          address: addr.address,
          country: addr.country,
          stateId: addr.stateId,
          cityId: addr.cityId,
          pincode: parseInt(addr.pincode),
        })),
      };
    }

    if ("guarantors" in body && Array.isArray(body.guarantors) && body.guarantors.length > 0) {
      data.guarantors = {
        deleteMany: {},
        create: body.guarantors.map((g) => ({
          name: g.name,
          fatherName: g.fatherName,
          mobileNo: g.mobileNo,
          address: g.address,
          photoIdType1: g.photoIdType1 || null,
          photoIdNumber1: g.photoIdNumber1 || null,
          photoIdImages1: g.photoIdImages1 || null,
          photoIdType2: g.photoIdType2 || null,
          photoIdNumber2: g.photoIdNumber2 || null,
          photoIdImages2: g.photoIdImages2 || null,
        })),
      };
    }

    if (Object.keys(data).length === 0) {
      return res.status(200).json({ status: 200, message: "No changes detected", data: user });
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      include: {
        photoIds: { include: { images: true, photoIdType: true } },
        photo: true,
        proofOfIncomeImages: true,
        addresses: { include: { addressCategory: true, state: true, city: true } },
        guarantors: true,
        gender: true,
        relationType: true,
        region: true,
      },
    });

    await logAction({
      action: "PATCHED USER",
      table: "User",
      targetId: updated.id,
      metadata: body,
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    return res.status(200).json({ status: 200, message: "User updated successfully", data: updated });
  } catch (err) {
    console.error("Patch user error:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
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
