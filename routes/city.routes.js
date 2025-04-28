const express = require("express");
const router = express.Router();
const {
  createCity,
  getCities,
  getCityById,
  updateCity,
  deleteCity,
} = require("../controllers/statecity.controller");
const {
  adminOnly,
  authMiddleware,
  onlyAdminOrEmployee,
} = require("../middleware/auth");

router.post("/", authMiddleware, adminOnly, createCity);
router.get("/", authMiddleware, onlyAdminOrEmployee, getCities);
router.get("/:id", authMiddleware, onlyAdminOrEmployee, getCityById);
router.put("/:id", authMiddleware, adminOnly, updateCity);
router.delete("/:id", authMiddleware, adminOnly, deleteCity);

module.exports = router;
