const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/numbering.controller");

router.use(authMiddleware);

router.get("/formats", c.listFormats);
router.post("/formats", c.upsertFormat);
router.get("/next/:entityType", c.generateNumber);
router.post("/reset/:entityType", c.resetSequence);

module.exports = router;
