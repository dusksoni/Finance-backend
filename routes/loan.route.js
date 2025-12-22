// routes/loan.routes.js (or payment.routes.js)
const express = require("express");
const router = express.Router();

const loanController    = require("../controllers/loan.controller");
const paymentController = require("../controllers/payment.controller");
const forecloseApprovalController = require("../controllers/forecloseApproval.controller");
const {
  authMiddleware,
  onlyAdminOrEmployee,
  adminOnly,
  requirePermission,
} = require("../middleware/auth");

/** ─── LOAN CRUD ───────────────────────────────────── */
router.post("/",          authMiddleware, onlyAdminOrEmployee, loanController.createLoan);
router.put("/:id",        authMiddleware, onlyAdminOrEmployee, loanController.updateLoan);
router.get("/user/:userId", authMiddleware, adminOnly,         loanController.listLoansByUser);
router.put("/close/:id", authMiddleware, adminOnly,         loanController.closeLoan);
router.get("/pending", authMiddleware, adminOnly, loanController.getPendingLoanDetails);
router.get(
  "/approvals",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("LOAN_APPROVE"),
  loanController.listLoanApprovals
);
router.post(
  "/:id/approve",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("LOAN_APPROVE"),
  loanController.approveLoan
);
router.post(
  "/:id/reject",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("LOAN_APPROVE"),
  loanController.rejectLoan
);
router.get("/",           authMiddleware, onlyAdminOrEmployee, loanController.listLoans);
router.get("/download",   authMiddleware, onlyAdminOrEmployee, loanController.listLoansDownload);
router.get("/:id",        authMiddleware, onlyAdminOrEmployee, loanController.getLoanById);

/** ─── PAYMENT ROUTES ──────────────────────────────── */

// 1) Get pending installments for a loan
router.get(
  "/payment/pending/:loanId", authMiddleware,
  onlyAdminOrEmployee,
  paymentController.getPendingPaymentsByLoanId
);

router.post(
  "/payment/:loanId",
  authMiddleware,
  onlyAdminOrEmployee,
  paymentController.makePayment
);

// 2) Get a single installment by its emiId
router.get(
  "/payment/emi/:emiId",
  authMiddleware,
  onlyAdminOrEmployee,
  paymentController.getEmiById
);
router.get(
  "/payment/getbyid/:id",
  authMiddleware,
  onlyAdminOrEmployee,
  paymentController.getPaymentById
);

// 3) Pay a specific installment (full or partial)
router.post(
  "/payment/emi/:emiId/pay",
  authMiddleware,
  onlyAdminOrEmployee,
  paymentController.payPaymentById
);

// 4) Get all unverified payments for a loan
router.get(
  "/payment/unverified",
  authMiddleware,
  onlyAdminOrEmployee,
  paymentController.getUnverifiedPayments
);
// 5) Verify a (partial or full) payment record
router.post(
  "/payment/:paymentId/verify",
  authMiddleware,
  onlyAdminOrEmployee,
  paymentController.verifyPayment
);

// 6) Get foreclosure details for a loan
router.get(
  "/payment/foreclose/:loanId",
  authMiddleware,
  onlyAdminOrEmployee,
  paymentController.getForeclosureDetails
);

// 7) Post foreclosure payment (settle entire outstanding balance)
router.post(
  "/payment/foreclose/:loanId",
  authMiddleware,
  onlyAdminOrEmployee,
  paymentController.postForeclosurePayment
);
router.get(
  "/payment/invoice/:paymentId",
  authMiddleware,
  onlyAdminOrEmployee,
  paymentController.getPaymentInvoice
);

/** --------------- Foreclose Approval Routes -------------------- */
// List all foreclose approval requests
router.get(
  "/foreclose-approvals",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("FORECLOSE_VERIFY"),
  forecloseApprovalController.listForecloseRequests
);

// Create a foreclose approval request
router.post(
  "/foreclose-request/:loanId",
  authMiddleware,
  onlyAdminOrEmployee,
  forecloseApprovalController.createForecloseRequest
);

// Get a single foreclose request
router.get(
  "/foreclose-request/:id",
  authMiddleware,
  onlyAdminOrEmployee,
  forecloseApprovalController.getForecloseRequestById
);

// Approve a foreclose request
router.post(
  "/foreclose-request/:id/approve",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("FORECLOSE_VERIFY"),
  forecloseApprovalController.approveForecloseRequest
);

// Reject a foreclose request
router.post(
  "/foreclose-request/:id/reject",
  authMiddleware,
  onlyAdminOrEmployee,
  requirePermission("FORECLOSE_VERIFY"),
  forecloseApprovalController.rejectForecloseRequest
);

module.exports = router;
