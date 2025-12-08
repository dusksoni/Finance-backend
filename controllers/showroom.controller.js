const prisma = require("../lib/prisma");

// Get all showrooms
exports.getAllShowrooms = async (req, res) => {
  try {
    const showrooms = await prisma.showroom.findMany({
      where: { isDeleted: false },
      include: {
        branch: {
          include: {
            region: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
    res.json({ status: 200, data: showrooms });
  } catch (error) {
    console.error("Get all showrooms error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch showrooms",
      error: error.message,
    });
  }
};

// Get showrooms by branch
exports.getShowroomsByBranch = async (req, res) => {
  try {
    const { branchId } = req.params;
    const showrooms = await prisma.showroom.findMany({
      where: {
        branchId,
        isDeleted: false,
      },
      orderBy: { name: "asc" },
    });
    res.json({ status: 200, data: showrooms });
  } catch (error) {
    console.error("Get showrooms by branch error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch showrooms",
      error: error.message,
    });
  }
};

// Get single showroom
exports.getShowroomById = async (req, res) => {
  try {
    const { id } = req.params;
    const showroom = await prisma.showroom.findUnique({
      where: { id },
      include: {
        branch: {
          include: {
            region: true,
          },
        },
      },
    });
    if (!showroom || showroom.isDeleted) {
      return res.status(404).json({
        status: 404,
        message: "Showroom not found",
      });
    }
    res.json({ status: 200, data: showroom });
  } catch (error) {
    console.error("Get showroom by ID error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch showroom",
      error: error.message,
    });
  }
};

// Create showroom
exports.createShowroom = async (req, res) => {
  try {
    const {
      name,
      branchId,
      location,
      address,
      pincode,
      latitude,
      longitude,
      phone,
      email,
    } = req.body;

    if (!name || !branchId) {
      return res.status(400).json({
        status: 400,
        message: "Name and branch are required",
      });
    }

    const showroom = await prisma.showroom.create({
      data: {
        name,
        branchId,
        location,
        address,
        pincode: pincode ? parseInt(pincode) : null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        phone: phone ? String(phone) : null,
        email,
      },
      include: {
        branch: true,
      },
    });

    res.status(201).json({ status: 201, data: showroom });
  } catch (error) {
    console.error("Create showroom error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to create showroom",
      error: error.message,
    });
  }
};

// Update showroom
exports.updateShowroom = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      branchId,
      location,
      address,
      pincode,
      latitude,
      longitude,
      phone,
      email,
    } = req.body;

    const existing = await prisma.showroom.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) {
      return res.status(404).json({
        status: 404,
        message: "Showroom not found",
      });
    }

    const showroom = await prisma.showroom.update({
      where: { id },
      data: {
        name,
        branchId,
        location,
        address,
        pincode: pincode ? parseInt(pincode) : null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        phone: phone ? String(phone) : null,
        email,
      },
      include: {
        branch: true,
      },
    });

    res.json({ status: 200, data: showroom });
  } catch (error) {
    console.error("Update showroom error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to update showroom",
      error: error.message,
    });
  }
};

// Delete showroom (soft delete)
exports.deleteShowroom = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.showroom.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) {
      return res.status(404).json({
        status: 404,
        message: "Showroom not found",
      });
    }

    await prisma.showroom.update({
      where: { id },
      data: { isDeleted: true },
    });

    res.json({ status: 200, message: "Showroom deleted successfully" });
  } catch (error) {
    console.error("Delete showroom error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to delete showroom",
      error: error.message,
    });
  }
};
