const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/savedReport.controller");

router.use(authMiddleware);

router.post("/", c.createReport);
router.get("/", c.listReports);
router.put("/:id", c.updateReport);
router.delete("/:id", c.deleteReport);
router.post("/:id/run", c.runReport);
router.get("/:id/runs", c.listRuns);

// Ad-hoc report (no saved report required)
router.post("/adhoc/run", c.runAdHoc);

module.exports = router;
