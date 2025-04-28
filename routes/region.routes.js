const express = require("express");
const router = express.Router();
const {
  
  createRegion,
  getAllRegions,
  getRegionById,
  updateRegion,
  deleteRegion,
} = require("../controllers/region.controller");
const {
  adminOnly,
  authMiddleware,
  onlyAdminOrEmployee,
} = require("../middleware/auth");

router.post("/", authMiddleware, adminOnly, createRegion);
router.get("/", authMiddleware, onlyAdminOrEmployee, getAllRegions);
router.get("/:id", authMiddleware, onlyAdminOrEmployee, getRegionById);
router.put("/:id", authMiddleware, adminOnly, updateRegion);
router.delete("/:id", authMiddleware, adminOnly, deleteRegion);

module.exports = router;
