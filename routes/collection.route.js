const express = require("express");
const router = express.Router();
const controller = require("../controllers/collection.controller");
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");

router.use(authMiddleware, onlyAdminOrEmployee);

router.post("/sync-overdue", controller.syncOverdueCollectionCases);
router.get("/", controller.listCollectionCases);
router.get("/summary", controller.getCollectionSummary);
router.get("/metrics/effectiveness", controller.getEffectivenessMetrics);
router.get("/:id", controller.getCollectionCaseById);
router.patch("/:id/assign", controller.assignCollectionCase);
router.patch("/:id/status", controller.updateCollectionCaseStatus);
router.post("/:id/actions", controller.addCollectionAction);

module.exports = router;
