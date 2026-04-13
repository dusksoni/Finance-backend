// utils/piiUtils.js
// Transparent encrypt/decrypt helpers for PII fields (Aadhaar, PAN, bank account)
// Uses AES-256-GCM via encryptionUtils.js
// Set PII_ENCRYPTION_KEY in .env to enable; if not set, data is stored as-is (development mode)

const { encrypt, decrypt } = require("./encryptionUtils");

const KEY = process.env.PII_ENCRYPTION_KEY;
const ENCRYPTION_ENABLED = !!KEY;

if (!ENCRYPTION_ENABLED) {
  console.warn("⚠️  PII_ENCRYPTION_KEY not set — PII fields stored in plaintext. Set this in production.");
}

/**
 * Encrypt a PII field value.
 * Returns the original value if encryption is not enabled.
 */
function encryptPII(value) {
  if (!value || !ENCRYPTION_ENABLED) return value;
  try {
    return encrypt(String(value), KEY);
  } catch {
    return value;
  }
}

/**
 * Decrypt a PII field value.
 * Returns the original value if encryption is not enabled or value doesn't look encrypted.
 */
function decryptPII(value) {
  if (!value || !ENCRYPTION_ENABLED) return value;
  try {
    return decrypt(String(value), KEY);
  } catch {
    // If decryption fails, return as-is (may be plaintext from before encryption was enabled)
    return value;
  }
}

/**
 * Encrypt all PII fields in an object before writing to DB.
 * Pass in { aadhaarNumber, panNumber, bankAccountNumber } — any subset is fine.
 */
function encryptPIIFields(data) {
  const result = { ...data };
  if (result.aadhaarNumber !== undefined) result.aadhaarNumber = encryptPII(result.aadhaarNumber);
  if (result.panNumber !== undefined) result.panNumber = encryptPII(result.panNumber);
  if (result.bankAccountNumber !== undefined) result.bankAccountNumber = encryptPII(result.bankAccountNumber);
  if (result.accountNumber !== undefined) result.accountNumber = encryptPII(result.accountNumber);
  return result;
}

/**
 * Decrypt all PII fields in an object after reading from DB.
 */
function decryptPIIFields(data) {
  if (!data) return data;
  const result = { ...data };
  if (result.aadhaarNumber !== undefined) result.aadhaarNumber = decryptPII(result.aadhaarNumber);
  if (result.panNumber !== undefined) result.panNumber = decryptPII(result.panNumber);
  if (result.bankAccountNumber !== undefined) result.bankAccountNumber = decryptPII(result.bankAccountNumber);
  if (result.accountNumber !== undefined) result.accountNumber = decryptPII(result.accountNumber);
  return result;
}

/**
 * Mask a PII field for display (show last 4 chars only).
 */
function maskPII(value, visibleChars = 4) {
  if (!value) return null;
  const str = String(value);
  if (str.length <= visibleChars) return str;
  return "*".repeat(str.length - visibleChars) + str.slice(-visibleChars);
}

module.exports = { encryptPII, decryptPII, encryptPIIFields, decryptPIIFields, maskPII };
