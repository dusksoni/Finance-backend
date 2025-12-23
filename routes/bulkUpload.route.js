const express = require("express");
const router = express.Router();
const multer = require("multer");
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");
const {
  bulkUpload,
  generateTemplate,
} = require("../controllers/bulkUpload.controller");

// Configure multer for file upload (memory storage for Excel files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files (.xlsx, .xls) are allowed"));
    }
  },
});

// Download template
router.get(
  "/template",
  authMiddleware,
  onlyAdminOrEmployee,
  generateTemplate
);

// Upload Excel file for bulk data import
router.post(
  "/upload",
  authMiddleware,
  onlyAdminOrEmployee,
  upload.single("file"),
  bulkUpload
);

module.exports = router;
