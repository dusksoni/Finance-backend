const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");
const { getBranchFilter } = require("../utils/regionFilter");

exports.createSeized = async (req, res) => {
  try {
    const { loanId } = req.params;
    console.log("createSeized called with loanId:", loanId);
    const {
      assignedToId,      // employee id to assign the cease job to (optional)
      ceaseDate,         // backward compatibility
      seizedDate,        // new field name
      files = [],        // [{ secure_url, public_id, resource_type?, format? }]
      status = "PENDING",
      priority = "MEDIUM",
      dueDate,
      assetCondition,
    } = req.body;

    // Support both old (ceaseDate) and new (seizedDate) field names
    const actualSeizedDate = seizedDate || ceaseDate;

    if (!loanId) {
      return res.status(400).json({ status: 400, success: false, message: "Loan ID is required" });
    }

    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) {
      console.log("Loan not found for ID:", loanId);
      return res.status(404).json({ status: 404, success: false, message: "Loan not found" });
    }

    // Prevent duplicate active cease
    const existingCease = await prisma.seizedHistory.findFirst({
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
    if (loan.isClosed || loan.isForeclosed || loan.isDefaulted) {
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

      const seizedHistory = await tx.seizedHistory.create({
        data: {
        loan: { connect: { id: loan.id } },
        seizedDate: actualSeizedDate ? new Date(actualSeizedDate) : new Date(),
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
        data: { fileStatus: "SEIZED_INITIATED" },
      });

      // 4) Action log
      await tx.actionLog.create({
        data: {
          action: "CREATE_CEASE_REQUEST",
          targetId: seizedHistory.id,
          table: "SeizedHistory",
          metadata: {
            loanId: loan.id,
            assignedToId: assignedToId ?? null,
            status,
            priority,
            seizedDate: seizedHistory.seizedDate,
            fileIds: fileRecords.map((f) => f.id),
          },
          adminId: adminId,
          employeeId: employeeId,
        },
      });

      return seizedHistory;
    }, { maxWait: 2000, timeout: 30000 });

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

exports.completeSeized = async (req, res) => {
  try {
    const { id } = req.params; // SeizedHistory ID
    const {
      files = [],
      comment,  // optional comment on completion
      // Support both old and new field names for backward compatibility
      actualSeizedDate,
      actualCeaseDate,
      seizedAddress,
      ceaseAddress,
      seizedLat,
      ceaseLat,
      seizedLng,
      ceaseLng,
      assetCondition,
    } = req.body;

    // Use new field names, fall back to old ones
    const finalActualSeizedDate = actualSeizedDate || actualCeaseDate;
    const finalSeizedAddress = seizedAddress || ceaseAddress;
    const finalSeizedLat = seizedLat !== undefined ? seizedLat : ceaseLat;
    const finalSeizedLng = seizedLng !== undefined ? seizedLng : ceaseLng;

    if (!id) return res.status(400).json({ status: 400, message: "SeizedHistory ID required" });

    // Preload once, outside the transaction
    const ceaseRecord = await prisma.seizedHistory.findUnique({ where: { id } });
    if (!ceaseRecord) return res.status(404).json({ status: 404, message: "Cease record not found" });
    if (ceaseRecord.status === "COMPLETED")
      return res.status(400).json({ status: 400, message: "This cease record is already marked as completed" });
    if (ceaseRecord.status === "RELEASED")
      return res.status(400).json({ status: 400, message: "Cannot complete a released cease record" });

    const loanId = ceaseRecord.loanId; // <<— use this inside the tx
    const actorEmployeeId = req?.user?.employeeId || null;

    const parsedDate = finalActualSeizedDate ? new Date(finalActualSeizedDate) : new Date();
    const parsedLat = (finalSeizedLat === "" || finalSeizedLat == null) ? undefined : Number(finalSeizedLat);
    const parsedLng = (finalSeizedLng === "" || finalSeizedLng == null) ? undefined : Number(finalSeizedLng);

    const result = await prisma.$transaction(async (tx) => {
      // 1) Create new files (sequential for robustness)
      const createdFileRecords = [];
      if (Array.isArray(files) && files.length) {
        for (const f of files) {
          const rec = await tx.file.create({
            data: {
              url: f.secure_url,
              publicId: f.public_id,
              resourceType: f.resource_type || "image",
              format: f.format || null,
            },
          });
          createdFileRecords.push(rec);
        }
      }

      // 2) Existing file ids
      const existing = await tx.seizedHistory.findUnique({
        where: { id },
        select: { files: { select: { id: true } } },
      });
      const allFileIds = [
        ...(existing?.files ?? []).map(x => x.id),
        ...createdFileRecords.map(x => x.id),
      ];

      // 3) Update cease
      const updateData = {
        status: "COMPLETED",
        assetCondition: assetCondition || undefined,
        actualSeizedDate: parsedDate,
        comment: comment || null,
        seizedAddress: finalSeizedAddress || undefined,
        seizedLat: parsedLat,
        seizedLng: parsedLng,
        ...(actorEmployeeId ? { seizedBy: { connect: { id: actorEmployeeId } } } : {}),
        ...(allFileIds.length ? { files: { connect: allFileIds.map(id => ({ id })) } } : {}),
      };

      const updatedCease = await tx.seizedHistory.update({
        where: { id },
        data: updateData,
        include: { files: true, seizedBy: true },
      });

      // 4) Update loan status using the preloaded loanId
      await tx.loan.update({
        where: { id: loanId },
        data: { fileStatus: "SEIZED" }, // or "SEIZED_COMPLETED" if you prefer
      });

      // 5) Log (use scalar ids to be consistent with your createCease)
      await tx.actionLog.create({
        data: {
          action: "COMPLETE_CEASE_REQUEST",
          targetId: id,
          table: "SeizedHistory",
          metadata: updatedCease,
          adminId: req.user?.adminId ?? null,
          employeeId: actorEmployeeId,
        },
      });

      return updatedCease;
    }, { maxWait: 2000, timeout: 30000 });

    return res.json({ status: 200, message: "Cease marked as completed", data: result });
  } catch (error) {
    return res.status(500).json({ status: 500, message: "Cease completion failed", error: error.message });
  }
};



// controllers/cease.controller.js
exports.releaseSeizedAsset = async (req, res) => {
  try {
    const { id } = req.params;
    const { releaseReason, releaseNotes, files = [] } = req.body;

    if (!id) return res.status(400).json({ status: 400, message: "SeizedHistory ID required" });

    const ceaseRecord = await prisma.seizedHistory.findUnique({ where: { id } });
    if (!ceaseRecord) return res.status(404).json({ status: 404, message: "Cease record not found" });
    if (ceaseRecord.status === "RELEASED")
      return res.status(400).json({ status: 400, message: "This cease record is already released" });
    if (ceaseRecord.status !== "COMPLETED")
      return res.status(400).json({ status: 400, message: "Only completed cease records can be released" });
    if (!releaseReason)
      return res.status(400).json({ status: 400, message: "Release reason is required" });

    const isAdmin = req.user?.type === "ADMIN";
    const adminId = isAdmin ? req.user?.adminId ?? null : null;
    const employeeId = !isAdmin ? req.user?.employeeId ?? null : null;

    const result = await prisma.$transaction(async (tx) => {
      // create release files (optional)
      const createdFileRecords = [];
      if (Array.isArray(files) && files.length) {
        for (const f of files) {
          const rec = await tx.file.create({
            data: {
              url: f.secure_url,
              publicId: f.public_id,
              resourceType: f.resource_type || "image",
              format: f.format || null,
            },
          });
          createdFileRecords.push(rec);
        }
      }

      // existing release files
      const current = await tx.seizedHistory.findUnique({
        where: { id },
        select: { releaseFiles: { select: { id: true } }, loanId: true },
      });

      const allReleaseFileIds = [
        ...(current?.releaseFiles ?? []).map(x => x.id),
        ...createdFileRecords.map(x => x.id),
      ];

      const updatedCease = await tx.seizedHistory.update({
        where: { id },
        data: {
          status: "RELEASED",
          releaseDate: new Date(),
          releaseReason,
          releaseNotes,
          releasedByAdminId: adminId,         // <-- scalar FK
          releasedByEmployeeId: employeeId,   // <-- scalar FK
          ...(allReleaseFileIds.length
            ? { releaseFiles: { connect: allReleaseFileIds.map(fid => ({ id: fid })) } }
            : {}),
        },
        include: { releaseFiles: true }, // no releasedByAdmin/Employee includes (not in schema)
      });

      // update loan status back to ACTIVE when asset is released
      await tx.loan.update({
        where: { id: current.loanId },
        data: { fileStatus: "ACTIVE" },
      });

      await tx.actionLog.create({
        data: {
          action: "RELEASE_SEIZED_ASSET",
          targetId: id,
          table: "SeizedHistory",
          metadata: updatedCease,
          adminId,
          employeeId,
        },
      });

      return updatedCease;
    });

    return res.json({ status: 200, message: "Asset released", data: result });
  } catch (error) {
    return res.status(500).json({ status: 500, message: "Release failed", error: error.message });
  }
};


// Create a contact attempt for a cease
exports.addSeizedContactAttempt = async (req, res) => {
  try {
    const { id } = req.params; // seizedHistoryId
    const {
      contactAt,            // optional; default now
      contactType,          // "CALL" | "VISIT" | "SMS" | "WHATSAPP" | "EMAIL"
      callOutcome,          // "PICKED" | "UNREACHABLE" | "SWITCHED_OFF" | "NOT_ANSWERED" | null
      summary,              // free text
      spokeTo,              // free text: who you spoke to
      durationSeconds,      // call duration if any
    } = req.body;

    const cease = await prisma.seizedHistory.findUnique({ where: { id } });
    if (!cease) return res.status(404).json({ status: 404, message: "Cease not found" });

    const adminId    = req.user?.type === "ADMIN"    ? req.user?.adminId    ?? null : null;
    const employeeId = req.user?.type === "EMPLOYEE" ? req.user?.employeeId ?? null : null;

    const created = await prisma.seizedContactAttempt.create({
      data: {
        seizedHistoryId: id,
        contactAt: contactAt ? new Date(contactAt) : new Date(),
        contactType: contactType || "CALL",
        callOutcome: callOutcome || null,
        summary: summary || null,
        spokeTo: spokeTo || null,
        durationSeconds: durationSeconds || null,
        createdByAdminId: adminId,
        createdByEmployeeId: employeeId,
      },
    });

    // return with derived count + last attempt date
    const [attemptCount, lastAttempt] = await Promise.all([
      prisma.seizedContactAttempt.count({ where: { seizedHistoryId: id } }),
      prisma.seizedContactAttempt.findFirst({
        where: { seizedHistoryId: id },
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
    console.error("addSeizedContactAttempt error:", error);
    return res.status(500).json({ status: 500, message: "Failed to add contact attempt", error: error.message });
  }
};

// List contact attempts for a cease
exports.listSeizedContactAttempts = async (req, res) => {
  try {
    const { id } = req.params; // seizedHistoryId
    const attempts = await prisma.seizedContactAttempt.findMany({
      where: { seizedHistoryId: id },
      orderBy: { contactAt: "desc" },
    });
    return res.json({ status: 200, data: attempts });
  } catch (error) {
    console.error("listSeizedContactAttempts error:", error);
    return res.status(500).json({ status: 500, message: "Failed to fetch attempts", error: error.message });
  }
};



exports.getLoanSeizedHistory = async (req, res) => {
  try {
    const { loanId } = req.params;
    const ceaseList = await prisma.seizedHistory.findMany({
      where: { loanId },
      orderBy: { createdAt: "desc" },
      include: {
        files: true,
        releaseFiles: true,
        assignedByAdmin: true,
        assignedByEmployee: true,
        assignedTo: true,
        seizedBy: true,
        contactAttempts: true,
        loan: {
          include: {
            user: {
              include: {
                addresses: {
                  include: {
                    state: true,
                    city: true,
                    addressCategory: true,
                  },
                },
              },
            },
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

exports.getSeizedById = async (req, res) => {
  try {
    const { id } = req.params;
    const cease = await prisma.seizedHistory.findUnique({
      where: { id },
      include: {
        files: true,
        releaseFiles: true,
        assignedByAdmin: true,
        assignedByEmployee: true,
        releasedByAdmin: true,
        releasedByEmployee: true,
        assignedTo: true,
        seizedBy: true,
        loan: {
          include: {
            user: {
              include: {
                addresses: {
                  include: {
                    state: true,
                    city: true,
                    addressCategory: true,
                  },
                },
              },
            },
            branch: true,
            loanType: true,
            twoWheelerLoan: {
              include: {
                brand: true,
                model: true,
              },
            },
            agriLoan: {
              include: {
                equipment: true,
              },
            },
            msmeLoan: true,
          },
        },
        contactAttempts: {
          include: {
            createdByAdmin: true,
            createdByEmployee: true,
          },
        },
      },
    });
    if (!cease)
      return res.status(404).json({ status: 404, message: "Cease not found" });
    res.status(200).json({ status: 200, data: cease });
  } catch (error) {
    console.error("getSeizedById error:", error);
    res
      .status(500)
      .json({
        status: 500,
        message: "Failed to fetch cease",
        error: error.message,
      });
  }
};

exports.getAllSeizedHistories = async (req, res) => {

  try {
    console.log("getAllSeizedHistories called with query:", req.query);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const regionBranchFilter = getBranchFilter(req.user);
    const seizedWhere = regionBranchFilter ? { loan: regionBranchFilter } : {};

    const [data, total] = await Promise.all([
      prisma.seizedHistory.findMany({
        where: seizedWhere,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          files: true,
          releaseFiles: true,
          assignedByAdmin: true,
          assignedByEmployee: true,
          releasedByAdmin: true,
          releasedByEmployee: true,
          assignedTo: true,
          contactAttempts: true,
          seizedBy: true,
          loan: {
            include: {
              user: {
                include: {
                  addresses: {
                    include: {
                      state: true,
                      city: true,
                      addressCategory: true,
                    },
                  },
                },
              },
              branch: true,
              loanType: true,
              twoWheelerLoan: {
                include: {
                  brand: true,
                  model: true,
                },
              },
              agriLoan: {
                include: {
                  equipment: true,
                },
              },
              msmeLoan: true,
            }
          }
        }
      }),
      prisma.seizedHistory.count({ where: seizedWhere }),
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

// UPDATE SEIZED (only in PENDING status)
exports.updateSeized = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      assignedToId,
      comment,
      seizedDate,
      priority,
      dueDate,
      assetCondition,
      files = [],
    } = req.body;

    // Check permission
    const hasPermission = checkVerifyPermission(req.user, "SEIZED_EDIT");
    if (!hasPermission) {
      return res.status(403).json({ status: 403, message: "Permission denied" });
    }

    const seized = await prisma.seizedHistory.findUnique({ where: { id } });
    if (!seized) {
      return res.status(404).json({ status: 404, message: "Seized record not found" });
    }

    // Only allow edit if status is PENDING
    if (seized.status !== "PENDING") {
      return res.status(400).json({
        status: 400,
        message: `Cannot edit seized record with status ${seized.status}. Only PENDING records can be edited.`,
      });
    }

    // Handle files: separate existing files from new uploads
    let fileRecords = [];
    let existingFileIds = [];

    if (Array.isArray(files) && files.length) {
      // Separate existing files (with id) from new uploads (with secure_url)
      const existingFiles = files.filter(f => f.id);
      const newFiles = files.filter(f => !f.id && f.secure_url);

      // Keep track of existing file IDs to reconnect
      existingFileIds = existingFiles.map(f => f.id);

      // Create records for new uploads only
      if (newFiles.length) {
        fileRecords = await Promise.all(
          newFiles.map((f) =>
            prisma.file.create({
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
    }

    // Combine existing and new file IDs for connection
    const allFileIds = [
      ...existingFileIds,
      ...fileRecords.map(fr => fr.id)
    ];

    const updated = await prisma.seizedHistory.update({
      where: { id },
      data: {
        ...(assignedToId && { assignedTo: { connect: { id: assignedToId } } }),
        ...(comment !== undefined && { comment }),
        ...(seizedDate && { seizedDate: new Date(seizedDate) }),
        ...(priority && { priority }),
        ...(dueDate && { dueDate: new Date(dueDate) }),
        ...(assetCondition !== undefined && { assetCondition }),
        ...(allFileIds.length && { files: { set: allFileIds.map(id => ({ id })) } }),
      },
      include: {
        files: true,
        assignedTo: true,
      },
    });

    await logAction({
      adminId: req.user?.adminId || null,
      employeeId: req.user?.employeeId || null,
      loginActivityId: req.user?.loginActivityId,
      action: "UPDATED_SEIZED",
      table: "SeizedHistory",
      targetId: id,
      metadata: updated,
    });

    res.json({ status: 200, message: "Seized record updated successfully", data: updated });
  } catch (error) {
    console.error("Update seized error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to update seized record",
      error: error.message,
    });
  }
};

// DELETE SEIZED (only in PENDING status)
exports.deleteSeized = async (req, res) => {
  try {
    const { id } = req.params;

    // Check permission
    const hasPermission = checkVerifyPermission(req.user, "SEIZED_DELETE");
    if (!hasPermission) {
      return res.status(403).json({ status: 403, message: "Permission denied" });
    }

    const seized = await prisma.seizedHistory.findUnique({ where: { id } });
    if (!seized) {
      return res.status(404).json({ status: 404, message: "Seized record not found" });
    }

    // Only allow delete if status is PENDING
    if (seized.status !== "PENDING") {
      return res.status(400).json({
        status: 400,
        message: `Cannot delete seized record with status ${seized.status}. Only PENDING records can be deleted.`,
      });
    }

    await prisma.seizedHistory.delete({ where: { id } });

    await logAction({
      adminId: req.user?.adminId || null,
      employeeId: req.user?.employeeId || null,
      loginActivityId: req.user?.loginActivityId,
      action: "DELETED_SEIZED",
      table: "SeizedHistory",
      targetId: id,
      metadata: { loanId: seized.loanId },
    });

    res.json({ status: 200, message: "Seized record deleted successfully" });
  } catch (error) {
    console.error("Delete seized error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to delete seized record",
      error: error.message,
    });
  }
};

// CLOSE SEIZED (can be done before RELEASED but after COMPLETED)
exports.closeSeized = async (req, res) => {
  try {
    const { id } = req.params;
    const { closeReason, files = [] } = req.body;

    // Check permission
    const hasPermission = checkVerifyPermission(req.user, "SEIZED_CLOSE");
    if (!hasPermission) {
      return res.status(403).json({ status: 403, message: "Permission denied" });
    }

    if (!closeReason) {
      return res.status(400).json({ status: 400, message: "Close reason is required" });
    }

    const seized = await prisma.seizedHistory.findUnique({ where: { id } });
    if (!seized) {
      return res.status(404).json({ status: 404, message: "Seized record not found" });
    }

    // Can only close if PENDING or COMPLETED (not RELEASED or already CLOSED)
    if (seized.status === "RELEASED") {
      return res.status(400).json({
        status: 400,
        message: "Cannot close a seized record that has already been released",
      });
    }

    if (seized.status === "CLOSED") {
      return res.status(400).json({
        status: 400,
        message: "Seized record is already closed",
      });
    }

    const userType = req.user?.type;
    const adminId = userType === "ADMIN" ? req.user?.adminId ?? null : null;
    const employeeId = userType === "EMPLOYEE" ? req.user?.employeeId ?? null : null;

    // Upload files if provided
    let fileRecords = [];
    if (Array.isArray(files) && files.length) {
      fileRecords = await Promise.all(
        files.map((f) =>
          prisma.file.create({
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

    const updated = await prisma.seizedHistory.update({
      where: { id },
      data: {
        status: "CLOSED",
        closeReason,
        closeDate: new Date(),
        ...(adminId && { closedByAdmin: { connect: { id: adminId } } }),
        ...(employeeId && { closedByEmployee: { connect: { id: employeeId } } }),
        ...(fileRecords.length && { closeFiles: { connect: fileRecords.map((fr) => ({ id: fr.id })) } }),
      },
      include: {
        files: true,
        closeFiles: true,
        closedByAdmin: true,
        closedByEmployee: true,
      },
    });

    await logAction({
      adminId: req.user?.adminId || null,
      employeeId: req.user?.employeeId || null,
      loginActivityId: req.user?.loginActivityId,
      action: "CLOSED_SEIZED",
      table: "SeizedHistory",
      targetId: id,
      metadata: { closeReason, status: "CLOSED" },
    });

    res.json({ status: 200, message: "Seized record closed successfully", data: updated });
  } catch (error) {
    console.error("Close seized error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to close seized record",
      error: error.message,
    });
  }
};
