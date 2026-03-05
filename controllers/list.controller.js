const prisma = require("../lib/prisma");

const parseExpand = (value) =>
  new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );


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
    const expand = parseExpand(req.query.expand);
    const includeModels = expand.has("models") || expand.has("variants");
    const includeVariants = expand.has("variants");

    const brands = await prisma.vehicleBrand.findMany({
      select: {
        id: true,
        name: true,
        _count: { select: { models: true } },
        ...(includeModels
          ? {
              models: {
                select: {
                  id: true,
                  name: true,
                  brandId: true,
                  ...(includeVariants
                    ? {
                        variants: {
                          select: {
                            id: true,
                            name: true,
                            modelId: true,
                          },
                        },
                      }
                    : {}),
                },
              },
            }
          : {}),
      },
    });

    const data = brands.map((brand) => ({
      id: brand.id,
      name: brand.name,
      modelCount: brand._count.models,
      ...(includeModels ? { models: brand.models } : {}),
    }));

    res.status(200).json({ data, status: 200 });
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
    const expand = parseExpand(req.query.expand);
    const includeVariants = expand.has("variants");

    const models = await prisma.vehicleModel.findMany({
      where: brandId ? { brandId } : {},
      select: {
        id: true,
        name: true,
        brandId: true,
        brand: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: { select: { variants: true } },
        ...(includeVariants
          ? {
              variants: {
                select: {
                  id: true,
                  name: true,
                  modelId: true,
                },
              },
            }
          : {}),
      },
    });

    const data = models.map((model) => ({
      id: model.id,
      name: model.name,
      brandId: model.brandId,
      brand: model.brand,
      variantCount: model._count.variants,
      ...(includeVariants ? { variants: model.variants } : {}),
    }));

    res.status(200).json({ data, status: 200 });
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
    const { modelId, brandId } = req.query;
    const expand = parseExpand(req.query.expand);
    const includeModel = expand.has("model") || expand.has("brand");
    const includeBrand = expand.has("brand");

    const where = {
      ...(modelId ? { modelId } : {}),
      ...(brandId
        ? {
            model: {
              brandId,
            },
          }
        : {}),
    };

    const variants = await prisma.vehicleVariant.findMany({
      where,
      select: {
        id: true,
        name: true,
        modelId: true,
        ...(includeModel
          ? {
              model: {
                select: {
                  id: true,
                  name: true,
                  brandId: true,
                  ...(includeBrand
                    ? {
                        brand: {
                          select: {
                            id: true,
                            name: true,
                          },
                        },
                      }
                    : {}),
                },
              },
            }
          : {}),
      },
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
