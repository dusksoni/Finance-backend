const express = require("express");
const router = express.Router();
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");
const c = require("../controllers/cibil.controller");

router.use(authMiddleware, onlyAdminOrEmployee);

router.post("/pull/:userId", c.pullCibilScore);
router.get("/history/:userId", c.getCibilHistory);
router.post("/check-eligibility", c.checkEligibility);

module.exports = router;
