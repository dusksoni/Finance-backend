const axios = require("axios");
const moment = require("moment");
const { encrypt, decrypt } = require("../utils/yourEncryptHelpers");

const SECRET_KEY = process.env.SECRET_KEY_TERMINATE;
const CLIENT_ID = process.env.CLIENT_ID_TERMINATE;
const USER_PWD = process.env.USER_PWD_TERMINATE;
const TERMINATION_URL = "https://vahan.parivahan.gov.in/vahanHypothecationWS/v1/termination";

/**
 * Returns true if all EMIs for a loan are PAID or pendingAmount is 0
 */
async function shouldCloseLoan(prismaOrTx, loanId) {
  const pendingEmis = await prismaOrTx.eMI.count({
    where: { loanId, status: { not: "PAID" } }
  });
  if (pendingEmis === 0) return true;
  const loan = await prismaOrTx.loan.findUnique({ where: { id: loanId } });
  return loan.pendingAmount <= 0;
}

/**
 * Terminate hypothecation for a TwoWheelerLoan
 */
async function tryAutoTerminateHypothecation({
  prismaOrTx,
  twoWheelerLoanId,
  regnNo,
  chassisNo,
  terminationDt,
  doc,
  userContext = {},
}) {
  try {
    const requestPayload = {
      regnNo,
      chassisNo,
      terminationDt: moment(terminationDt).format("YYYY-MM-DD"),
      docUrl: doc?.secure_url || "",
      userId: CLIENT_ID,
      userPwd: USER_PWD,
    };
    const encryptedData = encrypt(JSON.stringify(requestPayload), SECRET_KEY);
    const { data: vahanResponse } = await axios.post(
      TERMINATION_URL,
      { clientId: CLIENT_ID, encData: encryptedData },
      { headers: { "Content-Type": "application/json" } }
    );
    const decryptedData = decrypt(vahanResponse.encData, SECRET_KEY);
    let parsedResponse = {};
    try {
      parsedResponse = JSON.parse(decryptedData);
    } catch (e) {
      console.error("Failed to parse decrypted data:", decryptedData);
      parsedResponse = { responseMessage: "Invalid JSON from API", responseCode: 500 };
    }
    let file = null;
    if (doc?.secure_url) {
      file = await prismaOrTx.file.create({
        data: {
          url: doc.secure_url || "",
          publicId: doc.public_id || "",
          resourceType: doc.resource_type || "",
          format: doc.format || "",
        },
      });
    }
    const terminationRequest = await prismaOrTx.terminationRequest.create({
      data: {
        twoWheelerLoanId: { connect: { id: twoWheelerLoanId } }, // link to TwoWheelerLoan
        regnNo,
        chassisNo,
        terminationDt: new Date(terminationDt),
        encryptedData,
        response: parsedResponse.responseMessage,
        status: parsedResponse.responseCode,
        errorMessage: parsedResponse.responseCode === 200 ? null : parsedResponse.responseMessage,
        adminId: userContext?.adminId || null,
        employee: userContext?.employeeId ? { connect: { id: userContext.employeeId } } : null,
        createdBy: userContext?.type || "unknown",
        docFileId: file?.id || null,
      },
    });
    // Optional: set a flag or status on TwoWheelerLoan if desired
    if (parsedResponse.responseCode === 200 && twoWheelerLoanId) {
      await prismaOrTx.twoWheelerLoan.update({
        where: { id: twoWheelerLoanId },
        data: { hypothecationTerminated: true } // add in your schema if you want
      });
    }
    return {
      success: parsedResponse.responseCode === 200,
      response: parsedResponse,
      terminationRequestId: terminationRequest.id,
    };
  } catch (error) {
    console.error("Auto-terminate hypothecation error:", error);
    return {
      success: false,
      message: "Internal server error",
      details: error.message,
    };
  }
}

module.exports = {
  shouldCloseLoan,
  tryAutoTerminateHypothecation,
};
