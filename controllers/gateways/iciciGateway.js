/**
 * ICICI EazyPay gateway adapter
 * Wraps the existing iciciPayment.controller logic for use by the abstraction layer.
 */

const prisma = require("../../lib/prisma");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const {
  encryptWithICICIPublicKey,
  decryptWithMerchantPrivateKey,
  generateQRString,
  generateIntentURL,
  generateMerchantTranId,
  formatAmount,
  generateBillNumber,
} = require("../../utils/iciciEncryption");
const { buildEffectiveConfigMap } = require("../../utils/appConfig");

async function loadStoredConfig() {
  const prisma = require("../../lib/prisma");
  const records = await prisma.appConfig.findMany({ where: { category: "payment" } });
  const map = buildEffectiveConfigMap(records);
  return map["payment.icici"] || {};
}

function buildConfig(stored) {
  return {
    merchantId: stored.merchantId || process.env.ICICI_MERCHANT_ID || "",
    subMerchantId: stored.subMerchantId || process.env.ICICI_SUB_MERCHANT_ID || stored.merchantId || process.env.ICICI_MERCHANT_ID || "",
    terminalId: stored.terminalId || process.env.ICICI_TERMINAL_ID || "5411",
    gatewayURL: stored.gatewayUrl || process.env.ICICI_GATEWAY_URL || "https://apibankingonesandbox.icicibank.com",
    apiKey: stored.apiKey || process.env.ICICI_API_KEY || "",
    merchantVPA: stored.merchantVPA || process.env.ICICI_MERCHANT_VPA || "",
    merchantName: stored.merchantName || process.env.ICICI_MERCHANT_NAME || "",
    callbackURL: stored.callbackUrl || process.env.ICICI_CALLBACK_URL || "",
    publicKeyPath: path.join(__dirname, "../../keys/icici_public_key.pem"),
    privateKeyPath: path.join(__dirname, "../../keys/merchant_private_key.pem"),
  };
}

function isDevMode(cfg) {
  return (
    !fs.existsSync(cfg.publicKeyPath) ||
    !fs.existsSync(cfg.privateKeyPath) ||
    !cfg.merchantId ||
    !cfg.apiKey
  );
}

async function generateQR({ loanId, emiId, amount, paymentType, emiAmount, fineAmount, fineDiscount, user }) {
  const stored = await loadStoredConfig();
  const cfg = buildConfig(stored);
  const devMode = isDevMode(cfg);

  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: { user: true, loanType: true },
  });
  if (!loan) throw Object.assign(new Error("Loan not found"), { statusCode: 404 });

  const merchantTranId = generateMerchantTranId();
  const billNumber = generateBillNumber("BILL");
  let qrString, intentURL, refId;

  if (devMode) {
    refId = `DEV${Date.now()}`;
    qrString = generateQRString({
      merchantVPA: cfg.merchantVPA,
      merchantName: cfg.merchantName,
      refId: merchantTranId,
      amount: formatAmount(amount),
      mcc: cfg.terminalId,
    });
    intentURL = generateIntentURL({
      merchantVPA: cfg.merchantVPA,
      merchantName: cfg.merchantName,
      refId: merchantTranId,
      amount: formatAmount(amount),
      mcc: cfg.terminalId,
    });
  } else {
    const requestPayload = {
      merchantId: cfg.merchantId,
      terminalId: cfg.terminalId,
      amount: formatAmount(amount),
      merchantTranId,
      billNumber,
    };

    const encryptedPayload = encryptWithICICIPublicKey(requestPayload, cfg.publicKeyPath);
    const apiURL = `${cfg.gatewayURL}/api/MerchantAPI/UPI/v0/QR3/${cfg.merchantId}`;

    const response = await axios.post(apiURL, encryptedPayload, {
      headers: { "Content-Type": "text/plain;charset=UTF-8", apikey: cfg.apiKey, "Cache-Control": "no-cache" },
      timeout: 30000,
    });

    const decrypted = decryptWithMerchantPrivateKey(response.data, cfg.privateKeyPath);
    if (decrypted.success !== "true" || !decrypted.refId) {
      throw Object.assign(new Error(decrypted.message || "Failed to generate QR"), { statusCode: 400, details: decrypted });
    }

    refId = decrypted.refId;
    qrString = generateQRString({ merchantVPA: cfg.merchantVPA, merchantName: cfg.merchantName, refId, amount: formatAmount(amount), mcc: cfg.terminalId });
    intentURL = generateIntentURL({ merchantVPA: cfg.merchantVPA, merchantName: cfg.merchantName, refId, amount: formatAmount(amount), mcc: cfg.terminalId });
  }

  const pending = await prisma.pendingUPITransaction.create({
    data: {
      loanId,
      emiId: emiId || null,
      merchantTranId,
      refId,
      billNumber,
      amount: parseFloat(amount),
      paymentType: paymentType || "bulk",
      status: "PENDING",
      qrString,
      intentURL,
      emiAmount: emiAmount !== undefined ? parseFloat(emiAmount) : null,
      fineAmount: fineAmount !== undefined ? parseFloat(fineAmount) : null,
      fineDiscount: fineDiscount !== undefined ? parseFloat(fineDiscount) : null,
      createdByAdminId: user?.type === "ADMIN" ? user.id : null,
      createdByEmployeeId: user?.type === "EMPLOYEE" ? user.id : null,
    },
  });

  return {
    transactionId: pending.id,
    merchantTranId,
    refId,
    billNumber,
    amount: formatAmount(amount),
    qrString,
    intentURL,
    gateway: "icici",
    developmentMode: devMode,
    message: devMode ? "QR generated (Development Mode)" : "QR generated successfully",
    expiresIn: 900,
    distribution:
      emiAmount !== undefined || fineAmount !== undefined
        ? {
            emiAmount: emiAmount !== undefined ? parseFloat(emiAmount) : null,
            fineAmount: fineAmount !== undefined ? parseFloat(fineAmount) : null,
            fineDiscount: fineDiscount !== undefined ? parseFloat(fineDiscount) : null,
          }
        : null,
  };
}

async function checkStatus(merchantTranId) {
  const stored = await loadStoredConfig();
  const cfg = buildConfig(stored);
  const devMode = isDevMode(cfg);

  const localTxn = await prisma.pendingUPITransaction.findFirst({ where: { merchantTranId } });
  if (!localTxn) throw Object.assign(new Error("Transaction not found"), { statusCode: 404 });

  let statusData;

  if (devMode) {
    statusData = {
      status: localTxn.status,
      merchantTranId,
      refId: localTxn.refId,
      amount: localTxn.amount,
      message: "Status check (Development Mode)",
      developmentMode: true,
    };
  } else {
    const requestPayload = {
      merchantId: cfg.merchantId,
      subMerchantId: cfg.subMerchantId,
      terminalId: cfg.terminalId,
      merchantTranId,
    };
    const encryptedPayload = encryptWithICICIPublicKey(requestPayload, cfg.publicKeyPath);
    const apiURL = `${cfg.gatewayURL}/api/MerchantAPI/UPI/v0/TransactionStatus3/${cfg.merchantId}`;
    const response = await axios.post(apiURL, encryptedPayload, {
      headers: { "Content-Type": "text/plain;charset=UTF-8", apikey: cfg.apiKey },
      timeout: 30000,
    });
    statusData = decryptWithMerchantPrivateKey(response.data, cfg.privateKeyPath);
  }

  return { ...statusData, gateway: "icici", localStatus: localTxn.status, localData: localTxn };
}

module.exports = { generateQR, checkStatus };
