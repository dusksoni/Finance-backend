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
const { createCease, completeCease, releaseCeasedAsset, getLoanCeaseHistory, getCeaseById, getAllCeaseHistories, addCeaseContactAttempt } = require("../controllers/cease.controller");

/** ─── LOAN CRUD ───────────────────────────────────── */
router.post("/",          authMiddleware, onlyAdminOrEmployee, loanController.createLoan);
router.put("/:id",        authMiddleware, onlyAdminOrEmployee, loanController.updateLoan);
router.get("/user/:userId", authMiddleware, adminOnly,         loanController.listLoansByUser);
router.put("/close/:id", authMiddleware, adminOnly,         loanController.closeLoan);
router.get("/pending", authMiddleware, adminOnly, loanController.getPendingLoanDetails);
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

/** --------------- Cease Routes -------------------- */
// Create cease request (assign asset cease)
router.post('/cease/:loanId', authMiddleware, onlyAdminOrEmployee, createCease);

// Mark cease as completed by assigned employee
router.post('/cease/:id/complete', authMiddleware, onlyAdminOrEmployee, completeCease);

// Release ceased asset
router.post('/cease/:id/release', authMiddleware, onlyAdminOrEmployee, releaseCeasedAsset);

// Get all cease histories for a loan
router.get('/cease/loan/:loanId', authMiddleware, onlyAdminOrEmployee, getLoanCeaseHistory);

// Get one cease record with all details
router.get('/cease/:id', authMiddleware, onlyAdminOrEmployee, getCeaseById);

// In your ceaseHistory router:
router.get("/cease", authMiddleware, onlyAdminOrEmployee, getAllCeaseHistories);

router.post("/cease/:id/contact-attempt", authMiddleware, onlyAdminOrEmployee, addCeaseContactAttempt);

module.exports = router;
