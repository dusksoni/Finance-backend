const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

// ─── Per-step backend validation ─────────────────────────────────────────────
// Returns an array of error strings, empty if valid.
const validateStep = (stepNum, data) => {
  const errors = [];
  if (!data || typeof data !== "object") return errors;

  if (stepNum === 1) {
    if (!data.firstName?.trim()) errors.push("First name is required.");
    if (!data.genderId?.trim()) errors.push("Gender is required.");
    if (!data.dateOfBirth) {
      errors.push("Date of birth is required.");
    } else {
      const dob = new Date(data.dateOfBirth);
      const minDate = new Date();
      minDate.setFullYear(minDate.getFullYear() - 18);
      if (dob > minDate) errors.push("Must be at least 18 years old.");
    }
    if (!data.qualification?.trim()) errors.push("Qualification is required.");
    if (data.isDefaulter === undefined || data.isDefaulter === null || data.isDefaulter === "")
      errors.push("Defaulter status is required.");
    if (data.creditScore !== undefined && data.creditScore !== null && data.creditScore !== "") {
      const cs = Number(data.creditScore);
      if (isNaN(cs) || cs < 300 || cs > 900)
        errors.push("Credit score must be between 300 and 900.");
    }
  }

  if (stepNum === 2) {
    if (!data.phone?.trim()) {
      errors.push("Phone is required.");
    } else if (!/^[6-9]\d{9}$/.test(data.phone)) {
      errors.push("Enter a valid Indian mobile number.");
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      errors.push("Invalid email format.");
    if (data.officeNumber && !/^[0-9]{6,15}$/.test(data.officeNumber))
      errors.push("Enter a valid office number.");
    if (!data.relationTypeId?.trim()) errors.push("Relation type is required.");
    if (!data.relationFirstName?.trim()) errors.push("Relation first name is required.");
  }

  if (stepNum === 3) {
    if (!Array.isArray(data.photoIds) || data.photoIds.length < 2)
      errors.push("At least two Photo IDs are required.");
    else {
      data.photoIds.forEach((pid, i) => {
        if (!pid.photoIdTypeId?.trim())
          errors.push(`Photo ID ${i + 1}: type is required.`);
        if (!pid.photoIdNumber?.trim())
          errors.push(`Photo ID ${i + 1}: number is required.`);
        if (!Array.isArray(pid.images) || pid.images.length === 0)
          errors.push(`Photo ID ${i + 1}: at least one image is required.`);
      });
    }
  }

  if (stepNum === 4) {
    if (!Array.isArray(data.addresses) || data.addresses.length === 0)
      errors.push("At least one address is required.");
    else {
      data.addresses.forEach((addr, i) => {
        if (!addr.addressCategoryId?.trim())
          errors.push(`Address ${i + 1}: category is required.`);
        if (!addr.address?.trim())
          errors.push(`Address ${i + 1}: address is required.`);
        if (!addr.country?.trim())
          errors.push(`Address ${i + 1}: country is required.`);
        if (!addr.stateId?.trim())
          errors.push(`Address ${i + 1}: state is required.`);
        if (!addr.cityId?.trim())
          errors.push(`Address ${i + 1}: city is required.`);
        if (!addr.pincode && addr.pincode !== 0)
          errors.push(`Address ${i + 1}: pin code is required.`);
        else if (isNaN(Number(addr.pincode)))
          errors.push(`Address ${i + 1}: pin code must be a number.`);
      });
    }
  }

  if (stepNum === 5) {
    if (!Array.isArray(data.guarantors) || data.guarantors.length < 2)
      errors.push("At least two guarantors are required.");
    else {
      data.guarantors.forEach((g, i) => {
        if (!g.name?.trim()) errors.push(`Guarantor ${i + 1}: name is required.`);
        if (!g.fatherName?.trim()) errors.push(`Guarantor ${i + 1}: father name is required.`);
        if (!g.mobileNo?.trim()) {
          errors.push(`Guarantor ${i + 1}: mobile number is required.`);
        } else if (!/^[6-9]\d{9}$/.test(g.mobileNo)) {
          errors.push(`Guarantor ${i + 1}: enter a valid mobile number.`);
        }
        if (!g.address?.trim()) errors.push(`Guarantor ${i + 1}: address is required.`);
      });
    }
  }

  return errors;
};

const clampStep = (step) => {
  const parsed = Number(step);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(Math.floor(parsed), 1), 5);
};

const resolveCreator = (req) => {
  const isAdmin = req.user?.type === "ADMIN";
  return {
    isAdmin,
    adminId: isAdmin ? req.user?.adminId : null,
    employeeId: !isAdmin ? req.user?.employeeId : null,
  };
};

const buildCreatorFilter = (creator) => {
  if (creator.isAdmin) return { createdByAdminId: creator.adminId };
  return { createdByEmployeeId: creator.employeeId };
};

const normalizeDraftData = (data) => {
  if (!data || typeof data !== "object") return null;
  return data;
};

exports.getDrafts = async (req, res) => {
  try {
    const creator = resolveCreator(req);
    const creatorFilter = buildCreatorFilter(creator);

    const drafts = await prisma.userApplicationDraft.findMany({
      where: { status: "DRAFT", ...creatorFilter },
      orderBy: { updatedAt: "desc" },
    });

    return res.status(200).json({ status: 200, data: drafts });
  } catch (error) {
    console.error("User application drafts list error:", error);
    return res.status(500).json({
      status: 500,
      error: "Failed to fetch user application drafts",
      message: error.message,
    });
  }
};

exports.createDraft = async (req, res) => {
  try {
    const { data, step } = req.body || {};
    const creator = resolveCreator(req);

    const nextStep = clampStep(step);
    const nextData = normalizeDraftData(data);
    console.log("data", data)

    const created = await prisma.userApplicationDraft.create({
      data: {
        status: "DRAFT",
        step: nextStep,
        data: nextData,
        createdByAdmin: creator.adminId
          ? { connect: { id: creator.adminId } }
          : undefined,
        createdByEmployee: creator.employeeId
          ? { connect: { id: creator.employeeId } }
          : undefined,
      },
    });

    return res.status(201).json({ status: 201, data: created });
  } catch (error) {
    console.error("User application draft create error:", error);
    return res.status(500).json({
      status: 500,
      error: "Failed to create user application draft",
      message: error.message,
    });
  }
};

exports.getDraft = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ status: 400, error: "Draft id required" });
    }

    const creator = resolveCreator(req);

    const draft = await prisma.userApplicationDraft.findUnique({
      where: { id },
    });

    if (draft) {
      const isCreatorMatch = creator.isAdmin
        ? draft.createdByAdminId === creator.adminId
        : draft.createdByEmployeeId === creator.employeeId;
      if (!isCreatorMatch) {
        return res.status(404).json({ status: 404, error: "Draft not found" });
      }
    }

    if (!draft) {
      return res.status(404).json({ status: 404, error: "Draft not found" });
    }

    return res.status(200).json({ status: 200, data: draft });
  } catch (error) {
    console.error("User application draft fetch error:", error);
    return res.status(500).json({
      status: 500,
      error: "Failed to fetch user application draft",
      message: error.message,
    });
  }
};

// Validate unique fields coming in at each step against the existing User table.
// Returns an error message string if a conflict is found, null otherwise.
const validateUnique = async (stepNum, incoming) => {
  if (stepNum === 2 && incoming.phone) {
    const conflict = await prisma.user.findUnique({
      where: { phone: incoming.phone },
      select: { id: true },
    });
    if (conflict)
      return "This phone number is already registered to another user.";
  }

  if (stepNum === 3 && Array.isArray(incoming.photoIds)) {
    for (const pid of incoming.photoIds) {
      if (!pid.photoIdNumber) continue;
      const conflict = await prisma.photoID.findUnique({
        where: { photoIdNumber: pid.photoIdNumber },
        select: { id: true },
      });
      if (conflict) {
        return `ID number "${pid.photoIdNumber}" is already registered to another user.`;
      }
    }
  }

  return null;
};

exports.updateStep = async (req, res) => {
  try {
    const { id, step } = req.params;
    if (!id) {
      return res.status(400).json({ status: 400, error: "Draft id required" });
    }

    const existing = await prisma.userApplicationDraft.findUnique({
      where: { id },
    });

    const nextStep = clampStep(step);
    const incoming = normalizeDraftData(req.body?.data);

    if (!existing) {
      // Draft was deleted or never existed — create a fresh one and continue
      const creator = resolveCreator(req);
      const currentData = incoming || {};
      const created = await prisma.userApplicationDraft.create({
        data: {
          status: "DRAFT",
          step: nextStep,
          data: currentData,
          createdByAdmin: creator.adminId
            ? { connect: { id: creator.adminId } }
            : undefined,
          createdByEmployee: creator.employeeId
            ? { connect: { id: creator.employeeId } }
            : undefined,
        },
      });
      return res.status(200).json({ status: 200, data: created });
    }
    const currentData =
      existing.data && typeof existing.data === "object" ? existing.data : {};
    const merged = incoming ? { ...currentData, ...incoming } : currentData;

    // Run per-step field validation
    if (incoming) {
      const stepErrors = validateStep(nextStep, incoming);
      if (stepErrors.length > 0) {
        return res.status(422).json({ status: 422, error: stepErrors[0], errors: stepErrors });
      }
    }

    // Run uniqueness validation for steps that carry unique fields
    if (incoming) {
      const uniqueError = await validateUnique(nextStep, incoming);
      if (uniqueError) {
        return res
          .status(409)
          .json({ status: 409, error: uniqueError, message: uniqueError });
      }
    }

    const updated = await prisma.userApplicationDraft.update({
      where: { id },
      data: {
        step: Math.max(existing.step, nextStep),
        data: merged,
      },
    });

    return res.status(200).json({ status: 200, data: updated });
  } catch (error) {
    console.error("User application draft update error:", error);
    return res.status(500).json({
      status: 500,
      error: "Failed to update user application draft",
      message: error.message,
    });
  }
};

exports.submitDraft = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ status: 400, error: "Draft id required" });
    }

    const existing = await prisma.userApplicationDraft.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ status: 404, error: "Draft not found" });
    }

    // All data is already in the draft from per-step saves — no extra data needed
    const merged =
      existing.data && typeof existing.data === "object" ? existing.data : {};

    // Validate all steps before proceeding
    const allErrors = [];
    for (let s = 1; s <= 5; s++) {
      const errs = validateStep(s, merged);
      allErrors.push(...errs);
    }
    if (allErrors.length > 0) {
      return res.status(422).json({ status: 422, error: allErrors[0], errors: allErrors });
    }

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
      addresses = [],
      proofOfIncomeImages = [],
      guarantors = [],
    } = merged;

    // Get region from first address (outside transaction — read-only)
    let regionId = null;
    if (addresses.length > 0) {
      const region = await prisma.region.findFirst({
        where: { stateId: addresses[0].stateId, cityId: addresses[0].cityId },
        select: { id: true },
      });
      regionId = region?.id || null;
    }
    if (!regionId) {
      const defaultRegion = await prisma.region.findFirst();
      regionId = defaultRegion?.id || null;
    }

    const user = await prisma.$transaction(async (tx) => {
      const createFiles = async (files = []) =>
        Promise.all(
          files.map((file) =>
            tx.file.create({
              data: {
                url: file.secure_url || file.url,
                publicId: file.public_id || file.publicId,
                resourceType: file.resource_type || file.resourceType,
                format: file.format,
              },
            }),
          ),
        ).then((created) => created.map((f) => ({ id: f.id })));

      const proofIncomeImages = await createFiles(proofOfIncomeImages);
      const profilePhoto =
        photo && typeof photo === "object" && Object.keys(photo).length > 0
          ? await createFiles([photo])
          : [];
      const photoIdImageConnects = await Promise.all(
        photoIds.map(async (pid) => ({
          photoIdNumber: pid.photoIdNumber,
          photoIdTypeId: pid.photoIdTypeId,
          images: { connect: await createFiles(pid.images || []) },
        })),
      );

      const createdUser = await tx.user.create({
        data: {
          firstName,
          middleName,
          lastName,
          relationTypeId,
          relationFirstName,
          relationMiddleName,
          relationLastName,
          dateOfBirth,
          phone,
          officeNumber,
          genderId,
          maritalStatus,
          email: email || null,
          isDefaulter: isDefaulter === "true" || isDefaulter === true,
          proofOfIncome,
          creditScore: creditScore ? parseInt(creditScore) : null,
          profession,
          qualification,
          regionId,
          createdBy: req.user?.type || "unknown",
          adminId: req.user?.adminId || null,
          employeeId: req.user?.employeeId || null,
          proofOfIncomeImages: { connect: proofIncomeImages },
          photoId: profilePhoto.length ? profilePhoto[0].id : null,
          photoIds: { create: photoIdImageConnects },
          ...(addresses.length > 0 && {
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
          ...(guarantors.length > 0 && {
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
          addresses: {
            include: { addressCategory: true, state: true, city: true },
          },
          guarantors: true,
        },
      });

      await tx.userApplicationDraft.delete({ where: { id } });
      return createdUser;
    }, { timeout: 60000 });

    await logAction({
      action: "CREATED USER",
      message: `User ${user.firstName} ${user.lastName} (ID: ${user.id}) created.`,
      table: "User",
      targetId: user.id,
      metadata: { draftId: id, userId: user.id },
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    return res.status(201).json({ status: 201, data: { user } });
  } catch (error) {
    console.error("User application draft submit error:", error);
    return res.status(500).json({
      status: 500,
      error: error.message,
    });
  }
};

exports.deleteDraft = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ status: 400, error: "Draft id required" });
    }

    const creator = resolveCreator(req);
    const draft = await prisma.userApplicationDraft.findUnique({
      where: { id },
    });

    if (!draft) {
      return res.status(404).json({ status: 404, error: "Draft not found" });
    }

    const isCreatorMatch = creator.isAdmin
      ? draft.createdByAdminId === creator.adminId
      : draft.createdByEmployeeId === creator.employeeId;

    if (!isCreatorMatch) {
      return res
        .status(403)
        .json({ status: 403, error: "Not authorized to delete this draft" });
    }

    await prisma.userApplicationDraft.delete({ where: { id } });

    return res.status(200).json({ status: 200, message: "Draft deleted" });
  } catch (error) {
    console.error("User application draft delete error:", error);
    return res.status(500).json({
      status: 500,
      error: "Failed to delete user application draft",
      message: error.message,
    });
  }
};
