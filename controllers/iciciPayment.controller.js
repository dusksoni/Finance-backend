// iciciPayment.controller.js
// ICICI Bank UPI/QR Payment Gateway Integration
// Handles QR generation, callback processing, and transaction status checks

const prisma = require("../lib/prisma");
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const {
  encryptWithICICIPublicKey,
  decryptWithMerchantPrivateKey,
  generateQRString,
  generateIntentURL,
  generateMerchantTranId,
  formatAmount,
  generateBillNumber
} = require('../utils/iciciEncryption');

// ICICI Gateway Configuration
const ICICI_CONFIG = {
  merchantId: process.env.ICICI_MERCHANT_ID || '',
  subMerchantId: process.env.ICICI_SUB_MERCHANT_ID || process.env.ICICI_MERCHANT_ID,
  terminalId: process.env.ICICI_TERMINAL_ID || '5411', // Default MCC code
  gatewayURL: process.env.ICICI_GATEWAY_URL || 'https://apibankingonesandbox.icicibank.com',
  apiKey: process.env.ICICI_API_KEY || '',
  merchantVPA: process.env.ICICI_MERCHANT_VPA || 'kushalfinance@icici',
  merchantName: process.env.ICICI_MERCHANT_NAME || 'Kushal Finance',
  callbackURL: process.env.ICICI_CALLBACK_URL || '',
  publicKeyPath: path.join(__dirname, '../keys/icici_public_key.pem'),
  privateKeyPath: path.join(__dirname, '../keys/merchant_private_key.pem'),
};

// Check if we're in development mode (keys missing)
const isDevelopmentMode = !fs.existsSync(ICICI_CONFIG.publicKeyPath) ||
                          !fs.existsSync(ICICI_CONFIG.privateKeyPath) ||
                          !ICICI_CONFIG.merchantId ||
                          !ICICI_CONFIG.apiKey;

if (isDevelopmentMode) {
  console.warn('⚠️  ICICI Payment Gateway - Running in DEVELOPMENT MODE');
  console.warn('⚠️  Encryption keys or credentials missing. Using mock responses.');
  console.warn('⚠️  To enable production mode:');
  console.warn('    1. Generate RSA keys (see keys/README.md)');
  console.warn('    2. Configure ICICI credentials in .env file');
}

/**
 * Generate QR Code for payment
 * POST /api/icici-payment/generate-qr
 * Body: { loanId, emiId?, amount, paymentType: 'bulk' | 'emi' }
 */
exports.generateQR = async (req, res) => {
  try {
    const { loanId, emiId, amount, paymentType } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: 'Valid amount is required',
        status: 400
      });
    }

    // Fetch loan details
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        user: true,
        loanType: true
      }
    });

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found', status: 404 });
    }

    // Generate unique merchant transaction ID
    const merchantTranId = generateMerchantTranId();
    const billNumber = generateBillNumber('BILL');

    let qrString, intentURL, refId;

    if (isDevelopmentMode) {
      // DEVELOPMENT MODE: Generate mock QR without calling ICICI API
      console.log('📱 [DEV MODE] Generating mock UPI QR for testing');

      refId = `DEV${Date.now()}`;

      // Generate valid UPI QR string (works with any UPI app)
      qrString = generateQRString({
        merchantVPA: ICICI_CONFIG.merchantVPA,
        merchantName: ICICI_CONFIG.merchantName,
        refId: merchantTranId,
        amount: formatAmount(amount),
        mcc: ICICI_CONFIG.terminalId
      });

      intentURL = generateIntentURL({
        merchantVPA: ICICI_CONFIG.merchantVPA,
        merchantName: ICICI_CONFIG.merchantName,
        refId: merchantTranId,
        amount: formatAmount(amount),
        mcc: ICICI_CONFIG.terminalId
      });

      console.log('📱 [DEV MODE] QR String:', qrString);
      console.log('📱 [DEV MODE] Note: Payments will be simulated - no actual charges');

    } else {
      // PRODUCTION MODE: Call actual ICICI API
      const requestPayload = {
        merchantId: ICICI_CONFIG.merchantId,
        terminalId: ICICI_CONFIG.terminalId,
        amount: formatAmount(amount),
        merchantTranId: merchantTranId,
        billNumber: billNumber,
      };

      // Encrypt the payload
      const encryptedPayload = encryptWithICICIPublicKey(
        requestPayload,
        ICICI_CONFIG.publicKeyPath
      );

      // Call ICICI QR API
      const apiURL = `${ICICI_CONFIG.gatewayURL}/api/MerchantAPI/UPI/v0/QR3/${ICICI_CONFIG.merchantId}`;

      const response = await axios.post(apiURL, encryptedPayload, {
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          'apikey': ICICI_CONFIG.apiKey,
          'Cache-Control': 'no-cache',
        },
        timeout: 30000
      });

      // Decrypt response
      const decryptedResponse = decryptWithMerchantPrivateKey(
        response.data,
        ICICI_CONFIG.privateKeyPath
      );

      if (decryptedResponse.success !== 'true' || !decryptedResponse.refId) {
        return res.status(400).json({
          error: decryptedResponse.message || 'Failed to generate QR',
          status: 400,
          details: decryptedResponse
        });
      }

      refId = decryptedResponse.refId;

      // Generate QR string
      qrString = generateQRString({
        merchantVPA: ICICI_CONFIG.merchantVPA,
        merchantName: ICICI_CONFIG.merchantName,
        refId: decryptedResponse.refId,
        amount: formatAmount(amount),
        mcc: ICICI_CONFIG.terminalId
      });

      // Generate Intent URL for mobile apps
      intentURL = generateIntentURL({
        merchantVPA: ICICI_CONFIG.merchantVPA,
        merchantName: ICICI_CONFIG.merchantName,
        refId: decryptedResponse.refId,
        amount: formatAmount(amount),
        mcc: ICICI_CONFIG.terminalId
      });
    }

    // Store pending transaction in database
    const pendingPayment = await prisma.pendingUPITransaction.create({
      data: {
        loanId,
        emiId: emiId || null,
        merchantTranId,
        refId: refId,
        billNumber,
        amount: parseFloat(amount),
        paymentType: paymentType || 'bulk',
        status: 'PENDING',
        qrString,
        intentURL,
        createdByAdminId: req.user?.type === 'ADMIN' ? req.user.id : null,
        createdByEmployeeId: req.user?.type === 'EMPLOYEE' ? req.user.id : null,
      }
    });

    return res.status(200).json({
      status: 200,
      data: {
        transactionId: pendingPayment.id,
        merchantTranId,
        refId: refId,
        billNumber,
        amount: formatAmount(amount),
        qrString,
        intentURL,
        message: isDevelopmentMode ? 'QR generated (Development Mode - Simulated)' : 'QR generated successfully',
        expiresIn: 900, // 15 minutes typical UPI timeout
        developmentMode: isDevelopmentMode,
      }
    });

  } catch (error) {
    console.error('Generate QR Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate QR code',
      status: 500
    });
  }
};

/**
 * ICICI Payment Callback Handler
 * POST /api/icici-payment/callback
 * Receives encrypted payment status from ICICI
 */
exports.handleCallback = async (req, res) => {
  try {
    // Decrypt callback payload
    const encryptedPayload = req.body;
    const callbackData = decryptWithMerchantPrivateKey(
      encryptedPayload,
      ICICI_CONFIG.privateKeyPath
    );

    console.log('ICICI Callback received:', callbackData);

    // Extract callback data
    const {
      merchantId,
      merchantTranId,
      BankRRN,
      PayerName,
      PayerMobile,
      PayerVA,
      PayerAmount,
      TxnStatus,
      TxnInitDate,
      TxnCompletionDate
    } = callbackData;

    // Find pending transaction
    const pendingTxn = await prisma.pendingUPITransaction.findFirst({
      where: {
        merchantTranId: merchantTranId,
        status: 'PENDING'
      },
      include: {
        loan: true
      }
    });

    if (!pendingTxn) {
      console.error('Pending transaction not found for:', merchantTranId);
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Update pending transaction status
    await prisma.pendingUPITransaction.update({
      where: { id: pendingTxn.id },
      data: {
        status: TxnStatus,
        bankRRN: BankRRN,
        payerName: PayerName,
        payerMobile: PayerMobile,
        payerVA: PayerVA,
        txnInitDate: TxnInitDate ? new Date(TxnInitDate) : null,
        txnCompletionDate: TxnCompletionDate ? new Date(TxnCompletionDate) : null,
        callbackReceivedAt: new Date(),
      }
    });

    // If payment is successful, create payment record and process
    if (TxnStatus === 'SUCCESS') {
      // Create payment record
      const payment = await prisma.payment.create({
        data: {
          loanId: pendingTxn.loanId,
          emiId: pendingTxn.emiId,
          amount: parseFloat(PayerAmount),
          paymentMode: 'UPI',
          transactionId: BankRRN,
          paymentDate: new Date(),
          status: 'PAID',
          verified: true, // Auto-approve gateway payments
          verifiedAt: new Date(),
          metadata: {
            gateway: 'ICICI',
            merchantTranId,
            refId: pendingTxn.refId,
            payerName: PayerName,
            payerMobile: PayerMobile,
            payerVA: PayerVA,
            txnInitDate: TxnInitDate,
            txnCompletionDate: TxnCompletionDate,
            callbackData: callbackData
          }
        }
      });

      // Process payment based on type
      if (pendingTxn.paymentType === 'emi' && pendingTxn.emiId) {
        // Call payPaymentById logic with useGateway=true
        // This will auto-approve the payment
        const paymentController = require('./payment.controller');

        // Mock request object for internal call
        const mockReq = {
          params: { emiId: pendingTxn.emiId },
          body: {
            amount: parseFloat(PayerAmount),
            paymentMode: 'UPI',
            transactionId: BankRRN,
            paymentDate: new Date(),
            useGateway: true // This triggers auto-approval
          },
          user: {
            type: 'ADMIN',
            id: pendingTxn.createdByAdminId || pendingTxn.createdByEmployeeId
          }
        };

        // We've already created the payment, so we need to process it
        // Update the payment we just created instead of creating a new one

      } else {
        // Bulk payment - call makePayment logic
        const paymentController = require('./payment.controller');

        const mockReq = {
          params: { loanId: pendingTxn.loanId },
          body: {
            amountPaid: parseFloat(PayerAmount),
            paymentMode: 'UPI',
            transactionId: BankRRN,
            paymentDate: new Date(),
            useGateway: true // This triggers auto-approval
          },
          user: {
            type: 'ADMIN',
            id: pendingTxn.createdByAdminId || pendingTxn.createdByEmployeeId
          }
        };
      }

      console.log('Payment processed successfully:', payment.id);
    }

    // Send success response to ICICI
    return res.status(200).json({
      status: 'received',
      merchantTranId: merchantTranId
    });

  } catch (error) {
    console.error('Callback processing error:', error);
    return res.status(500).json({
      error: error.message || 'Callback processing failed'
    });
  }
};

/**
 * Check transaction status
 * GET /api/icici-payment/status/:merchantTranId
 */
exports.checkTransactionStatus = async (req, res) => {
  try {
    const { merchantTranId } = req.params;

    // Fetch local transaction data
    const localTxn = await prisma.pendingUPITransaction.findFirst({
      where: { merchantTranId }
    });

    if (!localTxn) {
      return res.status(404).json({
        error: 'Transaction not found',
        status: 404
      });
    }

    let statusData = {};

    if (isDevelopmentMode) {
      // DEVELOPMENT MODE: Return mock status
      console.log('📱 [DEV MODE] Checking transaction status (simulated)');

      // Simulate status - for testing, transactions remain PENDING
      // In a real test, you could manually update the DB to simulate SUCCESS
      statusData = {
        status: localTxn.status,
        merchantTranId: merchantTranId,
        refId: localTxn.refId,
        amount: localTxn.amount,
        message: 'Status check (Development Mode - Simulated)',
        developmentMode: true,
        note: 'In dev mode, manually update database to simulate payment success'
      };

    } else {
      // PRODUCTION MODE: Call actual ICICI API
      const requestPayload = {
        merchantId: ICICI_CONFIG.merchantId,
        subMerchantId: ICICI_CONFIG.subMerchantId,
        terminalId: ICICI_CONFIG.terminalId,
        merchantTranId: merchantTranId
      };

      // Encrypt the payload
      const encryptedPayload = encryptWithICICIPublicKey(
        requestPayload,
        ICICI_CONFIG.publicKeyPath
      );

      // Call ICICI Transaction Status API
      const apiURL = `${ICICI_CONFIG.gatewayURL}/api/MerchantAPI/UPI/v0/TransactionStatus3/${ICICI_CONFIG.merchantId}`;

      const response = await axios.post(apiURL, encryptedPayload, {
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          'apikey': ICICI_CONFIG.apiKey,
        },
        timeout: 30000
      });

      // Decrypt response
      statusData = decryptWithMerchantPrivateKey(
        response.data,
        ICICI_CONFIG.privateKeyPath
      );
    }

    return res.status(200).json({
      status: 200,
      data: {
        ...statusData,
        localStatus: localTxn?.status,
        localData: localTxn
      }
    });

  } catch (error) {
    console.error('Status check error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to check transaction status',
      status: 500
    });
  }
};

/**
 * Get all pending UPI transactions for a loan
 * GET /api/icici-payment/pending/:loanId
 */
exports.getPendingTransactions = async (req, res) => {
  try {
    const { loanId } = req.params;

    const pendingTxns = await prisma.pendingUPITransaction.findMany({
      where: {
        loanId,
        status: 'PENDING'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return res.status(200).json({
      status: 200,
      data: pendingTxns
    });

  } catch (error) {
    console.error('Get pending transactions error:', error);
    return res.status(500).json({
      error: error.message,
      status: 500
    });
  }
};

/**
 * Initiate refund for a transaction
 * POST /api/icici-payment/refund
 * Body: { originalBankRRN, refundAmount, merchantTranId }
 */
exports.initiateRefund = async (req, res) => {
  try {
    const {
      originalBankRRN,
      originalMerchantTranId,
      refundAmount,
      note
    } = req.body;

    if (!originalBankRRN || !refundAmount) {
      return res.status(400).json({
        error: 'originalBankRRN and refundAmount are required',
        status: 400
      });
    }

    // Generate new transaction ID for refund
    const refundMerchantTranId = generateMerchantTranId();

    // Prepare refund request payload
    const requestPayload = {
      merchantId: ICICI_CONFIG.merchantId,
      subMerchantId: ICICI_CONFIG.subMerchantId,
      terminalId: ICICI_CONFIG.terminalId,
      originalBankRRN: originalBankRRN,
      merchantTranId: refundMerchantTranId,
      originalmerchantTranId: originalMerchantTranId,
      refundAmount: formatAmount(refundAmount),
      payeeVA: ICICI_CONFIG.merchantVPA,
      note: note || 'Refund request',
      onlineRefund: 'Y' // Online refund
    };

    // Encrypt the payload
    const encryptedPayload = encryptWithICICIPublicKey(
      requestPayload,
      ICICI_CONFIG.publicKeyPath
    );

    // Call ICICI Refund API
    const apiURL = `${ICICI_CONFIG.gatewayURL}/api/MerchantAPI/UPI/v0/Refund/${ICICI_CONFIG.merchantId}`;

    const response = await axios.post(apiURL, encryptedPayload, {
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'apikey': ICICI_CONFIG.apiKey,
      },
      timeout: 30000
    });

    // Decrypt response
    const refundData = decryptWithMerchantPrivateKey(
      response.data,
      ICICI_CONFIG.privateKeyPath
    );

    // Store refund request in database
    await prisma.uPIRefund.create({
      data: {
        originalBankRRN,
        originalMerchantTranId,
        refundMerchantTranId,
        refundAmount: parseFloat(refundAmount),
        status: refundData.status || 'PENDING',
        note,
        refundResponse: refundData,
        initiatedByAdminId: req.user?.type === 'ADMIN' ? req.user.id : null,
        initiatedByEmployeeId: req.user?.type === 'EMPLOYEE' ? req.user.id : null,
      }
    });

    return res.status(200).json({
      status: 200,
      data: refundData
    });

  } catch (error) {
    console.error('Refund initiation error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to initiate refund',
      status: 500
    });
  }
};

module.exports = exports;
