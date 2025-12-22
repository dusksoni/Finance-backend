// utils/iciciPaymentGateway.js - ICICI Payment Gateway Integration
const crypto = require("crypto");
const axios = require("axios");

/**
 * ICICI Payment Gateway Configuration
 *
 * Note: Replace these with your actual ICICI credentials
 * Environment variables should be set in .env file
 */

const ICICI_CONFIG = {
  merchantId: process.env.ICICI_MERCHANT_ID || "MERCHANT_ID",
  apiKey: process.env.ICICI_API_KEY || "API_KEY",
  secretKey: process.env.ICICI_SECRET_KEY || "SECRET_KEY",
  baseUrl: process.env.ICICI_GATEWAY_URL || "https://www.eazypayuat.icicibank.com",
  returnUrl: process.env.ICICI_RETURN_URL || "http://localhost:3000/payment/callback",
  // For production, use: https://www.eazypay.icicibank.com
};

/**
 * Generate SHA256 hash for payment signature
 * @param {string} data - Data to hash
 * @returns {string} - Hex hash
 */
function generateHash(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Generate HMAC SHA256 signature
 * @param {string} data - Data to sign
 * @param {string} key - Secret key
 * @returns {string} - Hex signature
 */
function generateHmacSignature(data, key) {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

/**
 * Create payment order with ICICI
 * @param {Object} params - Payment parameters
 * @param {string} params.orderId - Unique order ID
 * @param {number} params.amount - Amount in INR
 * @param {string} params.customerName - Customer name
 * @param {string} params.customerEmail - Customer email
 * @param {string} params.customerPhone - Customer phone
 * @param {string} params.description - Payment description
 * @returns {Promise<Object>} - Payment order response
 */
async function createPaymentOrder({
  orderId,
  amount,
  customerName,
  customerEmail,
  customerPhone,
  description,
}) {
  try {
    // Convert amount to paise (ICICI expects amount in smallest currency unit)
    const amountInPaise = Math.round(amount * 100);

    // Build request payload
    const payload = {
      merchantId: ICICI_CONFIG.merchantId,
      mandatoryFields: "MID|AMT|TXN_ID|CUST_ID",
      optionalFields: "CUST_NAME|CUST_EMAIL|CUST_MOBILE|DESC",
      returnUrl: ICICI_CONFIG.returnUrl,
      reference: orderId,
      submerchantId: ICICI_CONFIG.merchantId,
      txnType: "SALE",
      orderId: orderId,
      amount: amountInPaise.toString(),
      currency: "INR",
      custId: customerPhone || customerEmail,
      custName: customerName,
      custEmail: customerEmail,
      custMobile: customerPhone,
      description: description || "Loan Payment",
      txnDate: new Date().toISOString(),
    };

    // Generate signature
    const signatureString = `${ICICI_CONFIG.merchantId}|${orderId}|${amountInPaise}|${ICICI_CONFIG.secretKey}`;
    const signature = generateHmacSignature(signatureString, ICICI_CONFIG.secretKey);

    payload.signature = signature;

    // Make API call to ICICI
    const response = await axios.post(
      `${ICICI_CONFIG.baseUrl}/payment/request`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "API-KEY": ICICI_CONFIG.apiKey,
        },
        timeout: 30000,
      }
    );

    return {
      success: true,
      orderId: orderId,
      paymentUrl: response.data.paymentUrl || `${ICICI_CONFIG.baseUrl}/payment/${response.data.paymentId}`,
      paymentId: response.data.paymentId,
      signature: signature,
      data: response.data,
    };
  } catch (error) {
    console.error("ICICI Payment Order Creation Error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

/**
 * Verify payment signature from callback
 * @param {Object} params - Payment callback params
 * @param {string} params.orderId - Order ID
 * @param {string} params.paymentId - Payment ID
 * @param {string} params.signature - Signature from gateway
 * @param {string} params.status - Payment status
 * @returns {boolean} - Signature valid or not
 */
function verifyPaymentSignature({ orderId, paymentId, signature, status }) {
  try {
    const signatureString = `${orderId}|${paymentId}|${status}|${ICICI_CONFIG.secretKey}`;
    const expectedSignature = generateHmacSignature(signatureString, ICICI_CONFIG.secretKey);

    return signature === expectedSignature;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

/**
 * Check payment status with ICICI
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} - Payment status response
 */
async function checkPaymentStatus(orderId) {
  try {
    const payload = {
      merchantId: ICICI_CONFIG.merchantId,
      orderId: orderId,
    };

    // Generate signature for status check
    const signatureString = `${ICICI_CONFIG.merchantId}|${orderId}|${ICICI_CONFIG.secretKey}`;
    const signature = generateHmacSignature(signatureString, ICICI_CONFIG.secretKey);

    payload.signature = signature;

    const response = await axios.post(
      `${ICICI_CONFIG.baseUrl}/payment/status`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "API-KEY": ICICI_CONFIG.apiKey,
        },
        timeout: 30000,
      }
    );

    return {
      success: true,
      status: response.data.status,
      paymentId: response.data.paymentId,
      amount: response.data.amount,
      data: response.data,
    };
  } catch (error) {
    console.error("ICICI Payment Status Check Error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

/**
 * Initiate refund
 * @param {Object} params - Refund parameters
 * @param {string} params.paymentId - Original payment ID
 * @param {number} params.amount - Amount to refund
 * @param {string} params.reason - Refund reason
 * @returns {Promise<Object>} - Refund response
 */
async function initiateRefund({ paymentId, amount, reason }) {
  try {
    const amountInPaise = Math.round(amount * 100);

    const payload = {
      merchantId: ICICI_CONFIG.merchantId,
      paymentId: paymentId,
      amount: amountInPaise.toString(),
      reason: reason || "Customer requested refund",
    };

    const signatureString = `${ICICI_CONFIG.merchantId}|${paymentId}|${amountInPaise}|${ICICI_CONFIG.secretKey}`;
    const signature = generateHmacSignature(signatureString, ICICI_CONFIG.secretKey);

    payload.signature = signature;

    const response = await axios.post(
      `${ICICI_CONFIG.baseUrl}/payment/refund`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "API-KEY": ICICI_CONFIG.apiKey,
        },
        timeout: 30000,
      }
    );

    return {
      success: true,
      refundId: response.data.refundId,
      status: response.data.status,
      data: response.data,
    };
  } catch (error) {
    console.error("ICICI Refund Error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

/**
 * Generate payment link for UPI/other methods
 * @param {Object} params - Payment link parameters
 * @param {string} params.orderId - Order ID
 * @param {number} params.amount - Amount in INR
 * @param {string} params.customerName - Customer name
 * @param {string} params.customerPhone - Customer phone
 * @returns {Object} - Payment link details
 */
function generatePaymentLink({ orderId, amount, customerName, customerPhone }) {
  const amountInPaise = Math.round(amount * 100);

  // Generate signature
  const signatureString = `${ICICI_CONFIG.merchantId}|${orderId}|${amountInPaise}|${ICICI_CONFIG.secretKey}`;
  const signature = generateHmacSignature(signatureString, ICICI_CONFIG.secretKey);

  // Build payment URL with query params
  const params = new URLSearchParams({
    merchantId: ICICI_CONFIG.merchantId,
    orderId: orderId,
    amount: amountInPaise.toString(),
    currency: "INR",
    custName: customerName,
    custMobile: customerPhone,
    returnUrl: ICICI_CONFIG.returnUrl,
    signature: signature,
  });

  return {
    paymentUrl: `${ICICI_CONFIG.baseUrl}/payment?${params.toString()}`,
    orderId: orderId,
    signature: signature,
    qrCodeUrl: `${ICICI_CONFIG.baseUrl}/payment/qr?${params.toString()}`,
  };
}

module.exports = {
  createPaymentOrder,
  verifyPaymentSignature,
  checkPaymentStatus,
  initiateRefund,
  generatePaymentLink,
  ICICI_CONFIG,
};
