const express = require("express");
const router = express.Router();
const { authMiddleware, adminOnly } = require("../middleware/auth");
const c = require("../controllers/rbiReturn.controller");

router.use(authMiddleware, adminOnly);

// GET /api/rbi-returns/nbs1?year=2024&quarter=1&format=json|csv
router.get("/nbs1", c.getNBS1);

// GET /api/rbi-returns/nbs7?year=2024&format=json|csv
router.get("/nbs7", c.getNBS7);

// GET /api/rbi-returns/alm?year=2024&month=3&format=json|csv
router.get("/alm", c.getALM);

module.exports = router;
