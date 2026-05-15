/**
 * Cashfree gateway adapter (stub — implement when credentials are available)
 */

async function generateQR(params) {
  throw Object.assign(
    new Error("Cashfree gateway is not yet implemented. Please contact support or use ICICI EazyPay."),
    { statusCode: 501 }
  );
}

async function checkStatus(merchantTranId) {
  throw Object.assign(
    new Error("Cashfree gateway is not yet implemented."),
    { statusCode: 501 }
  );
}

module.exports = { generateQR, checkStatus };
