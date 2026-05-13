const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/monthEndSnapshot.controller");

router.use(authMiddleware);

router.post("/generate", c.generateSnapshot);
router.get("/", c.listSnapshots);
router.get("/:id", c.getSnapshot);

module.exports = router;
