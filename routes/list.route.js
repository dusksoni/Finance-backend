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
  createUsageArea,
  getUsageAreas,
  updateUsageArea,
  deleteUsageArea,
} = require("../controllers/list.controller");

// Public lookup endpoints
router.get("/genders", getAllGenders);
router.get("/relation-types", getAllRelationTypes);
router.get("/address-categories", getAllAddressCategories);


// Vehicle Brand
router.post("/brands", createBrand);
router.get("/brands", getBrands);
router.put("/brands/:id", updateBrand);
router.delete("/brands/:id", deleteBrand);

// Vehicle Model
router.post("/models", createModel);
router.get("/models", getModels);
router.put("/models/:id", updateModel);
router.delete("/models/:id", deleteModel);

// Vehicle Variant
router.post("/variants", createVariant);
router.get("/variants", getVariants);
router.put("/variants/:id", updateVariant);
router.delete("/variants/:id", deleteVariant);

// Equipment
router.post("/equipment", createEquipment);
router.get("/equipment", getEquipment);
router.put("/equipment/:id", updateEquipment);
router.delete("/equipment/:id", deleteEquipment);

// Usage Area
router.post("/usage-areas", createUsageArea);
router.get("/usage-areas", getUsageAreas);
router.put("/usage-areas/:id", updateUsageArea);
router.delete("/usage-areas/:id", deleteUsageArea);


module.exports = router;
