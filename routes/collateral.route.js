const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/collateral.controller");

router.use(authMiddleware);

router.post("/", c.createCollateral);
router.get("/", c.listCollaterals);
router.get("/expiring-insurance", c.expiringInsurance);
router.get("/valuation-due", c.valuationDue);
router.get("/:id", c.getCollateral);
router.put("/:id", c.updateCollateral);
router.patch("/:id/status", c.updateCollateralStatus);

// Valuations
router.post("/:collateralId/valuations", c.addValuation);
router.get("/:collateralId/valuations", c.listValuations);

module.exports = router;
