const express = require("express");
const router = express.Router();

const reportController = require("../controllers/report.controller");
const paymentController = require("../controllers/payment.controller");
const npaController = require("../controllers/npa.controller");
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");

router.use(authMiddleware, onlyAdminOrEmployee);

// CIBIL report
router.get("/cibil", reportController.downloadCibilReport);

// Payment reports (daily, monthly, yearly)
router.get("/payments", paymentController.getPaymentReports);

// EMI reports (overdue, partial, upcoming, paid)
router.get("/emis", paymentController.getEmiReports);

// Loan report (all loans summary)
router.get("/loans", reportController.getLoanReport);

// Pending EMI report (month-wise overdue)
router.get("/pending-emis", reportController.getPendingEmiReport);

// NPA aging report
router.get("/npa-aging", npaController.getNpaAgingReport);

// NPA summary / PAR
router.get("/npa-summary", npaController.getNpaSummary);

// Write-off & settlement report
router.get("/write-off", npaController.getWriteOffReport);

// NACH mandate status report
router.get("/nach-mandates", npaController.getNachMandateReport);

// Employee performance report
router.get("/employee-performance", npaController.getEmployeePerformanceReport);

// Disbursement report
router.get("/disbursements", reportController.getDisbursementReport);

module.exports = router;
