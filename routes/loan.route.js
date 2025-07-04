// routes/loan.routes.js (or payment.routes.js)
const express = require("express");
const router = express.Router();

const loanController    = require("../controllers/loan.controller");
const paymentController = require("../controllers/payment.controller");
const {
  authMiddleware,
  onlyAdminOrEmployee,
  adminOnly,
} = require("../middleware/auth");

/** ─── LOAN CRUD ───────────────────────────────────── */
router.get("/",           authMiddleware, onlyAdminOrEmployee, loanController.listLoans);
router.get("/download",   authMiddleware, onlyAdminOrEmployee, loanController.listLoansDownload);
router.get("/:id",        authMiddleware, onlyAdminOrEmployee, loanController.getLoanById);
router.post("/",          authMiddleware, onlyAdminOrEmployee, loanController.createLoan);
router.put("/:id",        authMiddleware, onlyAdminOrEmployee, loanController.updateLoan);
router.get("/user/:userId", authMiddleware, adminOnly,         loanController.listLoansByUser);

/** ─── PAYMENT ROUTES ──────────────────────────────── */

// 1) Get pending installments for a loan
router.get(
  "/payment/pending/:loanId", authMiddleware,
  onlyAdminOrEmployee,
  paymentController.getPendingPaymentsByLoanId
);

// 2) Get a single installment by its paymentId
router.get(
  "/payment/:paymentId",
  authMiddleware,
  onlyAdminOrEmployee,
  paymentController.getPaymentById
);

// 3) Pay a specific installment (full or partial)
router.post(
  "/payment/:paymentId/pay",
  authMiddleware,
  onlyAdminOrEmployee,
  paymentController.payPaymentById
);

// 4) Bulk apply a payment across earliest outstanding installments
router.post(
  "/payment",
  authMiddleware,
  onlyAdminOrEmployee,
  paymentController.makePayment
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

module.exports = router;
