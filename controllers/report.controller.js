const ExcelJS = require("exceljs");
const {
  parseISO,
  isValid,
  startOfDay,
  endOfDay,
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
} = require("date-fns");
const prisma = require("../lib/prisma");

const CIBIL_HEADER = [
  "Consumer Name",
  "Date of Birth",
  "Gender",
  "Income Tax ID Number",
  "Passport Number",
  "Passport Issue Date",
  "Passport Expiry Date",
  "Voter ID Number",
  "Driving License Number",
  "Driving License Issue Date",
  "Driving License Expiry Date",
  "Ration Card Number",
  "Universal ID Number",
  "Additional ID #1",
  "Additional ID #2",
  "Telephone No.Mobile",
  "Telephone No.Residence",
  "Telephone No.Office",
  "Extension Office",
  "Telephone No.Other",
  "Extension Other",
  "Email ID 1",
  "Email ID 2",
  "Address Line 1",
  "State Code 1",
  "PIN Code 1",
  "Address Category 1",
  "Residence Code 1",
  "Address Line 2",
  "State Code 2",
  "PIN Code 2",
  "Address Category 2",
  "Residence Code 2",
  "Current/New Member Code",
  "Current/New Member Short Name",
  "Curr/New Account No",
  "Account Type",
  "Ownership Indicator",
  "Date Opened/Disbursed",
  "Date of Last Payment",
  "Date Closed",
  "Date Reported",
  "High Credit/Sanctioned Amt",
  "Current  Balance",
  "Amt Overdue",
  "No of Days Past Due",
  "Old Mbr Code",
  "Old Mbr Short Name",
  "Old Acc No",
  "Old Acc Type",
  "Old Ownership Indicator",
  "Suit Filed / Wilful Default",
  "Credit Facility Status",
  "Asset Classification",
  "Value of Collateral",
  "Type of Collateral",
  "Credit Limit",
  "Cash Limit",
  "Rate of Interest",
  "RepaymentTenure",
  "EMI Amount",
  "Written- off Amount (Total)",
  "Written- off Principal Amount",
  "Settlement Amt",
  "Payment Frequency",
  "Actual Payment Amt",
  "Occupation Code",
  "Income",
  "Net/Gross Income Indicator",
  "Monthly/Annual Income Indicator",
  "CKYC",
  "NREGA Card Number",
];

const ACCOUNT_TYPE_MAP = {
  TWOWHEELER: "13",
  AGRICULTURE: "53",
  MSME: "51",
};

const PAYMENT_FREQUENCY_MAP = {
  WEEKLY: "01",
  FORTNIGHTLY: "02",
  MONTHLY: "03",
  QUARTERLY: "04",
  BULLET: "05",
  DAILY: "06",
  HALF_YEARLY: "07",
  YEARLY: "08",
  ON_DEMAND: "09",
};

const DEFAULT_MEMBER_CODE = process.env.CIBIL_MEMBER_CODE || "";
const DEFAULT_MEMBER_SHORT_NAME = process.env.CIBIL_MEMBER_SHORT_NAME || "";

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
  return format(date, "ddMMyyyy");
};

const formatAmount = (value) => {
  if (value === null || value === undefined) return "";
  const num = Number(value);
  if (Number.isNaN(num)) return "";
  return num.toFixed(2);
};

const formatInteger = (value) => {
  if (value === null || value === undefined) return "";
  const num = Number(value);
  if (Number.isNaN(num)) return "";
  return Math.trunc(num).toString();
};

const mapGender = (gender) => {
  if (!gender) return "";
  const value = (gender.value || gender.name || "")
    .toString()
    .trim()
    .toLowerCase();
  if (value === "01" || value === "1" || value === "female") return "1";
  if (value === "02" || value === "2" || value === "male") return "2";
  if (
    value === "03" ||
    value === "3" ||
    value === "other" ||
    value === "transgender"
  )
    return "3";
  return "";
};

const mapAccountType = (loanType) => {
  if (!loanType) return "00";
  return ACCOUNT_TYPE_MAP[loanType.name] || "00";
};

const mapPaymentFrequency = (frequency) => {
  if (!frequency) return "";
  const key = frequency.toUpperCase().replace(/[- ]/g, "_");
  return PAYMENT_FREQUENCY_MAP[key] || "";
};

const findPhotoIdNumber = (photoIds, typeName) => {
  if (!Array.isArray(photoIds)) return "";
  const match = photoIds.find((entry) => entry.photoIdType?.name === typeName);
  return match?.photoIdNumber || "";
};

const buildFullName = (user) => {
  if (!user) return "";
  return sanitizeText(
    [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ")
  );
};

const sumPaymentsInRange = (payments, fromDate, toDate) => {
  if (!Array.isArray(payments) || !payments.length) return 0;
  const start = startOfDay(fromDate);
  const end = endOfDay(toDate);
  return payments.reduce((acc, payment) => {
    if (!payment.paymentDate) return acc;
    const paymentDate = new Date(payment.paymentDate);
    if (Number.isNaN(paymentDate.getTime())) return acc;
    if (paymentDate < start || paymentDate > end) return acc;
    const amount = Number(payment.amount || 0);
    if (Number.isNaN(amount)) return acc;
    return acc + amount;
  }, 0);
};

const getLastPaymentDate = (payments) => {
  if (!Array.isArray(payments) || !payments.length) return "";
  const validPayments = payments
    .filter((payment) => payment.paymentDate)
    .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
  if (!validPayments.length) return "";
  return formatDateCompact(validPayments[0].paymentDate);
};

const getPreviousMonthRange = (toDate) => {
  const target = subMonths(toDate, 1);
  return {
    start: startOfMonth(target),
    end: endOfMonth(target),
  };
};

const buildReportRow = (loan, context) => {
  const { toDate: reportedOn } = context;
  const { user, loanType, payments } = loan;
  const photoIds = user?.photoIds || [];

  const pan = sanitizeText(findPhotoIdNumber(photoIds, "PAN"));
  const aadhaar = compactDigits(findPhotoIdNumber(photoIds, "AADHAAR"));
  const drivingLicense = sanitizeText(
    findPhotoIdNumber(photoIds, "DRIVING_LICENSE")
  );

  const addressLine1 = sanitizeText(user?.address);
  const stateCode = user?.state?.stateCode || "";
  const pinCode = compactDigits(user?.pincode);
  const addressCategory = user?.addressCategory?.value || "";

  const ownershipIndicator = "1"; // Assuming individual ownership for current scope
  const memberCode = DEFAULT_MEMBER_CODE;
  const memberShortName = DEFAULT_MEMBER_SHORT_NAME;

  const disbursedDate = loan.disbursedDate || loan.startDate;
  const closedDate = loan.isClosed ? loan.updatedAt || loan.endDate : null;
  const lastPaymentDate = getLastPaymentDate(payments);

  const { start: prevMonthStart, end: prevMonthEnd } =
    getPreviousMonthRange(new Date(reportedOn));
  const previousMonthPayment = sumPaymentsInRange(
    payments,
    prevMonthStart,
    prevMonthEnd
  );

  const rowObject = {
    "Consumer Name": buildFullName(user),
    "Date of Birth": formatDateCompact(user?.dateOfBirth),
    Gender: mapGender(user?.gender),
    "Income Tax ID Number": pan,
    "Passport Number": "",
    "Passport Issue Date": "",
    "Passport Expiry Date": "",
    "Voter ID Number": "",
    "Driving License Number": drivingLicense,
    "Driving License Issue Date": "",
    "Driving License Expiry Date": "",
    "Ration Card Number": "",
    "Universal ID Number": aadhaar,
    "Additional ID #1": "",
    "Additional ID #2": "",
    "Telephone No.Mobile": compactDigits(user?.phone),
    "Telephone No.Residence": "",
    "Telephone No.Office": "",
    "Extension Office": "",
    "Telephone No.Other": "",
    "Extension Other": "",
    "Email ID 1": user?.email ? user.email.toLowerCase() : "",
    "Email ID 2": "",
    "Address Line 1": addressLine1,
    "State Code 1": stateCode,
    "PIN Code 1": pinCode,
    "Address Category 1": addressCategory,
    "Residence Code 1": "",
    "Address Line 2": sanitizeText(user?.cityText),
    "State Code 2": "",
    "PIN Code 2": "",
    "Address Category 2": "",
    "Residence Code 2": "",
    "Current/New Member Code": memberCode,
    "Current/New Member Short Name": memberShortName,
    "Curr/New Account No": sanitizeText(loan.fileNo),
    "Account Type": mapAccountType(loanType),
    "Ownership Indicator": ownershipIndicator,
    "Date Opened/Disbursed": formatDateCompact(disbursedDate),
    "Date of Last Payment": lastPaymentDate,
    "Date Closed": formatDateCompact(closedDate),
    "Date Reported": formatDateCompact(reportedOn),
    "High Credit/Sanctioned Amt": formatAmount(loan.principalLoanAmount),
    "Current  Balance": formatAmount(loan.pendingAmount),
    "Amt Overdue": loan.totalDelayDays > 0
      ? formatAmount(loan.pendingAmount)
      : "",
    "No of Days Past Due": formatInteger(loan.totalDelayDays),
    "Old Mbr Code": "",
    "Old Mbr Short Name": "",
    "Old Acc No": "",
    "Old Acc Type": "",
    "Old Ownership Indicator": "",
    "Suit Filed / Wilful Default": "00",
    "Credit Facility Status": "",
    "Asset Classification": "",
    "Value of Collateral": "",
    "Type of Collateral": "",
    "Credit Limit": "",
    "Cash Limit": "",
    "Rate of Interest": formatAmount(loan.interestRate),
    RepaymentTenure: loan.tenureMonths || "",
    "EMI Amount": formatAmount(loan.monthlyPayableAmount),
    "Written- off Amount (Total)": "",
    "Written- off Principal Amount": "",
    "Settlement Amt": "",
    "Payment Frequency": mapPaymentFrequency(loan.paymentFrequency || "MONTHLY"),
    "Actual Payment Amt": previousMonthPayment
      ? formatAmount(previousMonthPayment)
      : "",
    "Occupation Code": sanitizeText(user?.profession),
    Income: "",
    "Net/Gross Income Indicator": "",
    "Monthly/Annual Income Indicator": "",
    CKYC: "",
    "NREGA Card Number": "",
  };

  return rowObject;
};

const buildWorkbook = () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("CIBIL FORMAT");
  sheet.addRow(CIBIL_HEADER);
  return { workbook, sheet };
};

exports.downloadCibilReport = async (req, res) => {
  try {
    const { from, to } = req.query;
    const previewMode = String(req.query.preview || "").toLowerCase() === "true";
    const previewLimit = Number(req.query.limit) || 50;

    if (!from || !to) {
      return res
        .status(400)
        .json({ message: "from and to query parameters are required" });
    }

    const fromDate = parseISO(from);
    const toDate = parseISO(to);
    if (!isValid(fromDate) || !isValid(toDate) || fromDate > toDate) {
      return res
        .status(400)
        .json({
          message: "Provide a valid date range in ISO format (YYYY-MM-DD)",
        });
    }

    const loans = await prisma.loan.findMany({
      where: {
        isClosed: false,
        startDate: {
          gte: startOfDay(fromDate),
          lte: endOfDay(toDate),
        },
      },
      include: {
        loanType: true,
        user: {
          include: {
            gender: true,
            addresses: {
              include: {
                state: true,
                city: true,
              },
            },
            photoIds: {
              include: { photoIdType: true },
            },
          },
        },
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
        startDate: "asc",
      },
    });

    if (!loans.length) {
      if (previewMode) {
        return res.json({ data: [], meta: { count: 0 } });
      }
      return res.status(404).json({
        message: "No active loans found for the provided date range",
      });
    }

    const reportedOn = toDate;
    const preparedRows = loans.map((loan) => {
      const rowObject = buildReportRow(loan, { fromDate, toDate, reportedOn });
      const rowArray = CIBIL_HEADER.map((header) => rowObject[header] ?? "");
      return { row: rowArray, object: rowObject };
    });

    if (previewMode) {
      return res.json({
        data: preparedRows
          .slice(0, previewLimit > 0 ? previewLimit : preparedRows.length)
          .map((entry) => entry.object),
        meta: { count: preparedRows.length, limit: previewLimit },
      });
    }

    const { workbook, sheet } = buildWorkbook();

    preparedRows.forEach((entry) => {
      sheet.addRow(entry.row);
    });

    const filename = `CIBIL_Report_${format(new Date(), "yyyyMMdd_HHmmss")}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("Failed to generate CIBIL report", error);
    return res.status(500).json({
      message: "Failed to generate CIBIL report",
      error: error.message,
    });
  }
};

// --------------------------------
// LOAN REPORT
// --------------------------------
exports.getLoanReport = async (req, res) => {
  try {
    const { branchId, loanTypeId, status, download, from, to } = req.query;

    const whereClause = {};

    if (branchId) whereClause.branchId = branchId;
    if (loanTypeId) whereClause.loanTypeId = loanTypeId;

    // Date range filter on disbursement date
    if (from || to) {
      whereClause.disbursedDate = {};
      if (from) {
        const fromDate = parseISO(from);
        if (isValid(fromDate)) whereClause.disbursedDate.gte = startOfDay(fromDate);
      }
      if (to) {
        const toDate = parseISO(to);
        if (isValid(toDate)) whereClause.disbursedDate.lte = endOfDay(toDate);
      }
    }

    if (status === "active") {
      whereClause.isClosed = false;
      whereClause.fileStatus = {
        notIn: ["CLOSED", "CANCELLED", "REJECTED", "WRITTEN_OFF", "INITIATED", "IN_PROGRESS", "PENDING_APPROVAL"],
      };
    } else if (status === "closed") {
      whereClause.isClosed = true;
    } else if (status === "defaulted") {
      whereClause.isDefaulted = true;
    } else {
      // default: all disbursed/active loans (exclude pre-approval stages)
      whereClause.fileStatus = {
        notIn: ["CANCELLED", "REJECTED", "INITIATED", "IN_PROGRESS", "PENDING_APPROVAL"],
      };
    }

    const loans = await prisma.loan.findMany({
      where: whereClause,
      include: {
        user: {
          include: {
            addresses: { include: { city: true, state: true }, take: 1 },
          },
        },
        loanType: true,
        branch: true,
        twoWheelerLoan: { include: { brand: true, model: true } },
        agriLoan: { include: { equipment: true } },
        msmeLoan: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const r2 = (n) => Math.round(Number(n) || 0);

    const getRegModel = (loan) => {
      if (loan.twoWheelerLoan) {
        const reg = loan.twoWheelerLoan.registrationNumber || "";
        const model = [
          loan.twoWheelerLoan.brand?.name,
          loan.twoWheelerLoan.model?.name,
        ]
          .filter(Boolean)
          .join(" ");
        return { reg, model };
      }
      if (loan.agriLoan) {
        return {
          reg: loan.agriLoan.registrationNumber || "",
          model: loan.agriLoan.equipment?.name || "",
        };
      }
      return { reg: "", model: "" };
    };

    const getUserAddress = (user) => {
      if (!user?.addresses?.length) return "";
      const addr = user.addresses[0];
      return [addr.address, addr.city?.name, addr.state?.name, addr.pincode]
        .filter(Boolean)
        .join(", ");
    };

    const getLoanStatus = (loan) => {
      if (loan.isForeclosed) return "FORECLOSED";
      if (loan.isClosed) return "CLOSED";
      if (loan.isDefaulted) return "DEFAULTED";
      return "ACTIVE";
    };

    const data = loans.map((loan) => {
      const { reg, model } = getRegModel(loan);
      const userName = [loan.user?.firstName, loan.user?.middleName, loan.user?.lastName]
        .filter(Boolean)
        .join(" ");

      return {
        id: loan.id,
        fileNo: loan.fileNo,
        userName,
        phone: loan.user?.phone || "",
        regNo: reg,
        model: model,
        address: getUserAddress(loan.user),
        loanAmount: r2(loan.principalLoanAmount),
        emi: r2(loan.monthlyPayableAmount),
        disbursementDate: loan.disbursedDate,
        totalInterest: r2(loan.interestAmount),
        totalAmount: r2(loan.totalAmount),
        tenureMonths: loan.tenureMonths,
        status: getLoanStatus(loan),
        branch: loan.branch?.name || "",
        loanType: loan.loanType?.name || "",
      };
    });

    // Excel download
    if (String(download).toLowerCase() === "true") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Loan Report");

      const fmtDate = (d) => {
        if (!d) return "";
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return "";
        return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      };

      const headers = [
        "S.No", "File No", "Customer Name", "Mobile No", "Reg No", "Model",
        "Address", "Loan Amount", "EMI", "Disbursement Date", "Total Interest",
        "Total Amount", "Tenure (Months)", "Status"
      ];
      const headerRow = sheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
        cell.border = { bottom: { style: "thin", color: { argb: "FF94A3B8" } } };
      });

      data.forEach((row, idx) => {
        sheet.addRow([
          idx + 1, row.fileNo, row.userName, row.phone, row.regNo, row.model,
          row.address, row.loanAmount, row.emi, fmtDate(row.disbursementDate),
          row.totalInterest, row.totalAmount, row.tenureMonths, row.status,
        ]);
      });

      sheet.addRow([]);
      const summaryRow = sheet.addRow(["Total Loans", data.length]);
      summaryRow.font = { bold: true };

      sheet.columns.forEach((col) => {
        let maxLen = 10;
        col.eachCell({ includeEmpty: false }, (cell) => {
          const len = cell.value ? String(cell.value).length : 0;
          if (len > maxLen) maxLen = len;
        });
        col.width = Math.min(maxLen + 2, 40);
      });

      const filename = `Loan_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();

      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(Buffer.from(buffer));
    }

    return res.status(200).json({
      status: 200,
      data,
      summary: { totalCount: data.length },
    });
  } catch (error) {
    console.error("getLoanReport error:", error);
    return res.status(500).json({ error: error.message, status: 500 });
  }
};

// --------------------------------
// PENDING EMI REPORT (month-wise)
// --------------------------------
exports.getPendingEmiReport = async (req, res) => {
  try {
    const { branchId, loanTypeId, download, from, to } = req.query;

    const r2 = (n) => Math.round(Number(n) || 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Date range filter on EMI due date (paymentFor)
    const paymentForFilter = {};
    if (from) {
      const fromDate = parseISO(from);
      if (isValid(fromDate)) paymentForFilter.gte = startOfDay(fromDate);
    }
    if (to) {
      const toDate = parseISO(to);
      if (isValid(toDate)) paymentForFilter.lte = endOfDay(toDate);
    }
    // Default: all overdue EMIs up to today
    if (!paymentForFilter.lte) paymentForFilter.lte = today;

    // Find all EMIs that are UNPAID or PARTIAL within the date range
    const emiWhere = {
      status: { in: ["UNPAID", "PARTIAL"] },
      paymentFor: paymentForFilter,
      loan: {
        isClosed: false,
        fileStatus: {
          notIn: ["CLOSED", "CANCELLED", "REJECTED", "WRITTEN_OFF", "INITIATED", "IN_PROGRESS", "PENDING_APPROVAL"],
        },
      },
    };

    if (branchId) emiWhere.loan.branchId = branchId;
    if (loanTypeId) emiWhere.loan.loanTypeId = loanTypeId;

    const emis = await prisma.eMI.findMany({
      where: emiWhere,
      include: {
        loan: {
          include: {
            user: {
              include: {
                addresses: { include: { city: true, state: true }, take: 1 },
                guarantors: true,
              },
            },
            guarantors: {
              include: {
                guarantor: {
                  include: {
                    addresses: { include: { city: true, state: true }, take: 1 },
                  },
                },
              },
            },
            twoWheelerLoan: { include: { brand: true, model: true } },
            agriLoan: { include: { equipment: true } },
            branch: true,
            loanType: true,
          },
        },
      },
      orderBy: { paymentFor: "asc" },
    });

    // Group by loan to aggregate dues
    const loanMap = new Map();

    for (const emi of emis) {
      const loanId = emi.loanId;
      if (!loanMap.has(loanId)) {
        loanMap.set(loanId, {
          loan: emi.loan,
          totalDueAmount: 0,
          totalDuePenalty: 0,
          overdueEmis: 0,
        });
      }
      const entry = loanMap.get(loanId);

      const emiAmount = Number(emi.emiPayAmount || 0);
      const paidSoFar = Number(emi.amountPaidSoFar || 0);
      const finePaid = Number(emi.finePaid || 0);
      const fineAmount = Number(emi.fineAmount || 0);

      // EMI component due (excluding fine)
      const emiPaidComponent = Math.max(paidSoFar - finePaid, 0);
      const emiDue = Math.max(emiAmount - emiPaidComponent, 0);
      const fineDue = Math.max(fineAmount - finePaid, 0);

      entry.totalDueAmount += emiDue;
      entry.totalDuePenalty += fineDue;
      entry.overdueEmis += 1;
    }

    const getUserAddress = (user) => {
      if (!user?.addresses?.length) return "";
      const addr = user.addresses[0];
      return [addr.address, addr.city?.name, addr.state?.name, addr.pincode]
        .filter(Boolean)
        .join(", ");
    };

    const getRegModel = (loan) => {
      if (loan.twoWheelerLoan) {
        const reg = loan.twoWheelerLoan.registrationNumber || "";
        const model = [
          loan.twoWheelerLoan.brand?.name,
          loan.twoWheelerLoan.model?.name,
        ]
          .filter(Boolean)
          .join(" ");
        return { reg, model };
      }
      if (loan.agriLoan) {
        return {
          reg: loan.agriLoan.registrationNumber || "",
          model: loan.agriLoan.equipment?.name || "",
        };
      }
      return { reg: "", model: "" };
    };

    const data = Array.from(loanMap.values()).map((entry) => {
      const { loan } = entry;
      const user = loan.user;
      const { reg, model } = getRegModel(loan);

      const userName = [user?.firstName, user?.middleName, user?.lastName]
        .filter(Boolean)
        .join(" ");

      // Father's name from relation fields
      const fathersName = [user?.relationFirstName, user?.relationMiddleName, user?.relationLastName]
        .filter(Boolean)
        .join(" ");

      // Guarantor info from LoanGuarantor (linked users)
      const loanGuarantors = (loan.guarantors || []).map((lg) => {
        const g = lg.guarantor;
        return {
          name: [g?.firstName, g?.middleName, g?.lastName].filter(Boolean).join(" "),
          phone: g?.phone || "",
          address: getUserAddress(g),
        };
      });

      // Family guarantors from UserGuarantor
      const familyGuarantors = (user?.guarantors || []).map((ug) => ({
        name: ug.name || "",
        familyMemberName: ug.fatherName || "",
        phone: ug.mobileNo || "",
        address: ug.address || "",
      }));

      const dueAmount = r2(entry.totalDueAmount);
      const duePenalty = r2(entry.totalDuePenalty);

      return {
        id: loan.id,
        fileNo: loan.fileNo,
        userName,
        fathersName,
        phone: user?.phone || "",
        address: getUserAddress(user),
        regNo: reg,
        model,
        dueAmount,
        duePenalty,
        totalAmount: r2(dueAmount + duePenalty),
        overdueEmis: entry.overdueEmis,
        guarantors: [...loanGuarantors, ...familyGuarantors],
        branch: loan.branch?.name || "",
        loanType: loan.loanType?.name || "",
      };
    });

    // Sort by totalAmount descending (worst first)
    data.sort((a, b) => b.totalAmount - a.totalAmount);

    // Excel download
    if (String(download).toLowerCase() === "true") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Pending EMI Report");

      const headers = [
        "S.No", "File No", "Customer Name", "Father's Name", "Mobile No",
        "Address", "Reg No", "Model", "Due Amount", "Due Penalty",
        "Total Amount", "Overdue EMIs", "Guarantor Name", "Guarantor Mobile", "Guarantor Address"
      ];
      const headerRow = sheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
        cell.border = { bottom: { style: "thin", color: { argb: "FF94A3B8" } } };
      });

      data.forEach((row, idx) => {
        // First guarantor info for main row
        const g = row.guarantors[0] || {};
        sheet.addRow([
          idx + 1, row.fileNo, row.userName, row.fathersName, row.phone,
          row.address, row.regNo, row.model, row.dueAmount, row.duePenalty,
          row.totalAmount, row.overdueEmis,
          g.name || g.familyMemberName || "", g.phone || "", g.address || "",
        ]);

        // Additional guarantors as extra rows
        for (let i = 1; i < row.guarantors.length; i++) {
          const gx = row.guarantors[i];
          sheet.addRow([
            "", "", "", "", "", "", "", "", "", "", "", "",
            gx.name || gx.familyMemberName || "", gx.phone || "", gx.address || "",
          ]);
        }
      });

      sheet.addRow([]);
      const summaryRow = sheet.addRow(["Total Loans with Pending EMIs", data.length]);
      summaryRow.font = { bold: true };
      const totalDue = data.reduce((s, d) => s + d.dueAmount, 0);
      const totalPenalty = data.reduce((s, d) => s + d.duePenalty, 0);
      sheet.addRow(["Total Due Amount", r2(totalDue)]);
      sheet.addRow(["Total Due Penalty", r2(totalPenalty)]);
      sheet.addRow(["Total", r2(totalDue + totalPenalty)]);

      sheet.columns.forEach((col) => {
        let maxLen = 10;
        col.eachCell({ includeEmpty: false }, (cell) => {
          const len = cell.value ? String(cell.value).length : 0;
          if (len > maxLen) maxLen = len;
        });
        col.width = Math.min(maxLen + 2, 40);
      });

      const filename = `Pending_EMI_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();

      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(Buffer.from(buffer));
    }

    return res.status(200).json({
      status: 200,
      data,
      summary: {
        totalCount: data.length,
        totalDueAmount: r2(data.reduce((s, d) => s + d.dueAmount, 0)),
        totalDuePenalty: r2(data.reduce((s, d) => s + d.duePenalty, 0)),
        totalAmount: r2(data.reduce((s, d) => s + d.totalAmount, 0)),
      },
    });
  } catch (error) {
    console.error("getPendingEmiReport error:", error);
    return res.status(500).json({ error: error.message, status: 500 });
  }
};
