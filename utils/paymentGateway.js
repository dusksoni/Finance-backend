/**
 * Payment Gateway Abstraction Layer
 *
 * Reads `payment.settings.activeGateway` from AppConfig at runtime.
 * All payment flows call generateQR() / checkStatus() here — the correct
 * gateway implementation is selected automatically.
 *
 * Adding a new gateway:
 *   1. Create controllers/gateways/<name>Gateway.js exporting { generateQR, checkStatus }
 *   2. Add a case below
 *   3. Add config key "payment.<name>" to utils/appConfig.js
 *   4. Add fields to GATEWAYS array in Finance-frontend/src/pages/admin/config/nbfcConfig.tsx
 */

const prisma = require("../lib/prisma");
const { buildEffectiveConfigMap } = require("./appConfig");

async function getActiveGateway() {
  const records = await prisma.appConfig.findMany({
    where: { category: "payment" },
  });
  const configMap = buildEffectiveConfigMap(records);
  return (configMap["payment.settings"]?.activeGateway || "none").toLowerCase();
}

async function getGatewayConfig(gatewayKey) {
  const records = await prisma.appConfig.findMany({
    where: { category: "payment" },
  });
  const configMap = buildEffectiveConfigMap(records);
  return configMap[gatewayKey] || {};
}

/**
 * generateQR — unified entry point for QR/payment initiation
 * @param {object} params  { loanId, emiId?, amount, paymentType, emiAmount?, fineAmount?, fineDiscount?, user }
 * @returns {object}  { transactionId, merchantTranId, qrString, intentURL, amount, expiresIn, gateway, ... }
 */
async function generateQR(params) {
  const gateway = await getActiveGateway();

  switch (gateway) {
    case "orange": {
      const handler = require("../controllers/gateways/orangeGateway");
      return handler.generateQR(params);
    }
    case "razorpay": {
      const handler = require("../controllers/gateways/razorpayGateway");
      return handler.generateQR(params);
    }
    case "cashfree": {
      const handler = require("../controllers/gateways/cashfreeGateway");
      return handler.generateQR(params);
    }
    case "payu": {
      const handler = require("../controllers/gateways/payuGateway");
      return handler.generateQR(params);
    }
    case "none":
    default:
      throw Object.assign(
        new Error("No payment gateway is configured. Go to Settings → Payment Gateways to enable one."),
        { statusCode: 503 }
      );
  }
}

/**
 * checkStatus — unified entry point for polling transaction status
 * @param {string} merchantTranId
 * @returns {object}  { status, localStatus, localData, gateway, ... }
 */
async function checkStatus(merchantTranId) {
  const gateway = await getActiveGateway();

  switch (gateway) {
    case "orange": {
      const handler = require("../controllers/gateways/orangeGateway");
      return handler.checkStatus(merchantTranId);
    }
    case "razorpay": {
      const handler = require("../controllers/gateways/razorpayGateway");
      return handler.checkStatus(merchantTranId);
    }
    case "cashfree": {
      const handler = require("../controllers/gateways/cashfreeGateway");
      return handler.checkStatus(merchantTranId);
    }
    case "payu": {
      const handler = require("../controllers/gateways/payuGateway");
      return handler.checkStatus(merchantTranId);
    }
    case "none":
    default:
      throw Object.assign(
        new Error("No payment gateway is configured."),
        { statusCode: 503 }
      );
  }
}

module.exports = { generateQR, checkStatus, getActiveGateway, getGatewayConfig };
