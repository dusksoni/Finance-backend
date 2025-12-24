# Kushal Finance API - Postman Collection

This folder contains the complete Postman collection for the Kushal Finance Backend API.

## 📦 What's Included

- **Kushal_Finance_API_Collection.json** - Complete API collection with all endpoints organized by folders

## 🚀 How to Import

### Method 1: Direct Import
1. Open Postman
2. Click on **Import** button (top left)
3. Click on **Upload Files**
4. Select `Kushal_Finance_API_Collection.json`
5. Click **Import**

### Method 2: Drag & Drop
1. Open Postman
2. Drag and drop `Kushal_Finance_API_Collection.json` into the Postman window
3. Collection will be imported automatically

## 🔧 Setup

### 1. Environment Variables

After importing, set up these collection variables:

| Variable | Default Value | Description |
|----------|---------------|-------------|
| `baseUrl` | `http://localhost:3001/api` | Your API base URL |
| `authToken` | (empty) | Auto-populated after login |

**To modify variables:**
1. Click on the collection name
2. Go to **Variables** tab
3. Update the `Current Value` column
4. Click **Save**

### 2. Authentication

The collection uses **Bearer Token** authentication. To get started:

1. **Login as Admin:**
   - Go to **Authentication → Admin Login**
   - Update the email/password in the request body
   - Click **Send**
   - The token will be auto-saved to `authToken` variable

2. **OR Login as Employee:**
   - Go to **Authentication → Employee Login**
   - Update the email/password in the request body
   - Click **Send**
   - The token will be auto-saved to `authToken` variable

The token is automatically used for all subsequent requests!

## 📁 Collection Structure

The collection is organized into the following folders:

### 1. Authentication
- Admin Login
- Employee Login

### 2. Admin
- Get Admin Profile
- Update Admin
- Update Admin Password
- Get Activity Logs
- Get Login History
- Refresh Fines (Manual)
- Get Cache Stats
- Clear Cache

### 3. Employee
- Create Employee
- Get Self Profile
- Update Self Profile
- Update Self Password
- Get All Employees
- Get Employee By ID
- Update Employee
- Update Employee Password
- Delete Employee
- Block/Unblock Employee
- Get Employees By Permission

### 4. Users
- Create User
- Get All Users
- Get User By ID
- Update User
- Delete User
- Get User Activity Logs
- Get Pending Update Requests
- Approve User Update
- Reject User Update

### 5. Loans
- Create Loan
- Get All Loans
- Get Loan By ID
- Get Loans By User
- Update Loan
- Get Pending Loan Approvals
- Approve Loan
- Reject Loan
- Close Loan
- Download Loans Report

### 6. Payments
- Get Pending Payments
- Make Payment (Bulk)
- Get EMI By ID
- Pay Specific EMI
- Get Payment By ID
- Get Unverified Payments
- Verify Payment
- Get Payment Invoice

### 7. Foreclosure
- Get Foreclosure Details
- Create Foreclose Request
- Get All Foreclose Requests
- Get Foreclose Request By ID
- Approve Foreclose Request
- Reject Foreclose Request

### 8. Seized/Ceased Assets
- Get All Seized Histories
- Get Seized By Loan
- Get Seized By ID
- Create Seized Request
- Update Seized
- Delete Seized
- Complete Seized
- Close Seized
- Release Seized Asset
- Add Contact Attempt

### 9. Roles & Permissions
- Get All Roles
- Get Role By ID
- Create Role
- Update Role
- Delete Role
- Get User Permissions

### 10. Dashboard & Reports
- Get Dashboard Summary
- Get Enhanced Dashboard
- Export Dashboard to Excel
- Export Dashboard to PDF
- Export Formatted Dashboard
- Download CIBIL Report

### 11. File Upload
- Upload File
- Delete File

### 12. Bulk Upload
- Download Template
- Upload Bulk Data

## 🎯 Quick Start Guide

### Example 1: Create a User

1. **Login first:**
   ```
   Authentication → Admin Login
   ```

2. **Create User:**
   ```
   Users → Create User
   ```

   Sample payload:
   ```json
   {
     "firstName": "John",
     "middleName": "K",
     "lastName": "Doe",
     "phone": "9876543210",
     "email": "john@example.com",
     "dateOfBirth": "1990-01-15",
     "addresses": [
       {
         "address": "123 Main Street",
         "country": "India",
         "pincode": 400001
       }
     ]
   }
   ```

### Example 2: Create a Loan

1. **Get user ID from previous step**

2. **Create Loan:**
   ```
   Loans → Create Loan
   ```

   Sample payload:
   ```json
   {
     "userId": "user-id-here",
     "loanTypeId": "loan-type-id",
     "fileNo": "LN001",
     "principalLoanAmount": 50000,
     "interestRate": 14,
     "tenureMonths": 12,
     "startDate": "2024-01-01",
     "paymentFrequency": "MONTHLY"
   }
   ```

### Example 3: Bulk Upload

1. **Download Template:**
   ```
   Bulk Upload → Download Template
   ```

2. **Fill the Excel file with your data**

3. **Upload:**
   ```
   Bulk Upload → Upload Bulk Data
   ```
   - Select the filled Excel file
   - Click Send

## 💡 Tips & Tricks

### 1. Using Path Variables
Many endpoints use path variables (e.g., `:id`). Replace these with actual IDs:
- Example: `/users/:id` → `/users/123e4567-e89b-12d3-a456-426614174000`

### 2. Query Parameters
Some endpoints support query parameters for filtering:
```
GET /users?page=1&limit=10&search=john
GET /dashboard/enhanced?startDate=2024-01-01&endDate=2024-12-31
```

### 3. File Uploads
For file upload endpoints:
1. Select **Body** → **form-data**
2. Change the type dropdown from **Text** to **File**
3. Click **Select Files** and choose your file

### 4. Testing Scripts
The login endpoints have pre-configured test scripts that automatically save the auth token. You can view these by:
1. Click on the request
2. Go to **Tests** tab
3. See the auto-save token script

### 5. Bulk Operations
Use the **Runner** feature for bulk testing:
1. Click on collection name
2. Click **Run**
3. Select requests to run
4. Click **Run Kushal Finance API**

## 🔐 Authentication Details

### Token Storage
- Tokens are automatically saved to collection variable `authToken`
- Valid for the session (check your backend for expiration time)
- Refresh by logging in again when expired

### Authorization Header
All authenticated endpoints automatically include:
```
Authorization: Bearer {{authToken}}
```

## 📊 Response Formats

### Success Response (200)
```json
{
  "status": 200,
  "message": "Success message",
  "data": { ... }
}
```

### Error Response (400/500)
```json
{
  "status": 400,
  "error": "Error type",
  "message": "Error description"
}
```

### Bulk Upload Response
```json
{
  "message": "Bulk upload completed",
  "results": {
    "users": {
      "success": 10,
      "failed": 2,
      "errors": [...]
    },
    "loans": { ... },
    "payments": { ... }
  }
}
```

## 🐛 Troubleshooting

### Issue: "Unauthorized" or 401 Error
**Solution:** Your token expired or is missing
- Go to Authentication folder
- Login again (Admin or Employee)
- Token will be auto-saved

### Issue: "Cannot find user" or "User not found"
**Solution:** Check if the user ID exists
- Use "Get All Users" to see available users
- Copy the correct user ID

### Issue: Path variable not replaced
**Solution:** Manually replace `:id` placeholders
- Example: Change `/users/:id` to `/users/actual-uuid-here`

### Issue: File upload failing
**Solution:**
- Ensure you selected **form-data** in Body
- Change field type to **File** (not Text)
- File size should be under 10MB for bulk uploads

### Issue: Bulk upload errors
**Solution:**
- Download fresh template first
- Follow the Excel template format exactly
- Check BULK_UPLOAD_GUIDE.md for detailed instructions
- Verify required fields are filled

## 📚 Additional Resources

- **API Documentation:** See [BULK_UPLOAD_GUIDE.md](../BULK_UPLOAD_GUIDE.md) for bulk upload details
- **Schema:** Check `/prisma/schema.prisma` for data models
- **Server:** Ensure your server is running on `http://localhost:3001`

## 🔄 Updating the Collection

When API endpoints change:
1. Export your current collection (to backup)
2. Import the updated `Kushal_Finance_API_Collection.json`
3. Your environment variables will be preserved

## 📞 Support

For issues or questions:
- Check the error message in the response
- Verify your payload matches the sample
- Ensure you're authenticated (token present)
- Check server logs for detailed errors

## 🎉 Happy Testing!

This collection includes all major endpoints of the Kushal Finance API. Start with Authentication, then explore other folders as needed.

**Pro Tip:** Use Postman's **Documentation** feature to generate shareable API docs:
1. Click on collection
2. Click **View Documentation**
3. Click **Publish** to create a web version
