const express = require("express");
const router = express.Router();
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");
const c = require("../controllers/npa.controller");

router.use(authMiddleware, onlyAdminOrEmployee);

router.get("/aging", c.getNpaAgingReport);
router.get("/summary", c.getNpaSummary);
router.get("/write-off", c.getWriteOffReport);
router.get("/nach-mandate-report", c.getNachMandateReport);
router.get("/employee-performance", c.getEmployeePerformanceReport);
router.put("/loan/:loanId/status", c.updateLoanNpaStatus);

module.exports = router;
