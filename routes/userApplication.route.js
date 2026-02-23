const express = require("express");
const router = express.Router();

const userApplicationController = require("../controllers/userApplication.controller");
const {
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission,
} = require("../middleware/auth");

router.get(
  "/",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("USER_CREATE"),
  userApplicationController.getDrafts
);

router.post(
  "/",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("USER_CREATE"),
  userApplicationController.createDraft
);

router.get(
  "/:id",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("USER_CREATE"),
  userApplicationController.getDraft
);

router.patch(
  "/:id/step/:step",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("USER_CREATE"),
  userApplicationController.updateStep
);

router.post(
  "/:id/submit",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("USER_CREATE"),
  userApplicationController.submitDraft
);

module.exports = router;
