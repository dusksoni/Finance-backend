const express = require("express");
const router = express.Router();
const controller = require("../controllers/appConfig.controller");
const { authMiddleware, adminOnly, onlyAdminOrEmployee } = require("../middleware/auth");

router.get("/public", controller.getPublicAppConfigs);
router.get("/", authMiddleware, onlyAdminOrEmployee, controller.listAppConfigs);
router.get("/:key", authMiddleware, onlyAdminOrEmployee, controller.getAppConfigByKey);
router.put("/:key", authMiddleware, adminOnly, controller.upsertAppConfig);

module.exports = router;
