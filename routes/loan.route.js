const express = require("express");
const router = express.Router();
const loanController = require("../controllers/loan.controller");
const { adminOnly, authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");
const { makePayment, verifyPayment, getPendingPaymentsByLoanId } = require("../controllers/payment.controller");

// Main Loan routes
router.get("/", authMiddleware, onlyAdminOrEmployee, loanController.listLoans);
router.get("/download", authMiddleware, onlyAdminOrEmployee, loanController.listLoansDownload);
router.get("/:id", authMiddleware, onlyAdminOrEmployee, loanController.getLoanById);
router.post("/", authMiddleware, onlyAdminOrEmployee, loanController.createLoan);
router.put("/:id", authMiddleware, onlyAdminOrEmployee, loanController.updateLoan);
router.get("/user/:userId",authMiddleware,  adminOnly, loanController.listLoansByUser);
router.get("/payment/pending/:loanId", authMiddleware, onlyAdminOrEmployee, getPendingPaymentsByLoanId);
router.post("/payment",authMiddleware, makePayment);
router.post("/payment/verifyPayment",authMiddleware, verifyPayment);

module.exports = router;
