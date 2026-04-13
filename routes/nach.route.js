const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/nach.controller");

router.use(authMiddleware);

router.post("/", c.createMandate);
router.get("/", c.listMandates);
router.get("/:id", c.getMandate);
router.put("/:id", c.updateMandate);
router.patch("/:id/cancel", c.cancelMandate);
router.get("/export/presentation", c.exportPresentationFile);

module.exports = router;
