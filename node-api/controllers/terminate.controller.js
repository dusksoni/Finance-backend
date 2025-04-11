// node-api/controllers/terminate.controller.js
const axios = require("axios");
const { encryptWithJava } = require("../utils/encryptorBridge");

const TERMINATION_URL = "https://staging.parivahan.gov.in/vahanHypothecationWS/v1/termination";

exports.terminateHypothecation = async (req, res) => {
  try {
    const input = {
      regnNo: req.body.regnNo,
      chassisNo: req.body.chassisNo,
      terminationDt: req.body.terminationDt,
      docUrl: req.body.docUrl,
      userId: "nictest",
      userPwd: "Nic@123"
    };

    const encrypted = await encryptWithJava(JSON.stringify(input));

    console.log(encrypted)

    const response = await axios.post(
      TERMINATION_URL,
      {
        clientId: "nictest",
        encData: encrypted
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );

    // ✅ Log admin action
    await logAdminAction({
      adminId: req.user?.adminId, // works if authMiddleware sets req.user
      action: "TERMINATED VEHICLE LOAN",
      table: "TerminationRequest",
      metadata: {
        regnNo,
        chassisNo,
        terminationDt,
        docUrl,
        encrypted,
        responseSummary: rawResponse?.statusDesc || rawResponse?.status || "No status"
      }
    });

    res.json({ rawResponse: response.data });
  } catch (err) {
    console.error("Error terminating hypothecation:", err.message);
    res.status(500).json({ error: "Something went wrong", details: err.message });
  }
};
