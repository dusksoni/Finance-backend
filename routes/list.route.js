const express = require("express");
const router = express.Router();
const {
  getAllGenders,
  getAllRelationTypes,
  getAllAddressCategories,
  createBrand,
  getBrands,
  updateBrand,
  deleteBrand,
  createModel,
  getModels,
  updateModel,
  deleteModel,
  createVariant,
  getVariants,
  updateVariant,
  deleteVariant,
  createEquipment,
  getEquipment,
  updateEquipment,
  deleteEquipment,
  
} = require("../controllers/list.controller");
const { ro } = require("date-fns/locale");
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");
const { createBranch, updateBranch, deleteBranch, getBranches, getBranchEmployees, getBranchLoans, getBranchStatistics, getBranch } = require("../controllers/branch.controller");
const { getAllShowrooms, getShowroomsByBranch, getShowroomById, createShowroom, updateShowroom, deleteShowroom } = require("../controllers/showroom.controller");

// Public lookup endpoints
router.get("/genders", getAllGenders);
router.get("/relation-types", getAllRelationTypes);
router.get("/address-categories", getAllAddressCategories);

// branch
router.get("/branch", getBranches);
router.get("/branch/:id", authMiddleware, onlyAdminOrEmployee, getBranch);
router.post("/branch", authMiddleware, onlyAdminOrEmployee, createBranch);
router.put("/branch/:id", authMiddleware, onlyAdminOrEmployee, updateBranch);
router.delete("/branch/:id", authMiddleware, onlyAdminOrEmployee, deleteBranch);
router.get("/branch/:id/employees", authMiddleware, onlyAdminOrEmployee, getBranchEmployees);
router.get("/branch/:id/loans", authMiddleware, onlyAdminOrEmployee, getBranchLoans);
router.get("/branch/:id/statistics", authMiddleware, onlyAdminOrEmployee, getBranchStatistics);

// Vehicle Brand
router.post("/brands", authMiddleware, onlyAdminOrEmployee, createBrand);
router.get("/brands", getBrands);
router.put("/brands/:id", authMiddleware, onlyAdminOrEmployee, updateBrand);
router.delete("/brands/:id", authMiddleware, onlyAdminOrEmployee, deleteBrand);

// Vehicle Model
router.post("/models", authMiddleware, onlyAdminOrEmployee, createModel);
router.get("/models", getModels);
router.put("/models/:id", authMiddleware, onlyAdminOrEmployee, updateModel);
router.delete("/models/:id", authMiddleware, onlyAdminOrEmployee, deleteModel);

// Vehicle Variant
router.post("/variants", authMiddleware, onlyAdminOrEmployee, createVariant);
router.get("/variants", getVariants);
router.put("/variants/:id", authMiddleware, onlyAdminOrEmployee, updateVariant);
router.delete("/variants/:id", authMiddleware, onlyAdminOrEmployee, deleteVariant);

// Equipment
router.post("/equipment", authMiddleware, onlyAdminOrEmployee, createEquipment);
router.get("/equipment", getEquipment);
router.put("/equipment/:id", authMiddleware, onlyAdminOrEmployee, updateEquipment);
router.delete("/equipment/:id", authMiddleware, onlyAdminOrEmployee, deleteEquipment);

// Get all showrooms
router.get("/showroom", authMiddleware, onlyAdminOrEmployee, getAllShowrooms);

// Get showrooms by branch
router.get("/showroom/branch/:branchId", authMiddleware, onlyAdminOrEmployee, getShowroomsByBranch);

// Get single showroom
router.get("/showroom/:id", authMiddleware, onlyAdminOrEmployee, getShowroomById);

// Create showroom
router.post("/showroom", authMiddleware, onlyAdminOrEmployee, createShowroom);

// Update showroom
router.put("/showroom/:id", authMiddleware, onlyAdminOrEmployee, updateShowroom);

// Delete showroom
router.delete("/showroom/:id", authMiddleware, onlyAdminOrEmployee, deleteShowroom);


module.exports = router;
