const express = require("express");
const router = express.Router();
const controller = require("../controllers/photoIdType.controller");
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");

router.post("/", authMiddleware, onlyAdminOrEmployee,  controller.createPhotoIdType);
router.get("/", authMiddleware, onlyAdminOrEmployee, controller.getAllPhotoIdTypes);
router.get("/:id", authMiddleware, onlyAdminOrEmployee, controller.getPhotoIdTypeById);
router.put("/:id", authMiddleware, onlyAdminOrEmployee, controller.updatePhotoIdType);
router.delete("/:id", authMiddleware, onlyAdminOrEmployee, controller.deletePhotoIdType);

module.exports = router;
