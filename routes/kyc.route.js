const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/kyc.controller");

router.use(authMiddleware);

// KYC List
router.get("/", c.listKYC);

// KYC Record
router.get("/user/:userId", c.getOrCreateKYC);
router.patch("/user/:userId/status", c.updateKYCStatus);

// KYC Documents
router.post("/user/:userId/documents", c.addDocument);
router.patch("/documents/:documentId/verify", c.verifyDocument);

// Risk Flags
router.post("/user/:userId/flags", c.addRiskFlag);
router.patch("/flags/:flagId/resolve", c.resolveRiskFlag);
router.get("/flags", c.listRiskFlags);

// Blacklist
router.post("/blacklist", c.addToBlacklist);
router.delete("/blacklist/:id", c.removeFromBlacklist);
router.get("/blacklist/check", c.checkBlacklist);
router.get("/blacklist", c.listBlacklist);

module.exports = router;
