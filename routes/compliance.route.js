const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/compliance.controller");

router.use(authMiddleware);

// Legal Hold
router.post("/holds", c.placeHold);
router.get("/holds", c.listHolds);
router.get("/holds/check", c.checkHold);
router.patch("/holds/:id/release", c.releaseHold);

// PII Access Log
router.post("/pii-log", c.logPIIAccess);
router.get("/pii-log", c.listPIIAccessLogs);

module.exports = router;
