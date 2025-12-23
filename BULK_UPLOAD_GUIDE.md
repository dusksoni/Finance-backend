# Bulk Upload API Guide

## Overview
The bulk upload feature allows you to import users, loans, and payment records in bulk using an Excel file (.xlsx format).

## API Endpoints

### 1. Download Template
**GET** `/api/bulk-upload/template`

Downloads an Excel template file with pre-configured sheets and sample data.

**Authentication Required:** Yes (Admin or Employee)

**Response:** Excel file download

---

### 2. Upload Bulk Data
**POST** `/api/bulk-upload/upload`

Uploads an Excel file containing users, loans, and payment data.

**Authentication Required:** Yes (Admin or Employee)

**Request:**
- Content-Type: `multipart/form-data`
- Body: Form data with a file field named `file`

**Example using cURL:**
```bash
curl -X POST http://localhost:3001/api/bulk-upload/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/your/file.xlsx"
```

**Example using Postman:**
1. Set method to POST
2. URL: `http://localhost:3001/api/bulk-upload/upload`
3. Headers: Add `Authorization: Bearer YOUR_TOKEN`
4. Body: Select "form-data", add key "file" (type: File), and choose your Excel file

**Response:**
```json
{
  "message": "Bulk upload completed",
  "results": {
    "users": {
      "success": 10,
      "failed": 2,
      "errors": [
        {
          "row": 5,
          "phone": "1234567890",
          "error": "User already exists with this phone number"
        }
      ]
    },
    "loans": {
      "success": 8,
      "failed": 1,
      "errors": [
        {
          "row": 3,
          "error": "User with phone 9999999999 not found"
        }
      ]
    },
    "payments": {
      "success": 15,
      "failed": 0,
      "errors": []
    }
  }
}
```

---

## Excel Template Structure

The template contains 4 worksheets:

### 1. Users Sheet
Contains user information with the following columns:

| Column | Required | Description | Example |
|--------|----------|-------------|---------|
| First Name | Yes | User's first name | John |
| Middle Name | No | User's middle name | K |
| Last Name | No | User's last name | Doe |
| Phone | Yes | 10-digit phone number (must be unique) | 9876543210 |
| Email | No | Email address (must be unique if provided) | john@example.com |
| Date of Birth | No | Format: DD/MM/YYYY | 15/01/1990 |
| Relation First Name | No | Guardian/relative first name | Jane |
| Relation Middle Name | No | Guardian/relative middle name | M |
| Relation Last Name | No | Guardian/relative last name | Doe |
| Marital Status | No | Marital status | Married |
| Qualification | No | Educational qualification | Graduate |
| Profession | No | Profession/occupation | Business |
| Address | No | Full address | 123 Main Street |
| Country | No | Country name | India |
| State | No | State name (should exist in system) | Maharashtra |
| City | No | City name (should exist in system) | Mumbai |
| Pincode | No | Postal code | 400001 |

### 2. Loans Sheet
Contains loan information with the following columns:

| Column | Required | Description | Example |
|--------|----------|-------------|---------|
| File No | Yes | Unique loan file number | LN001 |
| User Phone | Yes | Phone of existing user | 9876543210 |
| Loan Type | Yes | Loan type (must exist in system) | Two Wheeler |
| Principal Amount | Yes | Loan principal amount | 50000 |
| Interest Rate (%) | Yes | Annual interest rate percentage | 14 |
| Tenure (Months) | Yes | Loan tenure in months | 12 |
| Start Date | Yes | Loan start date (DD/MM/YYYY) | 01/01/2024 |
| Due Day (1-31) | No | Day of month for payments (default: 5) | 5 |
| Payment Frequency | No | MONTHLY, QUARTERLY, HALF_YEARLY, YEARLY | MONTHLY |

**Note:** The system will automatically calculate:
- Interest amount based on principal and rate
- Total amount (principal + interest)
- Monthly payable amount
- End date based on start date and tenure

### 3. Payments Sheet
Contains payment records with the following columns:

| Column | Required | Description | Example |
|--------|----------|-------------|---------|
| Loan File No | Yes | File number of existing loan | LN001 |
| Amount | Yes | Payment amount | 5000 |
| Payment Date | No | Date of payment (DD/MM/YYYY) | 05/01/2024 |
| Payment Mode | No | CASH, ONLINE, UPI, CHEQUE (default: CASH) | CASH |
| Transaction ID | No | Transaction reference number | TXN123456 |

### 4. Instructions Sheet
Contains detailed instructions for using the template.

---

## Important Notes

### Date Format
- All dates should be in **DD/MM/YYYY** format
- Examples: `15/01/1990`, `01/12/2024`
- Dates can also be entered using Excel's date picker

### Upload Order
1. **Users** should exist before creating loans
2. **Loans** should exist before adding payments
3. You can upload all sheets together in one file - the system processes them in the correct order

### Validations Removed
As per your requirements, the following validations have been **REMOVED**:
- File/image requirements for users
- Photo ID requirements
- Document requirements for loans
- Address mandatory requirements

### What Still Gets Validated
- **User phone numbers** must be unique
- **User emails** must be unique (if provided)
- **Loan file numbers** must be unique
- **Users must exist** before creating their loans
- **Loans must exist** before adding payments
- **Loan types** must exist in the system
- **States and cities** should exist (will use default if not found)

### Duplicate Handling
- If a user with the same phone number exists, that row will be skipped with an error
- If a loan with the same file number exists, that row will be skipped with an error
- All errors are reported in the response with row numbers

### Default Values
- If **state/city** not found, uses first available region
- If **gender** not specified, uses "Male"
- If **payment mode** not specified, uses "CASH"
- If **due day** not specified, uses 5
- If **payment frequency** not specified, uses "MONTHLY"
- If **loan status** not specified, uses "INITIATED"

---

## Error Handling

Errors are reported per sheet with the following information:
- Row number where the error occurred
- Error message describing what went wrong
- Any relevant identifiers (phone, file number, etc.)

Example error:
```json
{
  "row": 5,
  "phone": "9876543210",
  "error": "User already exists with this phone number"
}
```

---

## Best Practices

1. **Download the template** first to ensure correct format
2. **Remove sample data** rows before adding your data
3. **Test with small batches** first (5-10 records)
4. **Verify existing data** - check for duplicate phones and file numbers
5. **Keep original file** as backup before uploading
6. **Review the response** for any errors after upload
7. **Don't modify headers** in the Excel sheet

---

## Troubleshooting

### "User already exists"
- Check if phone number or email already exists in the system
- Phone numbers must be unique across all users

### "Loan already exists"
- Check if the file number already exists
- File numbers must be unique across all loans

### "User not found"
- Ensure the user with that phone number exists in the Users sheet or database
- Upload users first, then loans

### "Loan not found"
- Ensure the loan with that file number exists in the Loans sheet or database
- Upload loans first, then payments

### "Loan type not found"
- Check the exact spelling of the loan type
- Common loan types: "Two Wheeler", "Agriculture", "MSME"
- Loan types are case-insensitive but must match exactly

### Date parsing errors
- Ensure dates are in DD/MM/YYYY format
- Use Excel's date picker if uncertain
- Examples: 15/01/1990, 01/12/2024

---

## Technical Details

### File Size Limit
Maximum file size: **10MB**

### Supported Formats
- .xlsx (Excel 2007+)
- .xls (Excel 97-2003)

### Processing Time
Processing time depends on the number of records:
- 100 records: ~2-5 seconds
- 500 records: ~10-15 seconds
- 1000+ records: May take longer

### Concurrent Operations
The system processes sheets in this order:
1. Users (all rows)
2. Loans (all rows)
3. Payments (all rows)

Each row is processed sequentially within its sheet to maintain data integrity.

---

## Example Workflow

1. **Download the template:**
   ```bash
   GET /api/bulk-upload/template
   ```

2. **Fill in your data:**
   - Add users to the Users sheet
   - Add loans to the Loans sheet
   - Add payments to the Payments sheet

3. **Upload the file:**
   ```bash
   POST /api/bulk-upload/upload
   ```

4. **Review the results:**
   - Check success counts
   - Review any errors
   - Fix errors and re-upload failed rows if needed

---

## Support

For issues or questions:
- Check the error messages in the API response
- Verify your data against the template format
- Ensure all required fields are filled
- Contact your system administrator for database-related issues (missing loan types, states, cities)
