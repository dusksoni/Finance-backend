const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/commTemplate.controller");

router.use(authMiddleware);

// Templates
router.post("/", c.createTemplate);
router.get("/", c.listTemplates);
router.get("/:id", c.getTemplate);
router.put("/:id", c.updateTemplate);
router.delete("/:id", c.deleteTemplate);
router.post("/:id/render", c.renderTemplate);

// Communication logs
router.post("/logs", c.logComm);
router.get("/logs", c.listLogs);

module.exports = router;
