const express = require("express");
const router = express.Router();
const {
  adminLogin,
  getEmployees,
  updateAdmin,
  updateAdminPassword,
  getAdminProfile,
  getActivityLogs,
  getLoginHistory,
} = require("../controllers/admin.controller");
const { authMiddleware, adminOnly, onlyAdminOrEmployee } = require("../middleware/auth");
const { getAllUsers } = require("../controllers/user.controller");
const { getEmployeeById } = require("../controllers/employee.controller");
const { updateAllOverdueFines } = require("../utils/fineUpdateService");
const { clearCache, getCacheStats } = require("../utils/fineUpdateCache");

router.post("/login", adminLogin);
router.get("/employees", authMiddleware, onlyAdminOrEmployee, getEmployees);
router.get("/employees/:id", authMiddleware, onlyAdminOrEmployee, getEmployeeById);
router.get("/users", authMiddleware, adminOnly, getAllUsers);
router.get("/me", authMiddleware, adminOnly, getAdminProfile);
router.get("/me/activity", authMiddleware, onlyAdminOrEmployee, getActivityLogs);
router.get("/me/login-history", authMiddleware, onlyAdminOrEmployee, getLoginHistory);
router.put("/admin/:id", authMiddleware, adminOnly, updateAdmin);
router.put("/admin/:id/password", authMiddleware, adminOnly, updateAdminPassword);

// Manual fine refresh endpoint (admin only)
router.post("/refresh-fines", authMiddleware, adminOnly, async (req, res) => {
  try {
    console.log(`🔄 Manual fine refresh triggered by admin: ${req.user.id}`);
    const result = await updateAllOverdueFines();

    return res.status(200).json({
      status: 200,
      message: "Fine refresh completed successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Manual fine refresh failed:", error);
    return res.status(500).json({
      status: 500,
      error: "Fine refresh failed",
      message: error.message,
    });
  }
});

// Get cache statistics endpoint (admin only)
router.get("/cache-stats", authMiddleware, adminOnly, async (req, res) => {
  try {
    const stats = getCacheStats();
    return res.status(200).json({
      status: 200,
      data: stats,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: error.message,
    });
  }
});

// Clear cache endpoint (admin only)
router.post("/clear-cache", authMiddleware, adminOnly, async (req, res) => {
  try {
    clearCache();
    return res.status(200).json({
      status: 200,
      message: "Cache cleared successfully",
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: error.message,
    });
  }
});

module.exports = router;
