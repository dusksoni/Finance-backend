const express = require("express");
const router = express.Router();

const loanApplicationController = require("../controllers/loanApplication.controller");
const {
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission,
} = require("../middleware/auth");

router.post(
  "/",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("LOAN_CREATE"),
  loanApplicationController.createDraft
);

router.get(
  "/:id",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("LOAN_CREATE"),
  loanApplicationController.getDraft
);

router.patch(
  "/:id/step/:step",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("LOAN_CREATE"),
  loanApplicationController.updateStep
);

router.post(
  "/:id/submit",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("LOAN_CREATE"),
  loanApplicationController.submitDraft
);

router.post(
  "/from-loan/:loanId",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("LOAN_EDIT"),
  loanApplicationController.createDraftFromLoan
);

module.exports = router;
