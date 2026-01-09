const prisma = require("../lib/prisma");
const ExcelJS = require("exceljs");
const logAction = require("../utils/adminLogger");
const {
  addMonths,
  setDate,
  parseISO,
  format,
  isValid,
  parse,
} = require("date-fns");

// Helper function to parse date from Excel
const parseExcelDate = (value) => {
  if (!value) return null;

  // If it's already a Date object
  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }

  // If it's an Excel serial number (number of days since 1900-01-01)
  if (typeof value === "number") {
    const excelEpoch = new Date(1900, 0, 1);
    const days = Math.floor(value) - 2; // Excel incorrectly treats 1900 as a leap year
    const date = new Date(excelEpoch.getTime() + days * 86400000);
    return isValid(date) ? date : null;
  }

  // If it's a string, try to parse it
  if (typeof value === "string") {
    // Try ISO format first
    let date = parseISO(value);
    if (isValid(date)) return date;

    // Try common formats
    const formats = [
      "dd/MM/yyyy",
      "MM/dd/yyyy",
      "yyyy-MM-dd",
      "dd-MM-yyyy",
      "MM-dd-yyyy",
    ];

    for (const formatStr of formats) {
      try {
        date = parse(value, formatStr, new Date());
        if (isValid(date)) return date;
      } catch (e) {
        continue;
      }
    }
  }

  return null;
};

// Helper function to safely get cell value
const getCellValue = (row, column) => {
  const cell = row.getCell(column);
  if (!cell || cell.value === null || cell.value === undefined) {
    return null;
  }
  return cell.value;
};

// Helper to check if row is empty
const isRowEmpty = (row) => {
  let isEmpty = true;
  row.eachCell({ includeEmpty: false }, () => {
    isEmpty = false;
  });
  return isEmpty;
};

exports.bulkUpload = async (req, res) => {
  try {
    const { adminId, employeeId, role } = req.user;

    if (!req.file) {
      return res.status(400).json({ error: "No Excel file uploaded" });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const results = {
      users: { success: 0, failed: 0, errors: [] },
      loans: { success: 0, failed: 0, errors: [] },
      payments: { success: 0, failed: 0, errors: [] },
    };

    // Process Users Sheet
    const usersSheet = workbook.getWorksheet("Users");
    if (usersSheet) {
      let rowNumber = 2; // Start from row 2 (skip header)

      usersSheet.eachRow({ includeEmpty: false }, async (row, rowNum) => {
        if (rowNum === 1) return; // Skip header

        try {
          if (isRowEmpty(row)) return;

          const phone = getCellValue(row, 4); // Column D
          if (!phone) {
            results.users.errors.push({
              row: rowNum,
              error: "Phone number is required",
            });
            results.users.failed++;
            return;
          }

          // Check if user already exists
          const existingUser = await prisma.user.findUnique({
            where: { phone: String(phone) },
          });

          if (existingUser) {
            results.users.errors.push({
              row: rowNum,
              phone: phone,
              error: "User already exists with this phone number",
            });
            results.users.failed++;
            return;
          }

          const firstName = getCellValue(row, 1) || "";
          const middleName = getCellValue(row, 2) || "";
          const lastName = getCellValue(row, 3) || "";
          const email = getCellValue(row, 5);
          const dobValue = getCellValue(row, 6);
          const dateOfBirth = parseExcelDate(dobValue) || new Date();

          const relationFirstName = getCellValue(row, 7) || "";
          const relationMiddleName = getCellValue(row, 8) || "";
          const relationLastName = getCellValue(row, 9) || "";
          const maritalStatus = getCellValue(row, 10) || "";
          const qualification = getCellValue(row, 11) || "";
          const profession = getCellValue(row, 12) || "";

          // Address fields
          const address = getCellValue(row, 13) || "";
          const country = getCellValue(row, 14) || "India";
          const stateName = getCellValue(row, 15);
          const cityName = getCellValue(row, 16);
          const pincode = getCellValue(row, 17);

          // Find or use default state and city
          let stateId = null;
          let cityId = null;
          let regionId = null;

          if (stateName && cityName) {
            const state = await prisma.state.findFirst({
              where: { name: { equals: String(stateName), mode: "insensitive" } },
            });

            if (state) {
              stateId = state.id;
              const city = await prisma.city.findFirst({
                where: {
                  name: { equals: String(cityName), mode: "insensitive" },
                  stateId: state.id,
                },
              });

              if (city) {
                cityId = city.id;
                const region = await prisma.region.findFirst({
                  where: { stateId: state.id, cityId: city.id },
                });
                if (region) {
                  regionId = region.id;
                }
              }
            }
          }

          // If no region found, use first available region
          if (!regionId) {
            const defaultRegion = await prisma.region.findFirst();
            if (defaultRegion) {
              regionId = defaultRegion.id;
              stateId = defaultRegion.stateId;
              cityId = defaultRegion.cityId;
            }
          }

          // Get default gender (Male)
          const gender = await prisma.gender.findFirst({
            where: { name: "Male" },
          });

          // Get default relation type
          const relationType = await prisma.relationType.findFirst();

          // Get default address category
          const addressCategory = await prisma.addressCategory.findFirst();

          const userData = {
            firstName,
            middleName,
            lastName,
            phone: String(phone),
            email: email ? String(email) : null,
            dateOfBirth,
            relationFirstName,
            relationMiddleName,
            relationLastName,
            maritalStatus,
            qualification,
            profession,
            regionId,
            genderId: gender?.id,
            relationTypeId: relationType?.id,
            adminId: role === "ADMIN" ? adminId : null,
            employeeId: role === "EMPLOYEE" ? employeeId : null,
            createdBy: role,
          };

          const user = await prisma.user.create({
            data: userData,
          });

          // Create address if details provided
          if (address && stateId && cityId && addressCategory) {
            await prisma.userAddress.create({
              data: {
                userId: user.id,
                address,
                country,
                stateId,
                cityId,
                pincode: pincode ? parseInt(pincode) : 0,
                addressCategoryId: addressCategory.id,
              },
            });
          }

          results.users.success++;

          // Log the action
          await logAction({
            action: "BULK_USER_CREATE",
            adminId: role === "ADMIN" ? adminId : null,
            employeeId: role === "EMPLOYEE" ? employeeId : null,
            targetId: user.id,
            table: "User",
            metadata: { phone: user.phone, row: rowNum },
          });
        } catch (error) {
          console.error(`Error processing user row ${rowNum}:`, error);
          results.users.failed++;
          results.users.errors.push({
            row: rowNum,
            error: error.message,
          });
        }
      });
    }

    // Process Loans Sheet
    const loansSheet = workbook.getWorksheet("Loans");
    if (loansSheet) {
      let rowNumber = 2;

      loansSheet.eachRow({ includeEmpty: false }, async (row, rowNum) => {
        if (rowNum === 1) return; // Skip header

        try {
          if (isRowEmpty(row)) return;

          const fileNo = getCellValue(row, 1);
          const userPhone = getCellValue(row, 2);
          const loanTypeName = getCellValue(row, 3);

          if (!fileNo || !userPhone || !loanTypeName) {
            results.loans.errors.push({
              row: rowNum,
              error: "File No, User Phone, and Loan Type are required",
            });
            results.loans.failed++;
            return;
          }

          // Check if loan already exists
          const existingLoan = await prisma.loan.findUnique({
            where: { fileNo: String(fileNo) },
          });

          if (existingLoan) {
            results.loans.errors.push({
              row: rowNum,
              fileNo: fileNo,
              error: "Loan already exists with this file number",
            });
            results.loans.failed++;
            return;
          }

          // Find user
          const user = await prisma.user.findUnique({
            where: { phone: String(userPhone) },
          });

          if (!user) {
            results.loans.errors.push({
              row: rowNum,
              error: `User with phone ${userPhone} not found`,
            });
            results.loans.failed++;
            return;
          }

          // Find loan type
          const loanType = await prisma.loanType.findFirst({
            where: { name: { equals: String(loanTypeName), mode: "insensitive" } },
          });

          if (!loanType) {
            results.loans.errors.push({
              row: rowNum,
              error: `Loan type ${loanTypeName} not found`,
            });
            results.loans.failed++;
            return;
          }

          const principalLoanAmount = parseFloat(getCellValue(row, 4)) || 0;
          const interestRate = parseFloat(getCellValue(row, 5)) || 0;
          const tenureMonths = parseInt(getCellValue(row, 6)) || 12;
          const startDateValue = getCellValue(row, 7);
          const startDate = parseExcelDate(startDateValue) || new Date();
          // Calculate dueDay from startDate (day of month) instead of reading from Excel
          const dueDay = startDate.getDate();
          const paymentFrequency = getCellValue(row, 9) || "MONTHLY";

          // Calculate loan amounts
          const monthlyInterestRate = interestRate / 100 / 12;
          const interestAmount = principalLoanAmount * (interestRate / 100) * (tenureMonths / 12);
          const totalAmount = principalLoanAmount + interestAmount;
          const monthlyPayableAmount = totalAmount / tenureMonths;
          const endDate = addMonths(startDate, tenureMonths);

          // Get first branch for default
          const branch = await prisma.branch.findFirst();

          const loanData = {
            fileNo: String(fileNo),
            userId: user.id,
            loanTypeId: loanType.id,
            principalLoanAmount,
            interestRate,
            interestAmount,
            totalAmount,
            monthlyPayableAmount,
            pendingAmount: totalAmount,
            tenureMonths,
            startDate,
            endDate,
            dueDay,
            paymentFrequency,
            penaltyPercentage: 0,
            branchId: branch?.id,
            adminId: role === "ADMIN" ? adminId : null,
            employeeId: role === "EMPLOYEE" ? employeeId : null,
            createdBy: role,
            fileStatus: "INITIATED",
          };

          const loan = await prisma.loan.create({
            data: loanData,
          });

          results.loans.success++;

          // Log the action
          await logAction({
            action: "BULK_LOAN_CREATE",
            adminId: role === "ADMIN" ? adminId : null,
            employeeId: role === "EMPLOYEE" ? employeeId : null,
            targetId: loan.id,
            table: "Loan",
            metadata: { fileNo: loan.fileNo, row: rowNum },
          });
        } catch (error) {
          console.error(`Error processing loan row ${rowNum}:`, error);
          results.loans.failed++;
          results.loans.errors.push({
            row: rowNum,
            error: error.message,
          });
        }
      });
    }

    // Process Payments Sheet
    const paymentsSheet = workbook.getWorksheet("Payments");
    if (paymentsSheet) {
      let rowNumber = 2;

      paymentsSheet.eachRow({ includeEmpty: false }, async (row, rowNum) => {
        if (rowNum === 1) return; // Skip header

        try {
          if (isRowEmpty(row)) return;

          const fileNo = getCellValue(row, 1);
          const amount = parseFloat(getCellValue(row, 2));
          const paymentDateValue = getCellValue(row, 3);
          const paymentMode = getCellValue(row, 4) || "CASH";
          const transactionId = getCellValue(row, 5);

          if (!fileNo || !amount) {
            results.payments.errors.push({
              row: rowNum,
              error: "File No and Amount are required",
            });
            results.payments.failed++;
            return;
          }

          // Find loan
          const loan = await prisma.loan.findUnique({
            where: { fileNo: String(fileNo) },
          });

          if (!loan) {
            results.payments.errors.push({
              row: rowNum,
              error: `Loan with file number ${fileNo} not found`,
            });
            results.payments.failed++;
            return;
          }

          const paymentDate = parseExcelDate(paymentDateValue) || new Date();

          const paymentData = {
            loanId: loan.id,
            amount,
            paymentDate,
            paymentMode: paymentMode.toUpperCase(),
            transactionId: transactionId ? String(transactionId) : null,
            status: "PENDING",
            adminId: role === "ADMIN" ? adminId : null,
            employeeId: role === "EMPLOYEE" ? employeeId : null,
          };

          const payment = await prisma.payment.create({
            data: paymentData,
          });

          results.payments.success++;

          // Log the action
          await logAction({
            action: "BULK_PAYMENT_CREATE",
            adminId: role === "ADMIN" ? adminId : null,
            employeeId: role === "EMPLOYEE" ? employeeId : null,
            targetId: payment.id,
            table: "Payment",
            metadata: { loanFileNo: fileNo, amount, row: rowNum },
          });
        } catch (error) {
          console.error(`Error processing payment row ${rowNum}:`, error);
          results.payments.failed++;
          results.payments.errors.push({
            row: rowNum,
            error: error.message,
          });
        }
      });
    }

    // Wait a bit for all async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return res.status(200).json({
      message: "Bulk upload completed",
      results,
    });
  } catch (error) {
    console.error("Bulk upload error:", error);
    return res.status(500).json({
      error: "Internal server error during bulk upload",
      message: error.message,
    });
  }
};

// Generate Excel Template
exports.generateTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();

    // Users Sheet
    const usersSheet = workbook.addWorksheet("Users");
    usersSheet.columns = [
      { header: "First Name*", key: "firstName", width: 15 },
      { header: "Middle Name", key: "middleName", width: 15 },
      { header: "Last Name", key: "lastName", width: 15 },
      { header: "Phone*", key: "phone", width: 15 },
      { header: "Email", key: "email", width: 25 },
      { header: "Date of Birth (DD/MM/YYYY)", key: "dateOfBirth", width: 20 },
      { header: "Relation First Name", key: "relationFirstName", width: 18 },
      { header: "Relation Middle Name", key: "relationMiddleName", width: 18 },
      { header: "Relation Last Name", key: "relationLastName", width: 18 },
      { header: "Marital Status", key: "maritalStatus", width: 15 },
      { header: "Qualification", key: "qualification", width: 15 },
      { header: "Profession", key: "profession", width: 15 },
      { header: "Address", key: "address", width: 30 },
      { header: "Country", key: "country", width: 15 },
      { header: "State", key: "state", width: 15 },
      { header: "City", key: "city", width: 15 },
      { header: "Pincode", key: "pincode", width: 10 },
    ];

    // Add sample data
    usersSheet.addRow({
      firstName: "John",
      middleName: "K",
      lastName: "Doe",
      phone: "9876543210",
      email: "john.doe@example.com",
      dateOfBirth: "15/01/1990",
      relationFirstName: "Jane",
      relationMiddleName: "M",
      relationLastName: "Doe",
      maritalStatus: "Married",
      qualification: "Graduate",
      profession: "Business",
      address: "123 Main Street",
      country: "India",
      state: "Maharashtra",
      city: "Mumbai",
      pincode: "400001",
    });

    // Style header row
    usersSheet.getRow(1).font = { bold: true };
    usersSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Loans Sheet
    const loansSheet = workbook.addWorksheet("Loans");
    loansSheet.columns = [
      { header: "File No*", key: "fileNo", width: 15 },
      { header: "User Phone*", key: "userPhone", width: 15 },
      { header: "Loan Type*", key: "loanType", width: 20 },
      { header: "Principal Amount*", key: "principalAmount", width: 18 },
      { header: "Interest Rate (%)*", key: "interestRate", width: 15 },
      { header: "Tenure (Months)*", key: "tenureMonths", width: 15 },
      { header: "Start Date (DD/MM/YYYY)*", key: "startDate", width: 22 },
      { header: "Due Day (1-31)", key: "dueDay", width: 15 },
      { header: "Payment Frequency", key: "paymentFrequency", width: 18 },
    ];

    // Add sample data
    loansSheet.addRow({
      fileNo: "LN001",
      userPhone: "9876543210",
      loanType: "Two Wheeler",
      principalAmount: 50000,
      interestRate: 14,
      tenureMonths: 12,
      startDate: "01/01/2024",
      dueDay: 5,
      paymentFrequency: "MONTHLY",
    });

    // Style header row
    loansSheet.getRow(1).font = { bold: true };
    loansSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Payments Sheet
    const paymentsSheet = workbook.addWorksheet("Payments");
    paymentsSheet.columns = [
      { header: "Loan File No*", key: "fileNo", width: 15 },
      { header: "Amount*", key: "amount", width: 15 },
      { header: "Payment Date (DD/MM/YYYY)", key: "paymentDate", width: 22 },
      { header: "Payment Mode", key: "paymentMode", width: 15 },
      { header: "Transaction ID", key: "transactionId", width: 20 },
    ];

    // Add sample data
    paymentsSheet.addRow({
      fileNo: "LN001",
      amount: 5000,
      paymentDate: "05/01/2024",
      paymentMode: "CASH",
      transactionId: "TXN123456",
    });

    // Style header row
    paymentsSheet.getRow(1).font = { bold: true };
    paymentsSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Instructions Sheet
    const instructionsSheet = workbook.addWorksheet("Instructions");
    instructionsSheet.columns = [
      { header: "Instructions for Bulk Upload", key: "instruction", width: 80 },
    ];

    instructionsSheet.addRows([
      { instruction: "" },
      { instruction: "GENERAL INSTRUCTIONS:" },
      { instruction: "1. Fields marked with * are mandatory" },
      { instruction: "2. Do not modify the header row (first row)" },
      { instruction: "3. Date format should be DD/MM/YYYY (e.g., 15/01/1990)" },
      { instruction: "4. Phone numbers should be 10 digits without country code" },
      { instruction: "5. Remove sample data rows before uploading your data" },
      { instruction: "" },
      { instruction: "USERS SHEET:" },
      { instruction: "- First Name and Phone are mandatory" },
      { instruction: "- Phone number must be unique for each user" },
      { instruction: "- Email should be unique if provided" },
      { instruction: "- State and City should match existing records in the system" },
      { instruction: "" },
      { instruction: "LOANS SHEET:" },
      { instruction: "- File No must be unique" },
      { instruction: "- User Phone must exist in Users sheet or database" },
      { instruction: "- Loan Type should match existing loan types (e.g., 'Two Wheeler', 'Agriculture', 'MSME')" },
      { instruction: "- Payment Frequency: MONTHLY, QUARTERLY, HALF_YEARLY, YEARLY" },
      { instruction: "- Due Day should be between 1-31" },
      { instruction: "" },
      { instruction: "PAYMENTS SHEET:" },
      { instruction: "- Loan File No must exist in Loans sheet or database" },
      { instruction: "- Payment Mode: CASH, ONLINE, UPI, CHEQUE" },
      { instruction: "- Transaction ID is optional but recommended for non-cash payments" },
      { instruction: "" },
      { instruction: "UPLOAD ORDER:" },
      { instruction: "1. Users should be uploaded/exist before creating loans" },
      { instruction: "2. Loans should be uploaded/exist before adding payments" },
      { instruction: "3. You can upload all sheets together in the same file" },
    ]);

    instructionsSheet.getRow(2).font = { bold: true, size: 12 };
    instructionsSheet.getRow(8).font = { bold: true, size: 12 };
    instructionsSheet.getRow(16).font = { bold: true, size: 12 };
    instructionsSheet.getRow(22).font = { bold: true, size: 12 };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=bulk_upload_template.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating template:", error);
    return res.status(500).json({
      error: "Failed to generate template",
      message: error.message,
    });
  }
};
