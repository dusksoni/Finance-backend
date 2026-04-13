const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/bounce.controller");

router.use(authMiddleware);

router.post("/", c.recordBounce);
router.get("/", c.listBounces);
router.patch("/:id/collect", c.markChargeCollected);

module.exports = router;
