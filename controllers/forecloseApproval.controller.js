// forecloseApproval.controller.js
const prisma = require("../lib/prisma");
const checkVerifyPermission = require("../middleware/checkVerifyPermission");
const logAction = require("../utils/adminLogger");

// Create a foreclose approval request
exports.createForecloseRequest = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { requestedAmount, calculatedAmount, paymentMode, transactionId, paymentDate, metadata, useGateway } = req.body;

    // Validate inputs
    if (!requestedAmount || requestedAmount <= 0) {
      return res.status(400).json({ error: "requestedAmount must be > 0", status: 400 });
    }

    if (!calculatedAmount || calculatedAmount <= 0) {
      return res.status(400).json({ error: "calculatedAmount must be > 0", status: 400 });
    }

    if (paymentMode !== "CASH" && !transactionId && !useGateway) {
      return res.status(400).json({ error: "transactionId required for non-cash payment", status: 400 });
    }

    // Check if loan exists
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      select: { id: true, fileNo: true, fileStatus: true, isClosed: true, isForeclosed: true },
    });

    if (!loan) {
      return res.status(404).json({ error: "Loan not found", status: 404 });
    }

    if (loan.isClosed || loan.isForeclosed) {
      return res.status(400).json({ error: "Loan is already closed or foreclosed", status: 400 });
    }

    // Check if there's already a pending request for this loan
    const existingRequest = await prisma.forecloseRequest.findFirst({
      where: {
        loanId,
        status: "PENDING",
      },
    });

    if (existingRequest) {
      return res.status(400).json({
        error: "A pending foreclose request already exists for this loan",
        status: 400
      });
    }

    const isAdmin = req.user.type === "ADMIN";

    // Enhance metadata with gateway information
    const enhancedMetadata = {
      ...metadata,
      useGateway: useGateway || false,
      paymentSource: useGateway ? 'ICICI_GATEWAY' : 'MANUAL_ENTRY',
    };

    // Create the foreclose request
    const forecloseRequest = await prisma.forecloseRequest.create({
      data: {
        loanId,
        requestedAmount,
        calculatedAmount,
        paymentMode,
        transactionId: paymentMode === "CASH" ? null : transactionId,
        paymentDate: new Date(paymentDate),
        status: "PENDING",
        metadata: enhancedMetadata,
        requestedByAdminId: isAdmin ? req.user.adminId : null,
        requestedByEmployeeId: !isAdmin ? req.user.employeeId : null,
      },
      include: {
        loan: {
          include: {
            user: true,
            branch: true,
            loanType: true,
          },
        },
        requestedByAdmin: true,
        requestedByEmployee: true,
      },
    });

    // Log the action
    await logAction({
      action: "CREATED_FORECLOSE_REQUEST",
      table: "ForecloseRequest",
      targetId: forecloseRequest.id,
      metadata: { loanId, requestedAmount, calculatedAmount },
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    return res.status(201).json({
      message: "Foreclose request created successfully",
      data: forecloseRequest,
      status: 201,
    });
  } catch (err) {
    console.error("Create foreclose request error:", err);
    return res.status(500).json({
      error: "Failed to create foreclose request",
      status: 500
    });
  }
};

// List all foreclose approval requests
exports.listForecloseRequests = async (req, res) => {
  try {
    const isAdmin = req.user.type === "ADMIN";
    const canApprove = isAdmin || (await checkVerifyPermission(req.user, "FORECLOSE_VERIFY"));

    if (!canApprove) {
      return res.status(403).json({
        error: "Not allowed to view foreclose approvals",
        status: 403
      });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    const statusQuery = (req.query.status || "PENDING").toUpperCase();
    const branchId = req.query.branchId;
    const search = (req.query.search || "").trim();

    const statusMap = {
      PENDING: ["PENDING"],
      APPROVED: ["APPROVED"],
      REJECTED: ["REJECTED"],
      ALL: ["PENDING", "APPROVED", "REJECTED"],
    };

    const statuses = statusMap[statusQuery] || ["PENDING"];

    const where = {
      status: { in: statuses },
    };

    if (branchId) {
      where.loan = { branchId };
    }

    if (search) {
      where.OR = [
        { loan: { fileNo: { contains: search, mode: "insensitive" } } },
        {
          loan: {
            user: {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { middleName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        },
        {
          loan: {
            branch: {
              name: { contains: search, mode: "insensitive" },
            },
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.forecloseRequest.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          loan: {
            include: {
              user: true,
              branch: true,
              loanType: true,
            },
          },
          requestedByAdmin: true,
          requestedByEmployee: true,
          approvedByAdmin: true,
          approvedByEmployee: true,
        },
      }),
      prisma.forecloseRequest.count({ where }),
    ]);

    return res.status(200).json({
      data,
      meta: {
        page,
        limit,
        total,
        status: statusQuery,
      },
    });
  } catch (err) {
    console.error("List foreclose requests error:", err);
    return res.status(500).json({
      error: "Failed to fetch foreclose requests",
      status: 500
    });
  }
};

// Get a single foreclose request by ID
exports.getForecloseRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    const forecloseRequest = await prisma.forecloseRequest.findUnique({
      where: { id },
      include: {
        loan: {
          include: {
            user: true,
            branch: true,
            loanType: true,
            emi: {
              where: {
                status: { in: ["UNPAID", "PARTIAL"] },
              },
              orderBy: { paymentFor: "asc" },
            },
          },
        },
        requestedByAdmin: true,
        requestedByEmployee: true,
        approvedByAdmin: true,
        approvedByEmployee: true,
      },
    });

    if (!forecloseRequest) {
      return res.status(404).json({ error: "Foreclose request not found", status: 404 });
    }

    // Check if this was a gateway payment and if it was rejected
    const isGatewayPayment = forecloseRequest.metadata?.useGateway === true;
    const isRejected = forecloseRequest.status === "REJECTED";
    const requiresRefund = isGatewayPayment && isRejected;

    return res.status(200).json({
      data: forecloseRequest,
      requiresRefund,
      gatewayTransactionId: isGatewayPayment ? forecloseRequest.transactionId : null,
    });
  } catch (err) {
    console.error("Get foreclose request error:", err);
    return res.status(500).json({
      error: "Failed to fetch foreclose request",
      status: 500
    });
  }
};

// Approve a foreclose request
exports.approveForecloseRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user.type === "ADMIN";
    const canApprove = isAdmin || (await checkVerifyPermission(req.user, "FORECLOSE_VERIFY"));

    if (!canApprove) {
      return res.status(403).json({
        error: "Not allowed to approve foreclose requests",
        status: 403
      });
    }

    const forecloseRequest = await prisma.forecloseRequest.findUnique({
      where: { id },
      include: { loan: true },
    });

    if (!forecloseRequest) {
      return res.status(404).json({ error: "Foreclose request not found", status: 404 });
    }

    if (forecloseRequest.status !== "PENDING") {
      return res.status(400).json({
        error: "Foreclose request is not pending approval",
        status: 400
      });
    }

    // Process the foreclosure in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update the foreclose request
      const updatedRequest = await tx.forecloseRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvalComment: null,
          approvedAt: new Date(),
          approvedByAdminId: isAdmin ? req.user.adminId : null,
          approvedByEmployeeId: !isAdmin ? req.user.employeeId : null,
        },
        include: {
          loan: {
            include: {
              user: true,
              branch: true,
              loanType: true,
            },
          },
          requestedByAdmin: true,
          requestedByEmployee: true,
          approvedByAdmin: true,
          approvedByEmployee: true,
        },
      });

      // 2. Create the foreclosure payment
      await tx.payment.create({
        data: {
          loanId: forecloseRequest.loanId,
          amount: forecloseRequest.requestedAmount,
          paymentDate: forecloseRequest.paymentDate,
          paymentMode: forecloseRequest.paymentMode,
          transactionId: forecloseRequest.transactionId,
          status: "PAID",
          isForeclosure: true,
          verified: true,
          verifiedAt: new Date(),
          verifiedByAdminId: isAdmin ? req.user.adminId : null,
          verifiedByEmployeeId: !isAdmin ? req.user.employeeId : null,
          adminId: isAdmin ? req.user.adminId : null,
          employeeId: !isAdmin ? req.user.employeeId : null,
          metadata: forecloseRequest.metadata,
        },
      });

      // 3. Update the loan status
      await tx.loan.update({
        where: { id: forecloseRequest.loanId },
        data: {
          isForeclosed: true,
          foreclosedAt: new Date(),
          isClosed: true,
          fileStatus: "FORECLOSED",
          pendingAmount: 0,
        },
      });

      // 4. Mark all pending EMIs as paid (if any)
      await tx.eMI.updateMany({
        where: {
          loanId: forecloseRequest.loanId,
          status: { in: ["UNPAID", "PARTIAL"] },
        },
        data: {
          status: "PAID",
          isForeclosure: true,
        },
      });

      return updatedRequest;
    });

    // Log the action
    await logAction({
      action: "APPROVED_FORECLOSE_REQUEST",
      table: "ForecloseRequest",
      targetId: id,
      metadata: {
        loanId: forecloseRequest.loanId,
        approverType: req.user.type,
      },
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    return res.status(200).json({
      message: "Foreclose request approved successfully",
      data: result,
      status: 200,
    });
  } catch (err) {
    console.error("Approve foreclose request error:", err);
    return res.status(500).json({
      error: "Failed to approve foreclose request",
      status: 500
    });
  }
};

// Reject a foreclose request
exports.rejectForecloseRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const comment = (req.body?.comment || "").trim();

    if (!comment) {
      return res.status(400).json({
        error: "Rejection comment is required",
        status: 400
      });
    }

    const isAdmin = req.user.type === "ADMIN";
    const canApprove = isAdmin || (await checkVerifyPermission(req.user, "FORECLOSE_VERIFY"));

    if (!canApprove) {
      return res.status(403).json({
        error: "Not allowed to reject foreclose requests",
        status: 403
      });
    }

    const forecloseRequest = await prisma.forecloseRequest.findUnique({
      where: { id },
    });

    if (!forecloseRequest) {
      return res.status(404).json({ error: "Foreclose request not found", status: 404 });
    }

    if (forecloseRequest.status !== "PENDING") {
      return res.status(400).json({
        error: "Foreclose request is not pending approval",
        status: 400
      });
    }

    const updatedRequest = await prisma.forecloseRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        approvalComment: comment,
        approvedAt: new Date(),
        approvedByAdminId: isAdmin ? req.user.adminId : null,
        approvedByEmployeeId: !isAdmin ? req.user.employeeId : null,
      },
      include: {
        loan: {
          include: {
            user: true,
            branch: true,
            loanType: true,
          },
        },
        requestedByAdmin: true,
        requestedByEmployee: true,
        approvedByAdmin: true,
        approvedByEmployee: true,
      },
    });

    // Check if this was a gateway payment (payment already done via ICICI)
    const isGatewayPayment = forecloseRequest.metadata?.useGateway === true;
    const gatewayTransactionId = forecloseRequest.transactionId;

    // Log the action
    await logAction({
      action: "REJECTED_FORECLOSE_REQUEST",
      table: "ForecloseRequest",
      targetId: id,
      metadata: {
        loanId: forecloseRequest.loanId,
        rejectionComment: comment,
        isGatewayPayment,
        gatewayTransactionId: isGatewayPayment ? gatewayTransactionId : null,
      },
      loginActivityId: req.user.loginActivityId,
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
    });

    return res.status(200).json({
      message: "Foreclose request rejected successfully",
      data: updatedRequest,
      status: 200,
      requiresRefund: isGatewayPayment, // Flag to show refund button in UI
      gatewayTransactionId: isGatewayPayment ? gatewayTransactionId : null,
    });
  } catch (err) {
    console.error("Reject foreclose request error:", err);
    return res.status(500).json({
      error: "Failed to reject foreclose request",
      status: 500
    });
  }
};
