const express = require("express");
const router = express.Router();

const reportController = require("../controllers/report.controller");
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");

router.get(
  "/cibil",
  authMiddleware,
  onlyAdminOrEmployee,
  reportController.downloadCibilReport
);

module.exports = router;
