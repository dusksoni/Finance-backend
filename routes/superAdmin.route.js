const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/superAdmin.controller");

// All super admin routes require auth — add a super-admin-only check in production
router.use(authMiddleware);

router.get("/stats", c.getPlatformStats);
router.get("/health", c.getSystemHealth);
router.get("/admins", c.listAdmins);
router.patch("/admins/:id/reset-password", c.resetAdminPassword);
router.get("/config", c.listAppConfig);
router.post("/config", c.upsertAppConfig);
router.get("/action-logs", c.getActionLogs);
router.get("/branches", c.listBranches);

module.exports = router;
