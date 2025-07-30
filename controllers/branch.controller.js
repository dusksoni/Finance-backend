const prisma = require("../lib/prisma");

// ========== branch ==========
exports.createBranch = async (req, res) => {
  try {
    const { name, regionId, address, pincode, phone, email } = req.body;

    const existingBranch = await prisma.branch.findFirst({
      where: {
        name,
        isDeleted: false,
      },
    });
    if (existingBranch) {
      return res.status(400).json({
        error: "Branch with this name already exists",
        status: 400,
      });
    }
    if (!regionId) {
      return res.status(400).json({
        error: "Region ID is required",
        status: 400,
      });
    }
    const region = await prisma.region.findUnique({
      where: { id: regionId, isDeleted: false },
    });
    if (!region) {
      return res.status(404).json({
        error: "Region not found",
        status: 404,
      });
    }

    const branch = await prisma.branch.create({
      data: {
        name,
        address,
        pincode,
        phone,
        email,
        region: {
          connect: { id: regionId },
        },
        state: {
          connect: { id: region.stateId },
        },
        city: {
          connect: { id: region.cityId },
        },
      },
    });

    await prisma.actionLog.create({
      data: {
        adminId: req.user.id, // The admin who performed this action
        action: "CREATE",
        targetId: branch.id,
        table: "Branch",
        metadata: branch,
      },
    });
    res.status(201).json({ data: branch, status: 201 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.getBranches = async (req, res) => {
  try {
    const filters = {
      isDeleted: false,
    };

    // If region filter is provided
    if (req.query.regionId) {
      filters.regionId = req.query.regionId;
    }

    const branches = await prisma.branch.findMany({
      where: filters,
      select: {
        id: true,
        name: true,
        address: true,
        city: {
          select: {
            id: true,
            name: true,
          },
        },
        state: {
          select: {
            id: true,
            name: true,
          },
        },
        region: {
          select: {
            id: true,
            name: true,
          },
        },
        pincode: true,
        phone: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            employees: true,
            loans: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    res.status(200).json({
      status: 200,
      count: branches.length,
      data: branches,
    });
  } catch (error) {
    console.error("Get branches error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to get branches",
      error: error.message,
    });
  }
};

exports.getBranch = async (req, res) => {
  try {
    const branch = await prisma.branch.findUnique({
      where: {
        id: req.params.id,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        address: true,
        city: {
          select: {
            id: true,
            name: true,
          },
        },
        state: {
          select: {
            id: true,
            name: true,
          },
        },
        region: {
          select: {
            id: true,
            name: true,
          },
        },
        pincode: true,
        phone: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        employees: {
          where: {
            isDeleted: false,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            role: true,
            createdAt: true,
          },
        },
        loans: {
          take: 5,
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            fileNo: true,
            principalLoanAmount: true,
            fileStatus: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!branch) {
      return res.status(404).json({
        status: 404,
        message: "Branch not found",
      });
    }

    // Get branch statistics
    const stats = await prisma.$transaction([
      // Total loan amount
      prisma.loan.aggregate({
        where: {
          branchId: req.params.id,
          fileStatus: "DISBURSED",
        },
        _sum: {
          principalLoanAmount: true,
        },
      }),
      // Active loans count
      prisma.loan.count({
        where: {
          branchId: req.params.id,
          fileStatus: "DISBURSED",
        },
      }),
      // Pending approval loans count
      prisma.loan.count({
        where: {
          branchId: req.params.id,
          fileStatus: "PENDING_APPROVAL",
        },
      }),
      // Employees count
      prisma.employee.count({
        where: {
          branchId: req.params.id,
          isDeleted: false,
        },
      }),
    ]);

    const branchWithStats = {
      ...branch,
      stats: {
        totalLoanAmount: stats[0]._sum.principalLoanAmount || 0,
        activeLoansCount: stats[1],
        pendingApprovalsCount: stats[2],
        employeesCount: stats[3],
      },
    };

    res.status(200).json({
      status: 200,
      data: branchWithStats,
    });
  } catch (error) {
    console.error("Get branch error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to get branch",
      error: error.message,
    });
  }
};

exports.updateBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await prisma.branch.update({
      where: { id },
      data: {
        ...req.body,
      },
    });
    res.status(200).json({ data: updated, status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.deleteBranch = async (req, res) => {
  try {
    // Check if branch exists
    const branch = await prisma.branch.findUnique({
      where: {
        id: req.params.id,
        isDeleted: false,
      },
    });

    if (!branch) {
      return res.status(404).json({
        status: 404,
        message: "Branch not found",
      });
    }

    // Check if branch has active employees
    const activeEmployees = await prisma.employee.count({
      where: {
        branchId: req.params.id,
        isDeleted: false,
      },
    });

    if (activeEmployees > 0) {
      return res.status(400).json({
        status: 400,
        message:
          "Cannot delete branch with active employees. Please reassign or delete the employees first.",
      });
    }

    // Check if branch has active loans
    const activeLoans = await prisma.loan.count({
      where: {
        branchId: req.params.id,
        fileStatus: {
          in: ["ACTIVE", "DISBURSED", "PENDING_APPROVAL", "APPROVED"],
        },
      },
    });

    if (activeLoans > 0) {
      return res.status(400).json({
        status: 400,
        message:
          "Cannot delete branch with active loans. Please reassign or close the loans first.",
      });
    }

    // Soft delete branch
    await prisma.branch.update({
      where: { id: req.params.id },
      data: { isDeleted: true },
    });

    // Log the action
    await prisma.actionLog.create({
      data: {
        adminId: req.user.id, // The admin who performed this action
        action: "DELETE",
        targetId: branch.id,
        table: "Branch",
        metadata: { branchId: branch.id },
      },
    });

    res.status(200).json({
      success: true,
      message: "Branch deleted successfully",
    });
  } catch (error) {
    console.error("Delete branch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete branch",
      error: error.message,
    });
  }
};

exports.getBranchEmployees = async (req, res) => {
  try {
    const { page = 1, limit = 10, role } = req.query;
    const skip = (page - 1) * limit;

    // Check if branch exists
    const branch = await prisma.branch.findUnique({
      where: {
        id: req.params.id,
        isDeleted: false,
      },
    });

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    const filters = {
      branchId: req.params.id,
      isDeleted: false,
    };

    // Add role filter if provided
    if (role) {
      filters.role = role;
    }

    // Get employees
    const employees = await prisma.employee.findMany({
      where: filters,
      orderBy: { createdAt: "desc" },
      skip: parseInt(skip),
      take: parseInt(limit),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        isBlocked: true,
        _count: {
          select: {
            loans: true,
            users: true,
          },
        },
      },
    });

    // Get total count
    const total = await prisma.employee.count({
      where: filters,
    });

    res.status(200).json({
      success: true,
      count: employees.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: employees,
    });
  } catch (error) {
    console.error("Get branch employees error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get branch employees",
      error: error.message,
    });
  }
};
exports.getBranchLoans = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    // Check if branch exists
    const branch = await prisma.branch.findUnique({
      where: {
        id: req.params.id,
        isDeleted: false,
      },
    });

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    const filters = { branchId: req.params.id };

    // Add status filter if provided
    if (status) {
      filters.fileStatus = status;
    }

    // Get loans
    const loans = await prisma.loan.findMany({
      where: filters,
      orderBy: { createdAt: "desc" },
      skip: parseInt(skip),
      take: parseInt(limit),
      select: {
        id: true,
        fileNo: true,
        principalLoanAmount: true,
        fileStatus: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        loanType: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Get total count
    const total = await prisma.loan.count({
      where: filters,
    });

    res.status(200).json({
      success: true,
      count: loans.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: loans,
    });
  } catch (error) {
    console.error("Get branch loans error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get branch loans",
      error: error.message,
    });
  }
};

exports.getBranchStatistics = async (req, res) => {
  try {
    // Check if branch exists
    const branch = await prisma.branch.findUnique({
      where: {
        id: req.params.id,
        isDeleted: false,
      },
    });

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Get branch statistics
    const stats = await prisma.$transaction([
      // Total loan amount
      prisma.loan.aggregate({
        where: {
          branchId: req.params.id,
          fileStatus: "DISBURSED",
        },
        _sum: {
          principalLoanAmount: true,
        },
      }),
      // Active loans count
      prisma.loan.count({
        where: {
          branchId: req.params.id,
          fileStatus: "DISBURSED",
        },
      }),
      // Pending approval loans count
      prisma.loan.count({
        where: {
          branchId: req.params.id,
          fileStatus: "PENDING_APPROVAL",
        },
      }),
      // Employees count
      prisma.employee.count({
        where: {
          branchId: req.params.id,
          isDeleted: false,
        },
      }),
      // Loan types distribution
      prisma.loan.groupBy({
        by: ["loanTypeId"],
        where: {
          branchId: req.params.id,
          fileStatus: "DISBURSED",
        },
        _count: {
          id: true,
        },
        _sum: {
          principalLoanAmount: true,
        },
      }),
      // Monthly disbursement for the last 6 months
      prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', "disbursedDate") as month,
          COUNT(*) as count,
          SUM("principalLoanAmount") as amount
        FROM "Loan"
        WHERE "branchId" = ${req.params.id}
          AND "disbursedDate" IS NOT NULL
          AND "disbursedDate" >= NOW() - INTERVAL '6 months'
        GROUP BY month
        ORDER BY month DESC
        LIMIT 6
      `,
    ]);

    // Get loan type names
    const loanTypes = await prisma.loanType.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    // Map loan type IDs to names
    const loanTypeDistribution = stats[4].map((item) => {
      const loanType = loanTypes.find((lt) => lt.id === item.loanTypeId);
      return {
        loanTypeId: item.loanTypeId,
        loanTypeName: loanType ? loanType.name : "Unknown",
        count: item._count.id,
        amount: item._sum.principalLoanAmount,
      };
    });

    const statistics = {
      totalLoanAmount: stats[0]._sum.principalLoanAmount || 0,
      activeLoansCount: stats[1],
      pendingApprovalsCount: stats[2],
      employeesCount: stats[3],
      loanTypeDistribution,
      monthlyDisbursement: stats[5],
    };

    res.status(200).json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    console.error("Get branch statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get branch statistics",
      error: error.message,
    });
  }
};
