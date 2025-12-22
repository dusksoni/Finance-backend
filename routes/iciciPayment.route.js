// iciciPayment.route.js
// Routes for ICICI UPI/QR Payment Gateway Integration

const express = require('express');
const router = express.Router();
const iciciPaymentController = require('../controllers/iciciPayment.controller');
const { authMiddleware } = require('../middleware/auth');

/**
 * Generate QR Code for UPI Payment
 * POST /api/icici-payment/generate-qr
 * Auth: Required (Admin/Employee)
 * Body: {
 *   loanId: string,
 *   emiId?: string,
 *   amount: number,
 *   paymentType: 'bulk' | 'emi'
 * }
 */
router.post('/generate-qr', authMiddleware, iciciPaymentController.generateQR);

/**
 * ICICI Payment Callback Handler (Webhook)
 * POST /api/icici-payment/callback
 * Auth: None (Called by ICICI gateway)
 * Body: Encrypted payload from ICICI
 *
 * Note: This endpoint should be whitelisted and secured via IP restriction
 * in production (only allow ICICI gateway IPs)
 */
router.post('/callback', iciciPaymentController.handleCallback);

/**
 * Check Transaction Status
 * GET /api/icici-payment/status/:merchantTranId
 * Auth: Required
 */
router.get('/status/:merchantTranId', authMiddleware, iciciPaymentController.checkTransactionStatus);

/**
 * Get Pending UPI Transactions for a Loan
 * GET /api/icici-payment/pending/:loanId
 * Auth: Required
 */
router.get('/pending/:loanId', authMiddleware, iciciPaymentController.getPendingTransactions);

/**
 * Initiate Refund
 * POST /api/icici-payment/refund
 * Auth: Required (Admin only recommended)
 * Body: {
 *   originalBankRRN: string,
 *   originalMerchantTranId: string,
 *   refundAmount: number,
 *   note?: string
 * }
 */
router.post('/refund', authMiddleware, iciciPaymentController.initiateRefund);

module.exports = router;
