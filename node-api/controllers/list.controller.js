const prisma = require("../lib/prisma");

exports.listEmployees = async (req, res) => {
  const adminId = req.user.adminId;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const isDeleted = req.query.isDeleted === "true" ? true : false

  const where = {
    adminId,
    isDeleted: isDeleted,
    OR: [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { role: { name: { contains: search, mode: "insensitive" } } },
    ],
  };

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        isBlocked: true,
        email: true,
        role: {
          select: {
            name: true,
            description: true,
            permissions: true
          }
        },
        createdAt: true,
        updatedAt: true
      }
    }),
    prisma.employee.count({ where }),
  ]);

  res.json({
    status: 200,
    data: employees,
    total,
    page,
    limit,
  });
};

// 🔍 Get employee by ID
exports.getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await prisma.employee.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        isBlocked: true,
        role: {
          select: {
            id: true,
            name: true,
            permissions: true,
          }
        },
        createdAt: true,
        updatedAt: true
      }
    });

    if (!employee) {
      return res.status(404).json({ status: 404, error: "Employee not found" });
    }

    res.json({ status: 200, data: employee });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 500, error: "Failed to fetch employee" });
  }
};


exports.listUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || "";

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}; // no filter if search is empty

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" }, // Optional: latest first
        include: {
          details: true,
          loans: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return res.json({
      status: 200,
      data: users,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error listing users:", error);
    return res.status(500).json({
      status: 500,
      error: "Failed to fetch users",
    });
  }
};

// 🔍 Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        details: true,
        loans: true,
      },
    });

    if (!user) {
      return res.status(404).json({ status: 404, error: "User not found" });
    }

    res.json({ status: 200, data: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 500, error: "Failed to fetch user" });
  }
};