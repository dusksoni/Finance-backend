// routes/publicUser.route.js - Public routes (no authentication required)
const express = require("express");
const router = express.Router();

const publicUserController = require("../controllers/publicUser.controller");

/**
 * PUBLIC USER ROUTES (NO AUTH REQUIRED)
 * Users can access loan info and make payments using only loan ID
 */

// Get basic loan details by loan ID
router.get("/loan/:loanId", publicUserController.getPublicLoanDetails);

// Get pending payments with fine calculations
router.get("/loan/:loanId/payments/pending", publicUserController.getPublicPendingPayments);

// Get payment history
router.get("/loan/:loanId/payments", publicUserController.getPublicPaymentHistory);

// Make bulk payment (distributed across multiple EMIs)
router.post("/loan/:loanId/payment", publicUserController.makePublicPayment);

// Pay specific EMI
router.post("/loan/:loanId/payment/emi/:emiId", publicUserController.payPublicEmiById);

// Download payment receipt
router.get("/loan/:loanId/payment/:paymentId/receipt", publicUserController.getPublicPaymentReceipt);

// ICICI Payment Gateway Integration (redirect-based)
// Create payment order
router.post("/loan/:loanId/payment/create-order", publicUserController.createPaymentGatewayOrder);

// Payment gateway callback
router.post("/payment/callback", publicUserController.handlePaymentCallback);

// Check payment status
router.get("/payment/status/:orderId", publicUserController.checkPublicPaymentStatus);

// ICICI UPI QR Payment (in-app)
// Generate QR code for payment
router.post("/loan/:loanId/payment/generate-qr", publicUserController.generatePublicQR);

// Check UPI transaction status
router.get("/loan/:loanId/payment/upi-status/:merchantTranId", publicUserController.checkPublicUPIStatus);

module.exports = router;
