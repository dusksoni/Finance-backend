const express = require("express");
const router = express.Router();

const reportController = require("../controllers/report.controller");
const paymentController = require("../controllers/payment.controller");
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");

router.get(
  "/cibil",
  authMiddleware,
  onlyAdminOrEmployee,
  reportController.downloadCibilReport
);

// Payment reports (daily, monthly, yearly)
router.get(
  "/payments",
  authMiddleware,
  onlyAdminOrEmployee,
  paymentController.getPaymentReports
);

// EMI reports (overdue, partial, upcoming, paid)
router.get(
  "/emis",
  authMiddleware,
  onlyAdminOrEmployee,
  paymentController.getEmiReports
);

module.exports = router;
