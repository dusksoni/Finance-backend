const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/foir.controller");

router.use(authMiddleware);

router.get("/user/:userId", c.getFOIR);
router.post("/check-eligibility", c.checkEligibility);

module.exports = router;
