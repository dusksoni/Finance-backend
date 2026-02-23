const prisma = require("../lib/prisma");

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

exports.createDraft = async (req, res) => {
  try {
    if (!prisma?.loanApplicationDraft) {
      return res.status(500).json({
        status: 500,
        error: "LoanApplicationDraft model not available",
        message: "Run prisma generate and restart the server.",
      });
    }
    const { userId, data, step } = req.body || {};
    if (!userId) {
      return res.status(400).json({
        status: 400,
        error: "userId is required",
      });
    }

    const creator = resolveCreator(req);
    const creatorFilter = buildCreatorFilter(creator);

    let draft = await prisma.loanApplicationDraft.findFirst({
      where: {
        userId,
        status: "DRAFT",
        ...creatorFilter,
      },
      orderBy: { createdAt: "desc" },
    });

    const nextStep = clampStep(step);
    const nextData = normalizeDraftData(data);

    if (draft) {
      if (nextData || step) {
        draft = await prisma.loanApplicationDraft.update({
          where: { id: draft.id },
          data: {
            step: step ? Math.max(draft.step, nextStep) : draft.step,
            data: nextData || draft.data,
          },
        });
      }
      return res.status(200).json({ status: 200, data: draft });
    }

    const created = await prisma.loanApplicationDraft.create({
      data: {
        user: { connect: { id: userId } },
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
    console.error("Loan application draft create error:", error);
    return res.status(500).json({
      status: 500,
      error: "Failed to create loan application draft",
      message: error.message,
    });
  }
};

exports.getDraft = async (req, res) => {
  try {
    if (!prisma?.loanApplicationDraft) {
      return res.status(500).json({
        status: 500,
        error: "LoanApplicationDraft model not available",
        message: "Run prisma generate and restart the server.",
      });
    }
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ status: 400, error: "Draft id required" });
    }

    const creator = resolveCreator(req);
    const creatorFilter = buildCreatorFilter(creator);

    let draft = await prisma.loanApplicationDraft.findUnique({
      where: { id },
    });

    if (!draft) {
      draft = await prisma.loanApplicationDraft.findFirst({
        where: {
          userId: id,
          status: "DRAFT",
          ...creatorFilter,
        },
        orderBy: { createdAt: "desc" },
      });
    }

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
    console.error("Loan application draft fetch error:", error);
    return res.status(500).json({
      status: 500,
      error: "Failed to fetch loan application draft",
      message: error.message,
    });
  }
};

exports.updateStep = async (req, res) => {
  try {
    const { id, step } = req.params;
    if (!id) {
      return res.status(400).json({ status: 400, error: "Draft id required" });
    }

    const existing = await prisma.loanApplicationDraft.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ status: 404, error: "Draft not found" });
    }

    const nextStep = clampStep(step);
    const incoming = normalizeDraftData(req.body?.data);
    const currentData =
      existing.data && typeof existing.data === "object" ? existing.data : {};
    const merged = incoming ? { ...currentData, ...incoming } : currentData;

    const updated = await prisma.loanApplicationDraft.update({
      where: { id },
      data: {
        step: Math.max(existing.step, nextStep),
        data: merged,
      },
    });

    return res.status(200).json({ status: 200, data: updated });
  } catch (error) {
    console.error("Loan application draft update error:", error);
    return res.status(500).json({
      status: 500,
      error: "Failed to update loan application draft",
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

    const existing = await prisma.loanApplicationDraft.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ status: 404, error: "Draft not found" });
    }

    const incoming = normalizeDraftData(req.body?.data);
    const currentData =
      existing.data && typeof existing.data === "object" ? existing.data : {};
    const merged = incoming ? { ...currentData, ...incoming } : currentData;

    const updated = await prisma.loanApplicationDraft.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        step: Math.max(existing.step, 5),
        data: merged,
      },
    });

    return res.status(200).json({ status: 200, data: updated });
  } catch (error) {
    console.error("Loan application draft submit error:", error);
    return res.status(500).json({
      status: 500,
      error: "Failed to submit loan application draft",
      message: error.message,
    });
  }
};

exports.createDraftFromLoan = async (req, res) => {
  try {
    const { loanId } = req.params;
    if (!loanId) {
      return res.status(400).json({ status: 400, error: "loanId is required" });
    }

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        twoWheelerLoan: true,
        agriLoan: true,
        msmeLoan: true,
        loanInvoiceDoc: true,
        insuranceDoc: true,
        registrationDoc: true,
        payments: { select: { id: true }, take: 1 },
      },
    });

    if (!loan) {
      return res.status(404).json({ status: 404, error: "Loan not found" });
    }

    const creator = resolveCreator(req);
    const creatorFilter = buildCreatorFilter(creator);

    // Idempotent: return existing DRAFT for this loan+creator if one exists
    const existing = await prisma.loanApplicationDraft.findFirst({
      where: { sourceLoanId: loanId, status: "DRAFT", ...creatorFilter },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return res.status(200).json({ status: 200, data: existing });
    }

    const hasPayments = loan.payments.length > 0;

    // Map loan subtype data
    let twoWheeler = null;
    let agriculture = null;
    let msme = null;

    if (loan.twoWheelerLoan) {
      const tw = loan.twoWheelerLoan;
      twoWheeler = {
        brandId: tw.brandId,
        modelId: tw.modelId,
        variantId: tw.variantId,
        vehicleName: tw.vehicleName,
        registrationNumber: tw.registrationNumber,
        chassisNumber: tw.chassisNumber,
        engineNumber: tw.engineNumber,
        rcNumber: tw.rcNumber,
      };
    }

    if (loan.agriLoan) {
      const ag = loan.agriLoan;
      agriculture = {
        equipmentId: ag.equipmentId,
        registrationNumber: ag.registrationNumber,
        usageArea: ag.usageArea,
        isSeasonal: ag.isSeasonal,
      };
    }

    if (loan.msmeLoan) {
      const ms = loan.msmeLoan;
      msme = {
        businessName: ms.businessName,
        registrationNumber: ms.registrationNumber,
        businessType: ms.businessType,
        monthlyRevenue: ms.monthlyRevenue,
        gstNumber: ms.gstNumber,
      };
    }

    const draftData = {
      // Step 1
      branchId: loan.branchId,
      showroomId: loan.showroomId,
      loanTypeId: loan.loanTypeId,
      // Step 2
      principalLoanAmount: loan.principalLoanAmount,
      interestRate: loan.interestRate,
      tenureMonths: loan.tenureMonths,
      paymentFrequency: loan.paymentFrequency,
      agreementDate: loan.agreementDate,
      monthlyPayableAmount: loan.monthlyPayableAmount,
      // Step 3
      twoWheeler,
      agriculture,
      msme,
      // Step 4
      loanInvoiceDoc: loan.loanInvoiceDoc,
      insuranceDoc: loan.insuranceDoc,
      registrationDoc: loan.registrationDoc,
      // Step 5
      insuranceAmount: loan.insuranceAmount,
      insuranceAlert: loan.insuranceAlert,
      insuranceDate: loan.insuranceDate,
      insuranceValidTill: loan.insuranceValidTill,
      insuranceNumber: loan.insuranceNumber,
      insuranceCompany: loan.insuranceCompany,
      processingCharges: loan.processingCharges,
      rtoCharges: loan.rtoCharges,
      otherCharges: loan.otherCharges,
      penaltyPercentage: loan.penaltyPercentage,
      comment: loan.comment,
      // Meta
      _editMeta: {
        sourceLoanId: loan.id,
        hasPayments,
      },
    };

    const draft = await prisma.loanApplicationDraft.create({
      data: {
        user: { connect: { id: loan.userId } },
        sourceLoan: { connect: { id: loanId } },
        status: "DRAFT",
        step: 5,
        data: draftData,
        createdByAdmin: creator.adminId
          ? { connect: { id: creator.adminId } }
          : undefined,
        createdByEmployee: creator.employeeId
          ? { connect: { id: creator.employeeId } }
          : undefined,
      },
    });

    return res.status(201).json({ status: 201, data: draft });
  } catch (error) {
    console.error("createDraftFromLoan error:", error);
    return res.status(500).json({
      status: 500,
      error: "Failed to create draft from loan",
      message: error.message,
    });
  }
};
