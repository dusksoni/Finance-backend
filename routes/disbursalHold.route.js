const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/disbursalHold.controller");

router.use(authMiddleware);

router.post("/", c.placeHold);
router.get("/", c.listHolds);
router.get("/check", c.checkHold);
router.patch("/release-by-loan", c.releaseHoldByLoan);
router.patch("/:id/release", c.releaseHold);
router.patch("/:id/cancel", c.cancelHold);

module.exports = router;
