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
