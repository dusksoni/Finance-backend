const axios = require("axios");
const prisma = require("../lib/prisma");
const moment = require("moment");
const { encrypt, decrypt } = require("../utils/encryptionUtils");
const logAction = require("../utils/adminLogger");

const SECRET_KEY = process.env.SECRET_KEY_TERMINATE;
const CLIENT_ID = process.env.CLIENT_ID_TERMINATE;
const USER_PWD = process.env.USER_PWD_TERMINATE;
const TERMINATION_URL = "https://vahan.parivahan.gov.in/vahanHypothecationWS/v1/termination";

exports.terminateHypothecation = async (req, res) => {
  try {
    const { regnNo, chassisNo, terminationDt, doc } = req.body;

    // 🔥 1. Prepare payload
    const requestPayload = {
      regnNo,
      chassisNo,
      terminationDt: moment(terminationDt).format("YYYY-MM-DD"),
      docUrl: doc?.secure_url || "",
      userId: CLIENT_ID,
      userPwd: USER_PWD,
    };

    // 🔥 2. Encrypt
    const encryptedData = encrypt(JSON.stringify(requestPayload), SECRET_KEY);

    // 🔥 3. Send API request
    const { data: vahanResponse } = await axios.post(
      TERMINATION_URL,
      { clientId: CLIENT_ID, encData: encryptedData },
      { headers: { "Content-Type": "application/json" } }
    );

    // 🔥 4. Decrypt response
    const decryptedData = decrypt(vahanResponse.encData, SECRET_KEY);
    let parsedResponse = {};

    try {
      parsedResponse = JSON.parse(decryptedData);
    } catch (e) {
      console.error("Failed to parse decrypted data:", decryptedData);
      parsedResponse = { responseMessage: "Invalid JSON from API", responseCode: 500 };
    }

    // 🔥 5. Save uploaded document
    const file = await prisma.file.create({
      data: {
        url: doc?.secure_url || "",
        publicId: doc?.public_id || "",
        resourceType: doc?.resource_type || "",
        format: doc?.format || "",
      },
    });

    // 🔥 6. Save termination request
    const terminationRequest = await prisma.terminationRequest.create({
      data: {
        regnNo,
        chassisNo,
        terminationDt: new Date(terminationDt),
        encryptedData: encryptedData,
        response: parsedResponse.responseMessage,
        status: parsedResponse.responseCode,
        errorMessage: parsedResponse.responseCode == 1 ? null : parsedResponse.responseMessage,
        adminId: req.user?.adminId || null,
        employee: req.user?.employeeId
        ? { connect: { id: req.user.employeeId } }
        : null,
        createdBy: req.user?.type || "unknown",
        docFileId: file.id,
      },
    });

    // 🔥 7. Log the action
    await logAction({
      action: "TERMINATED VEHICLE LOAN",
      table: "TerminationRequest",
      targetId: terminationRequest.id,
      adminId: req.user.adminId,
      employeeId: req.user?.employeeId,
      loginActivityId: req.user.loginActivityId,
      metadata: {
        requestPayload,
        encryptedData,
        parsedResponse,
      },
    });

    // 🔥 8. Respond
    if (parsedResponse.responseCode == 1) {
      return res.status(200).json({
        status: 200,
        message: "Termination request successful",
        data: parsedResponse,
      });
    } else {
      return res.status(400).json({
        status: 400,
        responseCode: parsedResponse.responseCode,
        message: parsedResponse.responseMessage || "Termination failed",
      });
    }
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Internal server error",
      details: error,
    });
  }
};

exports.getTerminations = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const where = search
      ? {
          OR: [
            { regnNo: { contains: search, mode: "insensitive" } },
            { chassisNo: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const [terminations, total] = await Promise.all([
      prisma.terminationRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          docFile: true, // Include File metadata
          admin: true,
          employee: true,
        },
      }),
      prisma.terminationRequest.count({ where }),
    ]);

    res.json({
      status: 200,
      data: terminations,
      total,
      page,
      limit,
    });
  } catch (err) {
    console.error("Error fetching terminations:", err);
    res.status(500).json({ error: "Failed to fetch termination logs" });
  }
};
