const router = require("express").Router();
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");
const dashboard = require("../controllers/dashboard.controller");
const dashboardEnhanced = require("../controllers/dashboard-enhanced.controller");
const dashboardExport = require("../controllers/dashboard-export.controller");
const dashboardFormattedExport = require("../controllers/dashboard-formatted-export.controller");

router.use(authMiddleware, onlyAdminOrEmployee);

// Original dashboard
router.get("/summary", dashboard.getSummary);

// Enhanced dashboard with date filtering and NBFC metrics
router.get("/enhanced", dashboardEnhanced.getEnhancedSummary);

// Export endpoints
router.post("/export/excel", dashboardExport.exportToExcel);
router.post("/export/pdf", dashboardExport.exportToPDF);

// CIBIL-style formatted export for enhanced dashboard
router.post("/export/formatted", dashboardFormattedExport.exportFormattedDashboard);

module.exports = router;


