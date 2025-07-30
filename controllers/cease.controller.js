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

// Cease Asset Controller — Supports assignment by Admin/Employee and file uploads
exports.createCease = async (req, res) => {
  try {
    const { loanId } = req.params;
    const {
      assignedToId,
      comment,
      location,
      ceaseDate,
      files = [],
      status = "PENDING",
    } = req.body;

    // Find loan
    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) {
      return res
        .status(404)
        .json({ success: false, message: "Loan not found" });
    }
    if (loan.fileStatus !== "ACTIVE" && loan.fileStatus !== "DEFAULTED") {
      return res.status(400).json({
        success: false,
        message: "Only active or defaulted loans can be ceased",
      });
    }

    // Determine assigner
    let assignedByAdminId = null;
    let assignedByEmployeeId = null;
    if (req.user.type === "ADMIN")
      assignedByAdminId = { connect: { id: req.user.adminId } };
    else if (req.user.type === "EMPLOYEE")
      assignedByEmployeeId = { connect: { id: req.user.employeeId } };
    else return res.status(403).json({ status: 403, message: "Unauthorized" });

    // Transaction: create files, ceaseHistory, update loan, log action
    const result = await prisma.$transaction(async (tx) => {
      // Upload/attach files
      let fileRecords = [];
      if (files.length) {
        fileRecords = await Promise.all(
          files.map((file) =>
            tx.file.create({
              data: {
                url: file.secure_url,
                publicId: file.public_id,
                resourceType: file.resource_type || "image",
                format: file.format || null,
              },
            })
          )
        );
      }

      // Create ceaseHistory
      const ceaseHistory = await tx.ceaseHistory.create({
        data: {
          loanId: loan.id,
          assignedByAdminId,
          assignedByEmployeeId,
          assignedToId: { connect: { id: assignedToId } } || null,
          ceaseDate: ceaseDate ? new Date(ceaseDate) : new Date(),
          location: location || null,
          comment: comment || null,
          files: { connect: fileRecords.map((f) => ({ id: f.id })) },
          status,
        },
      });

      // Update loan as ceased
      await tx.loan.update({
        where: { id: loan.id },
        data: {
          fileStatus: "CEASED",
          ceased: true,
          ceaseDate: ceaseDate ? new Date(ceaseDate) : new Date(),
        },
      });

      // Log action (if you want this in the transaction; optional)
      await tx.actionLog.create({
        data: {
          action: "CREATE_CEASE_REQUEST",
          targetId: ceaseHistory.id,
          table: "CeaseHistory",
          metadata: ceaseHistory,
          adminId: assignedByAdminId,
          employeeId: assignedByEmployeeId,
        },
      });

      return ceaseHistory;
    });

    res.status(200).json({
      status: 200,
      message: "Asset cease request created",
      data: result,
    });
  } catch (error) {
    console.error("Cease asset error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to create cease asset record",
      error: error.message,
    });
  }
};

exports.completeCease = async (req, res) => {
  try {
    const { id } = req.params; // CeaseHistory ID
    const { files = [], comment, location } = req.body;

    // Validation
    if (!id) return res.status(400).json({ status: 400, message: "CeaseHistory ID required" });

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
          ceasedById: { connect: { id: req.user.employeeId } },
          ceaseDate: new Date(),
          comment: comment || undefined,
          location: location || undefined,
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

    if (!id) return res.status(400).json({ status: 400, message: "CeaseHistory ID required" });

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

      // Update cease (append release files to existing)
      const updatedCease = await tx.ceaseHistory.update({
        where: { id },
        data: {
          status: "RELEASED",
          releaseDate: new Date(),
          releaseReason,
          releaseFiles: { connect: [...current.releaseFiles, ...fileRecords].map(f => ({ id: f.id })) },
        },
        include: { releaseFiles: true }
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
      },
    });
    if (!cease)
      return res.status(404).json({ status: 404, message: "Cease not found" });
    res.json({ status: 200, data: cease });
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
