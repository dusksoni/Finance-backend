const prisma = require("../lib/prisma");
const {
  addMonths,
  setDate,
  isAfter,
  differenceInDays,
  getMonth,
  getYear,
  startOfMonth,
  isBefore,
  addYears,
} = require("date-fns");
const logAction = require("../utils/adminLogger");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");

exports.createCease = async (req, res) => {
  try {
    const { loanId } = req.params;
    const {
      assignedToId,      // employee id to assign the cease job to (optional)
      comment,
      ceaseDate,
      files = [],        // [{ secure_url, public_id, resource_type?, format? }]
      status = "PENDING",
      priority = "MEDIUM",
      dueDate,
      assetCondition,
    } = req.body;

    if (!loanId) {
      return res.status(400).json({ status: 400, success: false, message: "Loan ID is required" });
    }

    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) {
      return res.status(404).json({ status: 404, success: false, message: "Loan not found" });
    }

    // Prevent duplicate active cease
    const existingCease = await prisma.ceaseHistory.findFirst({
      where: { loanId, status: { in: ["PENDING", "COMPLETED"] } },
    });
    if (existingCease) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: `This loan already has an active cease request with status: ${existingCease.status}`,
      });
    }

    // Only ACTIVE or DEFAULTED can be ceased (tweak if you allow OVERDUE)
    if (loan.fileStatus !== "ACTIVE" && loan.fileStatus !== "DEFAULTED") {
      return res.status(400).json({
        status: 400,
        success: false,
        message: "Only active or defaulted loans can be ceased",
      });
    }

    // Who is assigning?
    const userType = req.user?.type;
    const adminId = userType === "ADMIN" ? req.user?.adminId ?? null : null;
    const employeeId = userType === "EMPLOYEE" ? req.user?.employeeId ?? null : null;
    if (!adminId && !employeeId) {
      return res.status(403).json({ status: 403, message: "Unauthorized" });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1) Upload files (optional)
      let fileRecords = [];
      if (Array.isArray(files) && files.length) {
        fileRecords = await Promise.all(
          files.map((f) =>
            tx.file.create({
              data: {
                url: f.secure_url,
                publicId: f.public_id,
                resourceType: f.resource_type || "image",
                format: f.format || null,
              },
            })
          )
        );
      }

      const ceaseHistory = await tx.ceaseHistory.create({
        data: {
        loan: { connect: { id: loan.id } },
        ceaseDate: ceaseDate ? new Date(ceaseDate) : new Date(),
        comment: comment ?? null,
        status,
        priority,
        dueDate: dueDate ? new Date(dueDate) : null,
        assetCondition: assetCondition ?? null,
        assignedByAdmin: adminId ? { connect: { id: adminId } } : {},
        assignedByEmployee: employeeId ? { connect: { id: employeeId } } : {},
        assignedTo: assignedToId ? { connect: { id: assignedToId } } : {},
        ...(fileRecords.length
          ? { files: { connect: fileRecords.map((fr) => ({ id: fr.id })) } }
          : {}),
    }});

      // 3) Update loan status (only fields that exist on your Loan model)
      await tx.loan.update({
        where: { id: loan.id },
        data: { fileStatus: "CEASED_INITIATED" },
      });

      // 4) Action log
      await tx.actionLog.create({
        data: {
          action: "CREATE_CEASE_REQUEST",
          targetId: ceaseHistory.id,
          table: "CeaseHistory",
          metadata: {
            loanId: loan.id,
            assignedToId: assignedToId ?? null,
            status,
            priority,
            ceaseDate: ceaseHistory.ceaseDate,
            fileIds: fileRecords.map((f) => f.id),
          },
          adminId: adminId,
          employeeId: employeeId,
        },
      });

      return ceaseHistory;
    });

    return res.status(200).json({
      status: 200,
      message: "Asset cease request created",
      data: result,
    });
  } catch (error) {
    console.error("Cease asset error:", error);
    return res.status(500).json({
      status: 500,
      message: "Failed to create cease asset record",
      error: error.message,
    });
  }
};

exports.completeCease = async (req, res) => {
  try {
    const { id } = req.params; // CeaseHistory ID
    const { 
      files = [], 
      actualCeaseDate, 
      ceaseAddress,
      ceaseLat,
      ceaseLng,
      assetCondition
    } = req.body;

    // Validation
    if (!id) {
      return res.status(400).json({ 
        status: 400, 
        message: "CeaseHistory ID required" 
      });
    }

    // Check if cease record exists
    const ceaseRecord = await prisma.ceaseHistory.findUnique({
      where: { id },
    });

    if (!ceaseRecord) {
      return res.status(404).json({ 
        status: 404, 
        message: "Cease record not found" 
      });
    }

    // Check if cease is already completed or released
    if (ceaseRecord.status === "COMPLETED") {
      return res.status(400).json({ 
        status: 400, 
        message: "This cease record is already marked as completed" 
      });
    }

    if (ceaseRecord.status === "RELEASED") {
      return res.status(400).json({ 
        status: 400, 
        message: "Cannot complete a released cease record" 
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create new files (if any)
      let fileRecords = [];
      if (files.length) {
        fileRecords = await Promise.all(
          files.map(f => tx.file.create({
            data: {
              url: f.secure_url, publicId: f.public_id,
              resourceType: f.resource_type, format: f.format
            }
          }))
        );
      }

      // Get current files and append
      const current = await tx.ceaseHistory.findUnique({
        where: { id },
        select: { files: { select: { id: true } } }
      });

      // Update cease (append new files to existing)
      const updatedCease = await tx.ceaseHistory.update({
        where: { id },
        data: {
          status: "COMPLETED",
          assetCondition: assetCondition || undefined,
          actualCeaseDate: new Date(actualCeaseDate) || new Date(),
          ceaseAddress: ceaseAddress || undefined,
          ceaseLat: ceaseLat || undefined,
          ceaseLng: ceaseLng || undefined,
          ceasedBy: { connect: { id: req.user.employeeId } },
          files: { connect: [...current.files, ...fileRecords].map(f => ({ id: f.id })) },
        },
        include: { files: true, ceasedBy: true }
      });

      // Log action (optional)
      await tx.actionLog.create({
        data: {
          action: "COMPLETE_CEASE_REQUEST",
          targetId: id,
          table: "CeaseHistory",
          metadata: updatedCease,
          employeeId: { connect: { id: req.user.employeeId } },
        },
      });

      return updatedCease;
    });

    res.json({ status: 200, message: "Cease marked as completed", data: result });
  } catch (error) {
    res.status(500).json({ status: 500, message: "Cease completion failed", error: error.message });
  }
};

exports.releaseCeasedAsset = async (req, res) => {
  try {
    const { id } = req.params; // CeaseHistory ID
    const { releaseReason, files = [] } = req.body;

    if (!id) {
      return res.status(400).json({ 
        status: 400, 
        message: "CeaseHistory ID required" 
      });
    }
    
    // Check if cease record exists
    const ceaseRecord = await prisma.ceaseHistory.findUnique({
      where: { id },
    });

    if (!ceaseRecord) {
      return res.status(404).json({ 
        status: 404, 
        message: "Cease record not found" 
      });
    }

    // Check if cease is already released
    if (ceaseRecord.status === "RELEASED") {
      return res.status(400).json({ 
        status: 400, 
        message: "This cease record is already released" 
      });
    }

    // Check if cease is completed (can only release completed cease)
    if (ceaseRecord.status !== "COMPLETED") {
      return res.status(400).json({ 
        status: 400, 
        message: "Only completed cease records can be released" 
      });
    }

    if (!releaseReason) {
      return res.status(400).json({ 
        status: 400, 
        message: "Release reason is required" 
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create new files for release (if any)
      let fileRecords = [];
      if (files.length) {
        fileRecords = await Promise.all(
          files.map(f => tx.file.create({
            data: {
              url: f.secure_url, publicId: f.public_id,
              resourceType: f.resource_type, format: f.format
            }
          }))
        );
      }

      // Get current releaseFiles and append
      const current = await tx.ceaseHistory.findUnique({
        where: { id },
        select: { releaseFiles: { select: { id: true } } }
      });

      // Determine who is releasing the asset
      let releasedByAdminId = undefined;
      let releasedByEmployeeId = undefined;
      
      if (req.user.type === "ADMIN") {
        releasedByAdminId = { connect: { id: req.user.adminId } };
      } else if (req.user.type === "EMPLOYEE") {
        releasedByEmployeeId = { connect: { id: req.user.employeeId } };
      }

      // Update cease (append release files to existing)
      const updatedCease = await tx.ceaseHistory.update({
        where: { id },
        data: {
          status: "RELEASED",
          releaseDate: new Date(),
          releaseReason,
          releasedByAdminId,
          releasedByEmployeeId,
          updatedAt: new Date(),
          releaseFiles: { connect: [...current.releaseFiles, ...fileRecords].map(f => ({ id: f.id })) },
        },
        include: { releaseFiles: true, releasedByAdmin: true, releasedByEmployee: true }
      });

      // Set loan file status to RELEASED
      await tx.loan.update({ where: { id: updatedCease.loanId }, data: { fileStatus: "RELEASED" } });

      // Log action
      await tx.actionLog.create({
        data: {
          action: "RELEASE_CEASED_ASSET",
          targetId: id,
          table: "CeaseHistory",
          metadata: updatedCease,
        },
      });

      return updatedCease;
    });

    res.json({ status: 200, message: "Asset released", data: result });
  } catch (error) {
    res.status(500).json({ status: 500, message: "Release failed", error: error.message });
  }
};

// Create a contact attempt for a cease
exports.addCeaseContactAttempt = async (req, res) => {
  try {
    const { id } = req.params; // ceaseHistoryId
    const {
      contactAt,            // optional; default now
      contactType,          // "CALL" | "VISIT" | "SMS" | "WHATSAPP" | "EMAIL"
      callOutcome,          // "PICKED" | "UNREACHABLE" | "SWITCHED_OFF" | "NOT_ANSWERED" | null
      summary,              // free text
      spokeTo,              // free text: who you spoke to
      phoneUsed,            // number used
      durationSeconds,      // call duration if any
    } = req.body;

    const cease = await prisma.ceaseHistory.findUnique({ where: { id } });
    if (!cease) return res.status(404).json({ status: 404, message: "Cease not found" });

    const adminId    = req.user?.type === "ADMIN"    ? req.user?.adminId    ?? null : null;
    const employeeId = req.user?.type === "EMPLOYEE" ? req.user?.employeeId ?? null : null;

    const created = await prisma.ceaseContactAttempt.create({
      data: {
        ceaseHistoryId: id,
        contactAt: contactAt ? new Date(contactAt) : new Date(),
        contactType: contactType || "CALL",
        callOutcome: callOutcome || null,
        summary: summary || null,
        spokeTo: spokeTo || null,
        phoneUsed: phoneUsed || null,
        durationSeconds: durationSeconds || null,
        createdByAdminId: adminId,
        createdByEmployeeId: employeeId,
      },
    });

    // return with derived count + last attempt date
    const [attemptCount, lastAttempt] = await Promise.all([
      prisma.ceaseContactAttempt.count({ where: { ceaseHistoryId: id } }),
      prisma.ceaseContactAttempt.findFirst({
        where: { ceaseHistoryId: id },
        orderBy: { contactAt: "desc" },
        select: { contactAt: true },
      }),
    ]);

    return res.json({
      status: 200,
      message: "Contact attempt added",
      data: {
        attempt: created,
        _derived: {
          contactAttemptsCount: attemptCount,
          lastContactAttemptDate: lastAttempt?.contactAt ?? null,
        },
      },
    });
  } catch (error) {
    console.error("addCeaseContactAttempt error:", error);
    return res.status(500).json({ status: 500, message: "Failed to add contact attempt", error: error.message });
  }
};

// List contact attempts for a cease
exports.listCeaseContactAttempts = async (req, res) => {
  try {
    const { id } = req.params; // ceaseHistoryId
    const attempts = await prisma.ceaseContactAttempt.findMany({
      where: { ceaseHistoryId: id },
      orderBy: { contactAt: "desc" },
    });
    return res.json({ status: 200, data: attempts });
  } catch (error) {
    console.error("listCeaseContactAttempts error:", error);
    return res.status(500).json({ status: 500, message: "Failed to fetch attempts", error: error.message });
  }
};



exports.getLoanCeaseHistory = async (req, res) => {
  try {
    const { loanId } = req.params;
    const ceaseList = await prisma.ceaseHistory.findMany({
      where: { loanId },
      orderBy: { createdAt: "desc" },
      include: {
        files: true,
        releaseFiles: true,
        assignedByAdmin: true,
        assignedByEmployee: true,
        assignedTo: true,
        ceasedBy: true,
        contactAttempts: true,
        loan: {
          include: {
            user: true,
          }
        }
      },
    });
    res.json({ status: 200, data: ceaseList });
  } catch (error) {
    res
      .status(500)
      .json({
        status: 500,
        message: "Failed to fetch cease records",
        error: error.message,
      });
  }
};

exports.getCeaseById = async (req, res) => {
  try {
    const { id } = req.params;
    const cease = await prisma.ceaseHistory.findUnique({
      where: { id },
      include: {
        files: true,
        releaseFiles: true,
        assignedByAdmin: true,
        assignedByEmployee: true,
        assignedTo: true,
        ceasedBy: true,
        contactAttempts: true,
      },
    });
    if (!cease)
      return res.status(404).json({ status: 404, message: "Cease not found" });
    res.status(200).json({ status: 200, data: cease });
  } catch (error) {
    res
      .status(500)
      .json({
        status: 500,
        message: "Failed to fetch cease",
        error: error.message,
      });
  }
};

exports.getAllCeaseHistories = async (req, res) => {
  try {
    console.log("object")
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.ceaseHistory.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          files: true,
          releaseFiles: true,
          assignedByAdmin: true,
          assignedByEmployee: true,
          assignedTo: true,
          contactAttempts: true,
          ceasedBy: true,
          loan: {
            include: {
              user: true,
              branch: true,
              loanType: true
            }
          }
        }
      }),
      prisma.ceaseHistory.count(),
    ]);

    res.json({
      status: 200,
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({
      status: 500,
      message: "Failed to fetch all cease records",
      error: error.message,
    });
  }
};
