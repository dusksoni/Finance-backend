# Kushal Finance API - Quick Reference

## 🔗 Base URL
```
http://localhost:3001/api
```

## 🔑 Authentication

### Login Endpoints
| Method | Endpoint | Body |
|--------|----------|------|
| POST | `/admin/login` | `{ "email": "", "password": "" }` |
| POST | `/employee/login` | `{ "email": "", "password": "" }` |

**Token Usage:** After login, token is auto-saved and used in all requests via `Authorization: Bearer {{token}}`

---

## 👥 Users API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/users` | Create new user |
| GET | `/users` | Get all users (paginated) |
| GET | `/users/:id` | Get user by ID |
| PUT | `/users/:id` | Update user |
| DELETE | `/users/:id` | Delete user |
| GET | `/users/:id/activity` | Get user activity logs |
| GET | `/users/admin/requests` | Get pending update requests |
| PUT | `/users/admin/approve/:requestId` | Approve user update |
| PUT | `/users/admin/reject/:requestId` | Reject user update |

### Sample Create User Payload
```json
{
  "firstName": "John",
  "phone": "9876543210",
  "email": "john@example.com",
  "addresses": [{ "address": "123 Street", "pincode": 400001 }]
}
```

---

## 💰 Loans API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/loan` | Create new loan |
| GET | `/loan` | Get all loans |
| GET | `/loan/:id` | Get loan by ID |
| GET | `/loan/user/:userId` | Get loans by user |
| PUT | `/loan/:id` | Update loan |
| PUT | `/loan/close/:id` | Close loan |
| GET | `/loan/approvals` | Get pending approvals |
| POST | `/loan/:id/approve` | Approve loan |
| POST | `/loan/:id/reject` | Reject loan |
| GET | `/loan/download` | Download loans report |

### Sample Create Loan Payload
```json
{
  "userId": "user-id",
  "loanTypeId": "loan-type-id",
  "fileNo": "LN001",
  "principalLoanAmount": 50000,
  "interestRate": 14,
  "tenureMonths": 12,
  "startDate": "2024-01-01"
}
```

---

## 💳 Payments API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/loan/payment/pending/:loanId` | Get pending payments |
| POST | `/loan/payment/:loanId` | Make bulk payment |
| GET | `/loan/payment/emi/:emiId` | Get EMI details |
| POST | `/loan/payment/emi/:emiId/pay` | Pay specific EMI |
| GET | `/loan/payment/getbyid/:id` | Get payment by ID |
| GET | `/loan/payment/unverified` | Get unverified payments |
| POST | `/loan/payment/:paymentId/verify` | Verify payment |
| GET | `/loan/payment/invoice/:paymentId` | Get payment invoice |

### Sample Payment Payload
```json
{
  "amount": 5000,
  "paymentMode": "CASH",
  "paymentDate": "2024-01-05",
  "transactionId": "TXN123"
}
```

**Payment Modes:** `CASH`, `ONLINE`, `UPI`, `CHEQUE`

---

## 🏦 Foreclosure API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/loan/payment/foreclose/:loanId` | Get foreclosure details |
| POST | `/loan/foreclose-request/:loanId` | Create foreclose request |
| GET | `/loan/foreclose-approvals` | Get all requests |
| GET | `/loan/foreclose-request/:id` | Get request by ID |
| POST | `/loan/foreclose-request/:id/approve` | Approve request |
| POST | `/loan/foreclose-request/:id/reject` | Reject request |

---

## 🚗 Seized Assets API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/seized` | Get all seized histories |
| GET | `/seized/loan/:loanId` | Get seized by loan |
| GET | `/seized/:id` | Get seized by ID |
| POST | `/seized/:loanId` | Create seized request |
| PUT | `/seized/:id` | Update seized |
| DELETE | `/seized/:id` | Delete seized |
| POST | `/seized/:id/complete` | Mark as completed |
| POST | `/seized/:id/close` | Close seized |
| POST | `/seized/:id/release` | Release asset |
| POST | `/seized/:id/contact-attempt` | Add contact attempt |

### Sample Create Seized Payload
```json
{
  "assignedToId": "employee-id",
  "priority": "HIGH",
  "dueDate": "2024-02-01",
  "comment": "Customer not responding"
}
```

**Priority Levels:** `HIGH`, `MEDIUM`, `LOW`
**Status Values:** `PENDING`, `COMPLETED`, `RELEASED`

---

## 👔 Employee API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/employee/create` | Create employee |
| GET | `/employee/me` | Get self profile |
| PUT | `/employee/me` | Update self profile |
| PUT | `/employee/me/password` | Update self password |
| GET | `/admin/employees` | Get all employees |
| GET | `/admin/employees/:id` | Get employee by ID |
| PUT | `/employee/:id` | Update employee |
| PUT | `/employee/:id/password` | Update employee password |
| DELETE | `/employee/:id` | Delete employee |
| PUT | `/employee/block/:id` | Block/unblock employee |
| GET | `/employee/byPermission` | Get by permission |

---

## 🎭 Roles API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/roles` | Get all roles |
| GET | `/roles/:id` | Get role by ID |
| POST | `/roles` | Create role |
| PUT | `/roles/:id` | Update role |
| DELETE | `/roles/:id` | Delete role |
| GET | `/employee/permission/:userId` | Get user permissions |

### Sample Create Role Payload
```json
{
  "name": "Branch Manager",
  "description": "Manages branch operations",
  "permissions": ["LOAN_VIEW", "LOAN_CREATE", "LOAN_APPROVE", "USER_VIEW"]
}
```

### Common Permissions
- `LOAN_VIEW`, `LOAN_CREATE`, `LOAN_EDIT`, `LOAN_DELETE`, `LOAN_APPROVE`
- `USER_VIEW`, `USER_CREATE`, `USER_EDIT`, `USER_DELETE`
- `PAYMENT_VIEW`, `PAYMENT_CREATE`, `PAYMENT_VERIFY`
- `FORECLOSE_VERIFY`
- `USER_ACTIVITY_VIEW`

---

## 📊 Dashboard & Reports API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard/summary` | Get basic dashboard |
| GET | `/dashboard/enhanced` | Get enhanced dashboard |
| POST | `/dashboard/export/excel` | Export to Excel |
| POST | `/dashboard/export/pdf` | Export to PDF |
| POST | `/dashboard/export/formatted` | Export formatted |
| GET | `/report/cibil` | Download CIBIL report |

### Dashboard Query Parameters
```
GET /dashboard/enhanced?startDate=2024-01-01&endDate=2024-12-31
```

---

## 🔧 Admin Utilities API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/me` | Get admin profile |
| GET | `/admin/me/activity` | Get activity logs |
| GET | `/admin/me/login-history` | Get login history |
| PUT | `/admin/admin/:id` | Update admin |
| PUT | `/admin/admin/:id/password` | Update password |
| POST | `/admin/refresh-fines` | Manual fine refresh |
| GET | `/admin/cache-stats` | Get cache statistics |
| POST | `/admin/clear-cache` | Clear cache |

---

## 📤 File Upload API

| Method | Endpoint | Description | Body Type |
|--------|----------|-------------|-----------|
| POST | `/file/upload` | Upload file | form-data (file) |
| DELETE | `/file/remove` | Delete file | JSON: `{ "publicId": "" }` |

---

## 📦 Bulk Upload API

| Method | Endpoint | Description | Response Type |
|--------|----------|-------------|---------------|
| GET | `/bulk-upload/template` | Download Excel template | Excel file |
| POST | `/bulk-upload/upload` | Upload bulk data | JSON |

### Bulk Upload Response
```json
{
  "message": "Bulk upload completed",
  "results": {
    "users": { "success": 10, "failed": 2, "errors": [...] },
    "loans": { "success": 8, "failed": 1, "errors": [...] },
    "payments": { "success": 15, "failed": 0, "errors": [] }
  }
}
```

---

## 📋 Query Parameters Reference

### Pagination
```
?page=1&limit=10
```

### Filtering Users
```
?search=john
?name=John
?phone=9876543210
?email=john@example.com
?photoIdNumber=ABCD1234
```

### Date Filtering
```
?startDate=2024-01-01&endDate=2024-12-31
```

### Permission Filtering
```
?permission=LOAN_APPROVE
```

---

## 🎯 Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created successfully |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (no/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not found |
| 500 | Internal server error |

---

## 📝 Data Formats

### Date Format
- Input: `YYYY-MM-DD` (e.g., `2024-01-15`)
- Excel: `DD/MM/YYYY` (e.g., `15/01/2024`)

### Phone Format
- 10 digits without country code
- Example: `9876543210`

### File Number Format
- Alphanumeric string
- Example: `LN001`, `LOAN-2024-001`

---

## 🔄 Common Workflows

### 1. Create User → Create Loan → Make Payment
```
1. POST /users (save user ID)
2. POST /loan (use user ID, save loan ID)
3. POST /loan/payment/:loanId (make payment)
```

### 2. Approve Pending Loan
```
1. GET /loan/approvals (get pending loans)
2. GET /loan/:id (review loan details)
3. POST /loan/:id/approve (approve)
```

### 3. Verify Payment
```
1. GET /loan/payment/unverified (get unverified)
2. GET /loan/payment/getbyid/:id (review payment)
3. POST /loan/payment/:paymentId/verify (verify)
```

### 4. Bulk Data Import
```
1. GET /bulk-upload/template (download)
2. Fill Excel with data
3. POST /bulk-upload/upload (upload filled file)
```

---

## 💡 Pro Tips

1. **Save IDs:** After creating resources, save their IDs for future requests
2. **Use Variables:** Use Postman variables for frequently used IDs
3. **Test Scripts:** Login endpoints auto-save tokens
4. **Error Messages:** Check response message for detailed error info
5. **Permissions:** Ensure your role has required permissions
6. **File Size:** Max 10MB for bulk uploads
7. **Pagination:** Default limit is usually 10, increase as needed

---

## 🚨 Important Notes

- Always login first before making authenticated requests
- Tokens expire after a certain period (check backend config)
- File uploads use `form-data`, not JSON
- Bulk uploads process Users → Loans → Payments in order
- Phone numbers and file numbers must be unique
- Some endpoints require specific permissions

---

## 📖 Related Documentation

- **Detailed Setup:** See [README.md](README.md)
- **Bulk Upload Guide:** See [BULK_UPLOAD_GUIDE.md](../BULK_UPLOAD_GUIDE.md)
- **Database Schema:** See `/prisma/schema.prisma`

---

**Last Updated:** 2024-01-20
**API Version:** 1.0
**Collection Version:** 1.0
