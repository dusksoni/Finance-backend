/**
 * Orange PG (PhiCommerce) gateway adapter
 * Docs: https://qa.phicommerce.com/pg/api/v2
 * Auth: HMAC-SHA256 signature = sha256(merchantId + "|" + orderId + "|" + amount + "|" + secretKey)
 */

const crypto = require("crypto");
const axios = require("axios");
const prisma = require("../../lib/prisma");
const { buildEffectiveConfigMap } = require("../../utils/appConfig");

async function getConfig() {
  // Prefer AppConfig DB values (set via config UI) — fall back to env vars
  const records = await prisma.appConfig.findMany({ where: { category: "payment" } });
  const map = buildEffectiveConfigMap(records);
  const db = map["payment.orange"] || {};

  return {
    merchantId:   db.merchantId   || process.env.ORANGE_PG_MERCHANT_ID  || "",
    secretKey:    db.secretKey    || process.env.ORANGE_PG_SECRET_KEY    || "",
    aggregatorId: db.aggregatorId || process.env.ORANGE_PG_AGGREGATOR_ID || "",
    currencyCode: db.currencyCode || process.env.ORANGE_PG_CURRENCY_CODE || "356",
    apiUrl:       (db.apiUrl      || process.env.ORANGE_PG_API_URL       || "https://qa.phicommerce.com/pg/api/v2").replace(/\/$/, ""),
    returnUrl:    db.returnUrl    || process.env.ORANGE_PG_RETURN_URL    || "",
  };
}

function isConfigured(cfg) {
  return !!(cfg.merchantId && cfg.secretKey && cfg.merchantId !== "T_03341" && cfg.secretKey !== "abc");
}

function sign(merchantId, orderId, amount, secretKey) {
  const data = `${merchantId}|${orderId}|${amount}|${secretKey}`;
  return crypto.createHmac("sha256", secretKey).update(data).digest("hex").toUpperCase();
}

function generateOrderId() {
  return `ORD${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
}

function formatAmount(amount) {
  // PhiCommerce expects amount in paise (integer) or decimal string — use 2dp string
  return parseFloat(amount).toFixed(2);
}

async function generateQR({ loanId, emiId, amount, paymentType, emiAmount, fineAmount, fineDiscount, user }) {
  const cfg = await getConfig();

  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: { user: true, loanType: true },
  });
  if (!loan) throw Object.assign(new Error("Loan not found"), { statusCode: 404 });

  const orderId = generateOrderId();
  const amtFormatted = formatAmount(amount);
  const signature = sign(cfg.merchantId, orderId, amtFormatted, cfg.secretKey);

  let qrString, refId;

  if (!isConfigured(cfg)) {
    // Dev / sandbox with test credentials — generate a UPI QR string locally
    // PhiCommerce sandbox doesn't return scannable QR, so we build a standard UPI string
    refId = `DEVORD${Date.now()}`;
    const vpa = `${cfg.merchantId}@ybl`;
    qrString = `upi://pay?pa=${vpa}&pn=Finance&am=${amtFormatted}&tr=${orderId}&cu=INR`;
    console.warn("⚠️  Orange PG: using test credentials — QR is a local UPI string, not from gateway");
  } else {
    // Call PhiCommerce QR generation endpoint
    const payload = {
      merchantId: cfg.merchantId,
      orderId,
      amount: amtFormatted,
      currencyCode: cfg.currencyCode,
      signature,
      // Only include aggregatorId if explicitly set (P1006 if wrong)
      ...(cfg.aggregatorId ? { aggregatorId: cfg.aggregatorId } : {}),
    };

    const response = await axios.post(`${cfg.apiUrl}/qrcode/generate`, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });

    const data = response.data;

    if (data.statusCode !== "00" && data.responseCode !== "00") {
      throw Object.assign(
        new Error(data.statusDesc || data.responseMessage || "Orange PG: QR generation failed"),
        { statusCode: 400, details: data }
      );
    }

    qrString = data.qrString || data.qrCode || data.data?.qrString || "";
    refId = data.orderId || data.pgOrderId || orderId;
  }

  const pending = await prisma.pendingUPITransaction.create({
    data: {
      loanId,
      emiId: emiId || null,
      merchantTranId: orderId,
      refId: refId || orderId,
      billNumber: orderId,
      amount: parseFloat(amount),
      paymentType: paymentType || "bulk",
      status: "PENDING",
      qrString,
      intentURL: qrString, // same string works as UPI intent URL
      emiAmount: emiAmount !== undefined ? parseFloat(emiAmount) : null,
      fineAmount: fineAmount !== undefined ? parseFloat(fineAmount) : null,
      fineDiscount: fineDiscount !== undefined ? parseFloat(fineDiscount) : null,
      createdByAdminId: user?.type === "ADMIN" ? user.id : null,
      createdByEmployeeId: user?.type === "EMPLOYEE" ? user.id : null,
    },
  });

  return {
    transactionId: pending.id,
    merchantTranId: orderId,
    refId: refId || orderId,
    billNumber: orderId,
    amount: amtFormatted,
    qrString,
    intentURL: qrString,
    gateway: "orange",
    developmentMode: !isConfigured(cfg),
    message: isConfigured(cfg) ? "QR generated successfully" : "QR generated (test credentials)",
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
  const cfg = await getConfig();

  const localTxn = await prisma.pendingUPITransaction.findFirst({ where: { merchantTranId } });
  if (!localTxn) throw Object.assign(new Error("Transaction not found"), { statusCode: 404 });

  if (!isConfigured(cfg)) {
    return {
      status: localTxn.status,
      merchantTranId,
      refId: localTxn.refId,
      amount: localTxn.amount,
      message: "Status check (test credentials — update DB to simulate success)",
      developmentMode: true,
      gateway: "orange",
      localStatus: localTxn.status,
      localData: localTxn,
    };
  }

  const amtFormatted = formatAmount(localTxn.amount);
  const signature = sign(cfg.merchantId, merchantTranId, amtFormatted, cfg.secretKey);

  const payload = {
    merchantId: cfg.merchantId,
    orderId: merchantTranId,
    amount: amtFormatted,
    signature,
    ...(cfg.aggregatorId ? { aggregatorId: cfg.aggregatorId } : {}),
  };

  const response = await axios.post(`${cfg.apiUrl}/transaction/status`, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 30000,
  });

  const data = response.data;

  // Map PhiCommerce status codes to our SUCCESS/FAILURE/PENDING
  const pgStatus = data.transactionStatus || data.status || data.statusCode || "";
  let status = "PENDING";
  if (["00", "SUCCESS", "CAPTURED", "TXN_SUCCESS"].includes(pgStatus)) status = "SUCCESS";
  else if (["FAILED", "FAILURE", "TXN_FAILURE", "DECLINED"].includes(pgStatus)) status = "FAILURE";

  // Auto-process payment if success
  if (status === "SUCCESS" && localTxn.status === "PENDING") {
    await prisma.pendingUPITransaction.update({
      where: { id: localTxn.id },
      data: {
        status: "SUCCESS",
        bankRRN: data.bankRRN || data.rrn || null,
        txnCompletionDate: new Date(),
        callbackReceivedAt: new Date(),
      },
    });

    const paymentController = require("../payment.controller");
    const hasDistribution = localTxn.emiAmount !== null || localTxn.fineAmount !== null;

    const mockUser = {
      type: localTxn.createdByAdminId ? "ADMIN" : "EMPLOYEE",
      id: localTxn.createdByAdminId || localTxn.createdByEmployeeId,
      adminId: localTxn.createdByAdminId,
      employeeId: localTxn.createdByEmployeeId,
    };

    if (localTxn.paymentType === "emi" && localTxn.emiId) {
      const bodyData = {
        amount: localTxn.amount,
        paymentMode: "UPI",
        transactionId: data.bankRRN || data.rrn || merchantTranId,
        paymentDate: new Date(),
        useGateway: true,
        ...(hasDistribution && localTxn.emiAmount !== null ? { emiAmount: parseFloat(localTxn.emiAmount) } : {}),
        ...(hasDistribution && localTxn.fineAmount !== null ? { fineAmount: parseFloat(localTxn.fineAmount) } : {}),
        ...(hasDistribution && localTxn.fineDiscount !== null ? { discount: parseFloat(localTxn.fineDiscount) } : {}),
      };
      const mockReq = { params: { emiId: localTxn.emiId }, body: bodyData, user: mockUser };
      const mockRes = { status: (c) => ({ json: (d) => d }), json: (d) => d };
      await paymentController.payPaymentById(mockReq, mockRes);
    } else {
      const bodyData = {
        amountPaid: localTxn.amount,
        paymentMode: "UPI",
        transactionId: data.bankRRN || data.rrn || merchantTranId,
        paymentDate: new Date(),
        useGateway: true,
        ...(hasDistribution && localTxn.emiAmount !== null ? { totalEmiAmount: parseFloat(localTxn.emiAmount) } : {}),
        ...(hasDistribution && localTxn.fineAmount !== null ? { totalFineAmount: parseFloat(localTxn.fineAmount) } : {}),
        ...(hasDistribution && localTxn.fineDiscount !== null ? { fineDiscount: parseFloat(localTxn.fineDiscount) } : {}),
      };
      const mockReq = { params: { loanId: localTxn.loanId }, body: bodyData, user: mockUser };
      const mockRes = { status: (c) => ({ json: (d) => d }), json: (d) => d };
      await paymentController.makePayment(mockReq, mockRes);
    }
  }

  return {
    ...data,
    status,
    gateway: "orange",
    localStatus: localTxn.status,
    localData: localTxn,
  };
}

// Webhook callback handler — called by PhiCommerce after payment
async function handleCallback(body) {
  const cfg = await getConfig();
  const { orderId, transactionStatus, bankRRN, amount } = body;

  const localTxn = await prisma.pendingUPITransaction.findFirst({ where: { merchantTranId: orderId } });
  if (!localTxn || localTxn.status !== "PENDING") return;

  // Verify signature
  const expectedSig = sign(cfg.merchantId, orderId, formatAmount(localTxn.amount), cfg.secretKey);
  if (body.signature && body.signature.toUpperCase() !== expectedSig) {
    console.error("Orange PG callback: signature mismatch for orderId", orderId);
    return;
  }

  const success = ["00", "SUCCESS", "CAPTURED", "TXN_SUCCESS"].includes(transactionStatus || "");

  await prisma.pendingUPITransaction.update({
    where: { id: localTxn.id },
    data: {
      status: success ? "SUCCESS" : "FAILURE",
      bankRRN: bankRRN || null,
      txnCompletionDate: new Date(),
      callbackReceivedAt: new Date(),
    },
  });

  if (success) {
    await checkStatus(orderId); // reuse — it will auto-process the payment
  }
}

module.exports = { generateQR, checkStatus, handleCallback };
