const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/collectionEnhanced.controller");

router.use(authMiddleware);

// Bucket Config
router.post("/buckets", c.createBucket);
router.get("/buckets", c.listBuckets);
router.put("/buckets/:id", c.updateBucket);
router.get("/buckets/resolve", c.resolveBucket);

// Promise to Pay
router.post("/ptp", c.createPTP);
router.get("/ptp", c.listPTPs);
router.patch("/ptp/:id/fulfill", c.fulfillPTP);
router.patch("/ptp/:id/break", c.breakPTP);

// Legal Actions
router.post("/legal", c.createLegalAction);
router.get("/legal", c.listLegalActions);
router.put("/legal/:id", c.updateLegalAction);

module.exports = router;
