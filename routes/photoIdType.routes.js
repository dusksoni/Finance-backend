const express = require("express");
const router = express.Router();
const controller = require("../controllers/photoIdType.controller");

router.post("/", controller.createPhotoIdType);
router.get("/", controller.getAllPhotoIdTypes);
router.get("/:id", controller.getPhotoIdTypeById);
router.put("/:id", controller.updatePhotoIdType);
router.delete("/:id", controller.deletePhotoIdType);

module.exports = router;
