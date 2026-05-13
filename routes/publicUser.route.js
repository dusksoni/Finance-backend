// routes/publicUser.route.js - Public routes (no authentication required)
const express = require("express");
const router = express.Router();

const publicUserController = require("../controllers/publicUser.controller");
const { requirePublicAccess } = require("../middleware/publicAccess");

/**
 * PUBLIC USER ROUTES (NO AUTH REQUIRED)
 * Users can access loan info and make payments using only loan ID
 */

// Create a signed public access session after borrower verification
router.post("/access/request", publicUserController.requestPublicAccess);
router.get("/access/session", requirePublicAccess, publicUserController.getPublicAccessSession);
router.get("/loan/:loanId/grievances", requirePublicAccess, publicUserController.listPublicGrievances);
router.post("/loan/:loanId/grievance", requirePublicAccess, publicUserController.createPublicGrievance);
router.post("/loan/:loanId/grievance/:id/comments", requirePublicAccess, publicUserController.addPublicGrievanceComment);

// Get basic loan details by loan ID
router.get("/loan/:loanId/summary", requirePublicAccess, publicUserController.getPublicLoanDetails);
router.get("/loan/:loanId/statement", requirePublicAccess, publicUserController.getPublicLoanStatement);
router.get("/loan/:loanId", requirePublicAccess, publicUserController.getPublicLoanDetails);

// Get pending payments with fine calculations
router.get("/loan/:loanId/payments/pending", requirePublicAccess, publicUserController.getPublicPendingPayments);

// Get payment history
router.get("/loan/:loanId/payments", requirePublicAccess, publicUserController.getPublicPaymentHistory);

// Make bulk payment (distributed across multiple EMIs)
router.post("/loan/:loanId/payment", requirePublicAccess, publicUserController.makePublicPayment);

// Pay specific EMI
router.post("/loan/:loanId/payment/emi/:emiId", requirePublicAccess, publicUserController.payPublicEmiById);

// Download payment receipt
router.get("/loan/:loanId/payment/:paymentId/receipt", requirePublicAccess, publicUserController.getPublicPaymentReceipt);

// ICICI Payment Gateway Integration (redirect-based)
// Create payment order
router.post("/loan/:loanId/payment/create-order", requirePublicAccess, publicUserController.createPaymentGatewayOrder);

// Payment gateway callback
router.post("/payment/callback", publicUserController.handlePaymentCallback);

// Check payment status
router.get("/payment/status/:orderId", publicUserController.checkPublicPaymentStatus);

// Foreclosure quote — self-service
router.get("/loan/:loanId/foreclosure-quote", requirePublicAccess, publicUserController.getForeclosureQuote);

// ICICI UPI QR Payment (in-app)
// Generate QR code for payment
router.post("/loan/:loanId/payment/generate-qr", requirePublicAccess, publicUserController.generatePublicQR);

// Check UPI transaction status
router.get("/loan/:loanId/payment/upi-status/:merchantTranId", requirePublicAccess, publicUserController.checkPublicUPIStatus);

module.exports = router;
