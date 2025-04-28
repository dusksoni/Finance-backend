const express = require("express");
const router = express.Router();
const uploadController = require("../controllers/upload.controller");
const { onlyAdminOrEmployee, authMiddleware } = require("../middleware/auth");

router.post(
  "/upload",
  authMiddleware,
  onlyAdminOrEmployee,
  uploadController.uploadMiddleware,
  uploadController.uploadFile
);

router.delete(
  "/remove",
  authMiddleware,
  onlyAdminOrEmployee,
  uploadController.deleteFile
);

module.exports = router;
