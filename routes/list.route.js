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



module.exports = router;
