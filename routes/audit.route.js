const express = require("express");
const router = express.Router();
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");
const {
  getActivityLogDetail,
  getLoginHistoryDetail,
} = require("../controllers/audit.controller");

router.get(
  "/activity/:logId",
  authMiddleware,
  onlyAdminOrEmployee,
  getActivityLogDetail
);

router.get(
  "/login-history/:loginId",
  authMiddleware,
  onlyAdminOrEmployee,
  getLoginHistoryDetail
);

module.exports = router;
