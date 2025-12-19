// iciciEncryption.js
// ICICI Bank UPI/QR Payment Gateway Encryption & Decryption Utilities
// Uses RSA/ECB/PKCS1Padding for asymmetric encryption as per ICICI API documentation

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Encrypt payload using ICICI Bank's public key
 * Algorithm: RSA/ECB/PKCS1Padding
 * @param {Object|String} payload - Data to encrypt (will be stringified if object)
 * @param {String} publicKeyPath - Path to ICICI Bank's public key certificate (.pem/.cer)
 * @returns {String} Base64 encoded encrypted string
 */
function encryptWithICICIPublicKey(payload, publicKeyPath) {
  try {
    // Convert payload to JSON string if it's an object
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

    // Read ICICI Bank's public key
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

    // Encrypt using RSA with PKCS1 padding
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING
      },
      Buffer.from(payloadString, 'utf8')
    );

    // Return Base64 encoded encrypted data
    return encrypted.toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error(`Failed to encrypt payload: ${error.message}`);
  }
}

/**
 * Decrypt response using merchant's private key
 * Algorithm: RSA/ECB/PKCS1Padding
 * @param {String} encryptedPayload - Base64 encoded encrypted string
 * @param {String} privateKeyPath - Path to merchant's private key (.p12/.pem)
 * @param {String} passphrase - Optional passphrase for the private key
 * @returns {Object} Decrypted JSON object
 */
function decryptWithMerchantPrivateKey(encryptedPayload, privateKeyPath, passphrase = null) {
  try {
    // Read merchant's private key
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

    // Base64 decode the encrypted payload
    const encryptedBuffer = Buffer.from(encryptedPayload, 'base64');

    // Decrypt using RSA with PKCS1 padding
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
        passphrase: passphrase
      },
      encryptedBuffer
    );

    // Parse and return JSON
    const decryptedString = decrypted.toString('utf8');
    return JSON.parse(decryptedString);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error(`Failed to decrypt payload: ${error.message}`);
  }
}

/**
 * Generate QR code string according to UPI specification
 * Format: upi://pay?pa=<VPA>&pn=<name>&tr=<refId>&am=<amount>&cu=INR&mc=<MCC>
 * @param {Object} params - QR parameters
 * @returns {String} UPI QR string
 */
function generateQRString(params) {
  const {
    merchantVPA,
    merchantName,
    refId,
    amount,
    mcc = '5411' // Default MCC code for grocery stores
  } = params;

  // Validate required parameters
  if (!merchantVPA || !merchantName || !refId || !amount) {
    throw new Error('Missing required QR parameters: merchantVPA, merchantName, refId, amount');
  }

  // Format: upi://pay?pa=<VPA>&pn=<name>&tr=<refId>&am=<amount>&cu=INR&mc=<MCC>
  const qrString = `upi://pay?pa=${merchantVPA}&pn=${encodeURIComponent(merchantName)}&tr=${refId}&am=${amount}&cu=INR&mc=${mcc}`;

  return qrString;
}

/**
 * Generate Intent URL for mobile app payment
 * Similar to QR but can be used to trigger UPI apps on mobile
 * @param {Object} params - Intent parameters
 * @returns {String} UPI Intent URL
 */
function generateIntentURL(params) {
  // Same format as QR string for UPI intent
  return generateQRString(params);
}

/**
 * Generate unique merchant transaction ID
 * Format: timestamp + random string
 * @returns {String} Unique transaction ID
 */
function generateMerchantTranId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `TXN${timestamp}${random}`.toUpperCase();
}

/**
 * Validate ICICI callback signature (if provided)
 * @param {Object} callbackData - Callback data from ICICI
 * @param {String} signature - Signature to verify
 * @param {String} publicKeyPath - Path to ICICI's public key
 * @returns {Boolean} true if valid
 */
function validateCallbackSignature(callbackData, signature, publicKeyPath) {
  try {
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    const dataString = JSON.stringify(callbackData);

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(dataString);

    return verifier.verify(publicKey, signature, 'base64');
  } catch (error) {
    console.error('Signature validation error:', error);
    return false;
  }
}

/**
 * Format amount to 2 decimal places as required by ICICI
 * @param {Number} amount - Amount to format
 * @returns {String} Formatted amount (e.g., "100.00")
 */
function formatAmount(amount) {
  return Number(amount).toFixed(2);
}

/**
 * Generate bill number / order number
 * @param {String} prefix - Optional prefix
 * @returns {String} Bill number
 */
function generateBillNumber(prefix = 'BILL') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}${timestamp}${random}`.toUpperCase();
}

module.exports = {
  encryptWithICICIPublicKey,
  decryptWithMerchantPrivateKey,
  generateQRString,
  generateIntentURL,
  generateMerchantTranId,
  validateCallbackSignature,
  formatAmount,
  generateBillNumber
};
