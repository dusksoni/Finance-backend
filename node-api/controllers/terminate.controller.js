const axios = require("axios");
const { encryptWithJava } = require("../utils/encryptorBridge");
const logAction = require("../utils/adminLogger");
const prisma = require("../lib/prisma");

const TERMINATION_URL =
  "https://staging.parivahan.gov.in/vahanHypothecationWS/v1/termination";

exports.terminateHypothecation = async (req, res) => {
  try {
    const {
      regnNo,
      chassisNo,
      terminationDt,
      doc, // file ID and file URL
    } = req.body;

    const input = {
      regnNo,
      chassisNo,
      terminationDt,
      docUrl: doc.secure_url, // used only for API call
      userId: "nictest",
      userPwd: "Nic@123",
    };

    const encrypted = await encryptWithJava(JSON.stringify(input));

    const response = await axios.post(
      TERMINATION_URL,
      {
        clientId: "nictest",
        encData: encrypted,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    const file = await prisma.file.create({
      data: {
        url: doc.secure_url,
        publicId: doc.public_id,
        resourceType: doc.resource_type,
        format: doc.format,
      },
    });

    const terminate = await prisma.terminationRequest.create({
      data: {
        regnNo,
        chassisNo,
        terminationDt: new Date(terminationDt),
        encryptedData: encrypted,
        response: response.data,
        status: response?.status,
        errorMessage: response.data?.statusDesc || null,
        adminId: req.user?.adminId || null,
        employeeId: req.user?.employeeId || null,
        createdBy: req.user?.type,
        docFileId: file.id, // only this is saved
      },
    });

    await logAction({
      adminId: req.user?.adminId || null,
      employeeId: req.user?.employeeId || null,
      loginActivityId: req.user.loginActivityId,
      action: "TERMINATED VEHICLE LOAN",
      table: "TerminationRequest",
      targetId: terminate.id,
      metadata: {
        regnNo,
        chassisNo,
        terminationDt,
        docFileId: file.id,
        encrypted,
        responseSummary:
          response.data?.statusDesc || response.data?.status || "No status",
      },
    });

    res.status(200).json({
      rawResponse: response.data,
      status: response.status,
      message: response.statusText,
    });
  } catch (err) {
    console.error("Error terminating hypothecation:", err.message);
    res
      .status(500)
      .json({ error: "Something went wrong", details: err.message });
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
