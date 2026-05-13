const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/consent.controller");

router.use(authMiddleware);

// Consent Templates
router.post("/templates", c.createTemplate);
router.get("/templates", c.listTemplates);
router.put("/templates/:id", c.updateTemplate);
router.post("/templates/:id/snapshot", c.snapshotTemplate);
router.get("/templates/:id/history", c.getTemplateHistory);

// Consent Records
router.post("/record", c.recordConsent);
router.patch("/:id/withdraw", c.withdrawConsent);
router.get("/user/:userId", c.getUserConsents);
router.get("/check", c.checkConsent);

// KFS
router.post("/kfs", c.deliverKFS);
router.patch("/kfs/:id/accept", c.acceptKFS);
router.get("/kfs/loan/:loanId", c.getLoanKFSHistory);

module.exports = router;
