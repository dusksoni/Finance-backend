const ExcelJS = require("exceljs");
const { format } = require("date-fns");
const prisma = require("../lib/prisma");

// Dashboard Report Header - Similar to CIBIL format but for dashboard metrics
const DASHBOARD_HEADER = [
  "File No",
  "Customer Name",
  "Customer Phone",
  "Customer Email",
  "Loan Type",
  "Disbursed Date",
  "Disbursed Amount",
  "Tenure (Months)",
  "Interest Rate (%)",
  "EMI Amount",
  "Total Payable",
  "Pending Amount",
  "Paid Amount",
  "Total Delay Days",
  "DPD Bucket",
  "NPA Status",
  "File Status",
  "Is Closed",
  "Closed Date",
  "Last Payment Date",
  "Last Payment Amount",
  "Collection Efficiency (%)",
  "Branch",
  "Created By",
  "Created Date",
  "Address",
  "City",
  "State",
  "Pincode",
  "PAN Number",
  "Aadhaar Number",
];

// Utility functions similar to CIBIL report
const sanitizeText = (value) => {
  if (!value) return "";
  return String(value)
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const compactDigits = (value) => {
  if (!value) return "";
  return String(value).replace(/[^0-9]/g, "");
};

const formatDateCompact = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "dd/MM/yyyy");
};

const formatAmount = (value) => {
  if (value === null || value === undefined) return "";
  const num = Number(value);
  if (Number.isNaN(num)) return "";
  return num.toFixed(2);
};

const formatPercentage = (value) => {
  if (value === null || value === undefined) return "";
  const num = Number(value);
  if (Number.isNaN(num)) return "";
  return num.toFixed(2) + "%";
};

const buildFullName = (user) => {
  if (!user) return "";
  return sanitizeText(
    [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ")
  );
};

const findPhotoIdNumber = (photoIds, typeName) => {
  if (!Array.isArray(photoIds)) return "";
  const match = photoIds.find((entry) => entry.photoIdType?.name === typeName);
  return match?.photoIdNumber || "";
};

const getDPDBucket = (totalDelayDays) => {
  if (!totalDelayDays || totalDelayDays <= 0) return "Current (0 days)";
  if (totalDelayDays <= 30) return "0-30 days";
  if (totalDelayDays <= 60) return "31-60 days";
  if (totalDelayDays <= 90) return "61-90 days";
  return "90+ days (NPA)";
};

const getNPAStatus = (totalDelayDays) => {
  if (!totalDelayDays || totalDelayDays <= 90) return "Standard";
  return "NPA";
};

const getLastPaymentInfo = (payments) => {
  if (!Array.isArray(payments) || !payments.length) return { date: "", amount: "" };
  const validPayments = payments
    .filter((payment) => payment.paymentDate && payment.verified)
    .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));

  if (!validPayments.length) return { date: "", amount: "" };

  return {
    date: formatDateCompact(validPayments[0].paymentDate),
    amount: formatAmount(validPayments[0].amount),
  };
};

const calculateCollectionEfficiency = (loan, payments) => {
  if (!loan.principalLoanAmount || loan.principalLoanAmount === 0) return "";

  const totalPaid = Array.isArray(payments)
    ? payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    : 0;

  const efficiency = (totalPaid / loan.principalLoanAmount) * 100;
  return formatPercentage(efficiency);
};

// Build dashboard row similar to CIBIL buildReportRow
const buildDashboardRow = (loan) => {
  const { user, loanType, payments, branch, createdBy } = loan;
  const photoIds = user?.photoIds || [];
  const addresses = user?.addresses || [];
  const primaryAddress = addresses[0] || {};

  const pan = sanitizeText(findPhotoIdNumber(photoIds, "PAN"));
  const aadhaar = compactDigits(findPhotoIdNumber(photoIds, "AADHAAR"));

  const lastPaymentInfo = getLastPaymentInfo(payments);
  const collectionEfficiency = calculateCollectionEfficiency(loan, payments);

  const totalPaid = Array.isArray(payments)
    ? payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    : 0;

  const rowObject = {
    "File No": sanitizeText(loan.fileNo),
    "Customer Name": buildFullName(user),
    "Customer Phone": compactDigits(user?.phone),
    "Customer Email": user?.email ? user.email.toLowerCase() : "",
    "Loan Type": loanType?.name || "",
    "Disbursed Date": formatDateCompact(loan.disbursedDate || loan.startDate),
    "Disbursed Amount": formatAmount(loan.principalLoanAmount),
    "Tenure (Months)": loan.tenureMonths || "",
    "Interest Rate (%)": formatAmount(loan.interestRate),
    "EMI Amount": formatAmount(loan.monthlyPayableAmount),
    "Total Payable": formatAmount(loan.totalPayableAmount),
    "Pending Amount": formatAmount(loan.pendingAmount),
    "Paid Amount": formatAmount(totalPaid),
    "Total Delay Days": loan.totalDelayDays || "0",
    "DPD Bucket": getDPDBucket(loan.totalDelayDays),
    "NPA Status": getNPAStatus(loan.totalDelayDays),
    "File Status": loan.fileStatus || "",
    "Is Closed": loan.isClosed ? "Yes" : "No",
    "Closed Date": loan.isClosed ? formatDateCompact(loan.endDate || loan.updatedAt) : "",
    "Last Payment Date": lastPaymentInfo.date,
    "Last Payment Amount": lastPaymentInfo.amount,
    "Collection Efficiency (%)": collectionEfficiency,
    "Branch": branch?.name || "",
    "Created By": createdBy ? buildFullName(createdBy) : "",
    "Created Date": formatDateCompact(loan.createdAt),
    "Address": sanitizeText(primaryAddress.address),
    "City": primaryAddress.city?.name || "",
    "State": primaryAddress.state?.name || "",
    "Pincode": compactDigits(primaryAddress.pincode),
    "PAN Number": pan,
    "Aadhaar Number": aadhaar,
  };

  return rowObject;
};

// Build workbook similar to CIBIL format
const buildWorkbook = (reportMetadata = {}) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Dashboard Report");

  // Add metadata rows
  if (reportMetadata.title) {
    const titleRow = sheet.addRow([reportMetadata.title]);
    titleRow.font = { size: 16, bold: true };
    titleRow.alignment = { horizontal: "center" };
    sheet.mergeCells(1, 1, 1, DASHBOARD_HEADER.length);
  }

  if (reportMetadata.dateRange) {
    const dateRangeRow = sheet.addRow([`Date Range: ${reportMetadata.dateRange}`]);
    dateRangeRow.font = { size: 12, bold: true };
    sheet.mergeCells(sheet.lastRow.number, 1, sheet.lastRow.number, DASHBOARD_HEADER.length);
  }

  if (reportMetadata.generatedOn) {
    const generatedRow = sheet.addRow([`Generated On: ${reportMetadata.generatedOn}`]);
    generatedRow.font = { size: 10, italic: true };
    sheet.mergeCells(sheet.lastRow.number, 1, sheet.lastRow.number, DASHBOARD_HEADER.length);
  }

  // Add blank row before headers
  sheet.addRow([]);

  // Add header row
  const headerRow = sheet.addRow(DASHBOARD_HEADER);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };

  // Set column widths
  sheet.columns = [
    { key: "fileNo", width: 15 },
    { key: "customerName", width: 25 },
    { key: "customerPhone", width: 15 },
    { key: "customerEmail", width: 25 },
    { key: "loanType", width: 15 },
    { key: "disbursedDate", width: 15 },
    { key: "disbursedAmount", width: 15 },
    { key: "tenure", width: 12 },
    { key: "interestRate", width: 12 },
    { key: "emiAmount", width: 12 },
    { key: "totalPayable", width: 15 },
    { key: "pendingAmount", width: 15 },
    { key: "paidAmount", width: 15 },
    { key: "totalDelayDays", width: 12 },
    { key: "dpdBucket", width: 18 },
    { key: "npaStatus", width: 12 },
    { key: "fileStatus", width: 15 },
    { key: "isClosed", width: 10 },
    { key: "closedDate", width: 15 },
    { key: "lastPaymentDate", width: 15 },
    { key: "lastPaymentAmount", width: 15 },
    { key: "collectionEfficiency", width: 18 },
    { key: "branch", width: 20 },
    { key: "createdBy", width: 20 },
    { key: "createdDate", width: 15 },
    { key: "address", width: 30 },
    { key: "city", width: 15 },
    { key: "state", width: 15 },
    { key: "pincode", width: 10 },
    { key: "pan", width: 15 },
    { key: "aadhaar", width: 15 },
  ];

  return { workbook, sheet };
};

// Main export controller
exports.exportFormattedDashboard = async (req, res) => {
  try {
    const { rangeType, startDate, endDate, scope } = req.body;

    if (!rangeType && (!startDate || !endDate)) {
      return res.status(400).json({
        message: "Please provide either rangeType or custom date range (startDate and endDate)",
      });
    }

    // Import the scope resolver from dashboard-enhanced controller
    const { resolveScopeFromUser } = require("./dashboard-enhanced.controller");
    const resolvedScope = scope || (await resolveScopeFromUser(req.user));

    // Build where clause based on scope
    let baseLoanWhere = {};

    if (resolvedScope.level === "BRANCH" && resolvedScope.branchId) {
      baseLoanWhere.branchId = resolvedScope.branchId;
    } else if (resolvedScope.level === "SELF" && resolvedScope.employeeId) {
      baseLoanWhere.createdById = resolvedScope.employeeId;
    }

    // Add date filter if provided
    if (startDate && endDate) {
      baseLoanWhere.disbursedDate = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    // Fetch all loans with necessary relations
    const loans = await prisma.loan.findMany({
      where: baseLoanWhere,
      include: {
        user: {
          include: {
            photoIds: {
              include: {
                photoIdType: true,
              },
            },
            addresses: {
              include: {
                state: true,
                city: true,
              },
            },
          },
        },
        loanType: true,
        branch: true,
        createdBy: true,
        payments: {
          where: {
            verified: true,
          },
          orderBy: {
            paymentDate: "desc",
          },
        },
      },
      orderBy: {
        disbursedDate: "desc",
      },
    });

    if (!loans.length) {
      return res.status(404).json({
        message: "No loans found for the specified criteria",
      });
    }

    // Prepare metadata
    const reportMetadata = {
      title: "Finance - Dashboard Report",
      dateRange: startDate && endDate
        ? `${formatDateCompact(startDate)} to ${formatDateCompact(endDate)}`
        : rangeType || "All Time",
      generatedOn: formatDateCompact(new Date()),
    };

    // Build workbook and rows
    const { workbook, sheet } = buildWorkbook(reportMetadata);

    const preparedRows = loans.map((loan) => {
      const rowObject = buildDashboardRow(loan);
      const rowArray = DASHBOARD_HEADER.map((header) => rowObject[header] ?? "");
      return { row: rowArray, object: rowObject };
    });

    // Add data rows
    preparedRows.forEach((entry, index) => {
      const dataRow = sheet.addRow(entry.row);

      // Color-code based on NPA status
      const npaStatus = entry.object["NPA Status"];
      if (npaStatus === "NPA") {
        dataRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFC7CE" }, // Light red for NPA
        };
      } else if (entry.object["DPD Bucket"] === "61-90 days") {
        dataRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFEB9C" }, // Light orange for warning
        };
      } else if (entry.object["DPD Bucket"] === "31-60 days") {
        dataRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFFFFF9C" }, // Light yellow for caution
        };
      }

      // Alternate row background for better readability
      if (index % 2 === 0 && npaStatus !== "NPA") {
        dataRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF2F2F2" },
        };
      }
    });

    // Add summary row at the bottom
    const summaryRowNum = sheet.lastRow.number + 2;
    sheet.addRow([]);
    const summaryRow = sheet.addRow([
      "SUMMARY",
      `Total Loans: ${loans.length}`,
      "",
      "",
      "",
      "",
      `Total Disbursed: ${formatAmount(loans.reduce((sum, l) => sum + (Number(l.principalLoanAmount) || 0), 0))}`,
      "",
      "",
      "",
      "",
      `Total Pending: ${formatAmount(loans.reduce((sum, l) => sum + (Number(l.pendingAmount) || 0), 0))}`,
      "",
      "",
      "",
      `NPA Count: ${loans.filter(l => l.totalDelayDays > 90).length}`,
    ]);
    summaryRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    summaryRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF70AD47" },
    };

    // Generate file
    const filename = `Dashboard_Report_${format(new Date(), "yyyyMMdd_HHmmss")}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("Failed to generate formatted dashboard report", error);
    return res.status(500).json({
      message: "Failed to generate formatted dashboard report",
      error: error.message,
    });
  }
};
