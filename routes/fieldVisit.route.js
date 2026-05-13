const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/fieldVisit.controller");

router.use(authMiddleware);

router.post("/", c.recordFieldVisit);
router.get("/my-today", c.myVisitsToday);
router.get("/case/:caseId", c.listFieldVisits);

module.exports = router;
