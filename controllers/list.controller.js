const prisma = require("../lib/prisma");

exports.listEmployees = async (req, res) => {
  const adminId = req.user.adminId;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const isDeleted = req.query.isDeleted === "true" ? true : false;

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
        region: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
          },
        },
        email: true,
        role: {
          select: {
            name: true,
            description: true,
            permissions: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
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
        region: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
            permissions: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
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

// 🚹 Get all genders
exports.getAllGenders = async (req, res) => {
  try {
    const data = await prisma.gender.findMany({
      orderBy: { value: "asc" },
    });
    res.status(200).json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.getAllGenders = async (req, res) => {
  try {
    const data = await prisma.gender.findMany({
      orderBy: { value: "asc" },
    });
    res.status(200).json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

// 👨‍👩 Get all relation types
exports.getAllRelationTypes = async (req, res) => {
  try {
    const data = await prisma.relationType.findMany();
    res.status(200).json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

// 🏠 Get all address categories
exports.getAllAddressCategories = async (req, res) => {
  try {
    const data = await prisma.addressCategory.findMany({
      orderBy: { name: "asc" },
    });
    res.status(200).json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

// ========== VEHICLE BRAND ==========
exports.createBranch = async (req, res) => {
  try {
    const { name, regionId, address, pincode, phone, email } = req.body;
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
      },
    });
    res.status(201).json({ data: branch, status: 201 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.getBranches = async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      include: { employees: true, region: true, loans: true },
    });
    res.status(200).json({ data: branches, status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.updateBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const updated = await prisma.branch.update({
      where: { id },
      data: { name },
    });
    res.status(200).json({ data: updated, status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.deleteBranch = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.branch.delete({ where: { id } });
    res
      .status(200)
      .json({ message: "Branch deleted successfully", status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};
// ========== VEHICLE BRAND ==========
exports.createBrand = async (req, res) => {
  try {
    const { name } = req.body;
    const brand = await prisma.vehicleBrand.create({ data: { name } });
    res.status(201).json({ data: brand, status: 201 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.getBrands = async (req, res) => {
  try {
    const brands = await prisma.vehicleBrand.findMany({
      include: { models: { include: { variants: true } } },
    });
    res.status(200).json({ data: brands, status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.updateBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const updated = await prisma.vehicleBrand.update({
      where: { id },
      data: { name },
    });
    res.status(200).json({ data: updated, status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.deleteBrand = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.vehicleBrand.delete({ where: { id } });
    res
      .status(200)
      .json({ message: "Brand deleted successfully", status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

// ========== VEHICLE MODEL ==========
exports.createModel = async (req, res) => {
  try {
    const { name, brandId } = req.body;
    const model = await prisma.vehicleModel.create({
      data: { name, brand: { connect: { id: brandId } } },
    });
    res.status(201).json({ data: model, status: 201 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.getModels = async (req, res) => {
  try {
    const { brandId } = req.query;
    const models = await prisma.vehicleModel.findMany({
      where: brandId ? { brandId } : {},
      include: { variants: true, brand: true },
    });
    res.status(200).json({ data: models, status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.updateModel = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, brandId } = req.body;
    const updated = await prisma.vehicleModel.update({
      where: { id },
      data: { name, brandId },
    });
    res.status(200).json({ data: updated, status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.deleteModel = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.vehicleModel.delete({ where: { id } });
    res
      .status(200)
      .json({ message: "Model deleted successfully", status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

// ========== VEHICLE VARIANT ==========
exports.createVariant = async (req, res) => {
  try {
    const { name, modelId } = req.body;
    const variant = await prisma.vehicleVariant.create({
      data: { name, modelId },
    });
    res.status(201).json({ data: variant, status: 201 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.getVariants = async (req, res) => {
  try {
    const { modelId } = req.query;
    const variants = await prisma.vehicleVariant.findMany({
      where: modelId ? { modelId } : {},
    });
    res.status(200).json({ data: variants, status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.updateVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, modelId } = req.body;
    const updated = await prisma.vehicleVariant.update({
      where: { id },
      data: { name, modelId },
    });
    res.status(200).json({ data: updated, status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.deleteVariant = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.vehicleVariant.delete({ where: { id } });
    res
      .status(200)
      .send({ message: "Variant deleted successfully", status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

// ========== EQUIPMENT ==========
exports.createEquipment = async (req, res) => {
  try {
    const { name } = req.body;
    const equipment = await prisma.equipment.create({ data: { name } });
    res.status(201).json({ data: equipment, status: 201 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.getEquipment = async (req, res) => {
  try {
    const items = await prisma.equipment.findMany();
    res.status(200).json({ data: items, status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.updateEquipment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const updated = await prisma.equipment.update({
      where: { id },
      data: { name },
    });
    res.status(200).json({ data: updated, status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.deleteEquipment = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.equipment.delete({ where: { id } });
    res
      .status(200)
      .send({ message: "Equipment deleted successfully", status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

// ========== USAGE AREA ==========
exports.createUsageArea = async (req, res) => {
  try {
    const { name } = req.body;
    const usageArea = await prisma.usageArea.create({ data: { name } });
    res.status(201).json({ data: usageArea, status: 201 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.getUsageAreas = async (req, res) => {
  try {
    const items = await prisma.usageArea.findMany();
    res.status(200).json({ data: items, status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.updateUsageArea = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const updated = await prisma.usageArea.update({
      where: { id },
      data: { name },
    });
    res.status(200).json({ data: updated, status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};

exports.deleteUsageArea = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.usageArea.delete({ where: { id } });
    res
      .status(200)
      .send({ message: "Usage area deleted successfully", status: 200 });
  } catch (err) {
    res.status(500).json({ error: err.message, status: 500 });
  }
};
