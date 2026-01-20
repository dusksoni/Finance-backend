# Kushal Finance Project Flow Documentation

This document describes the end-to-end lifecycle of a loan in the Kushal Finance system, from user creation to final closure.

---

## 1. User Creation
**Controller:** `controllers/user.controller.js` -> `createUser`
**Route:** `POST /api/users`

- **Input:** Basic details (name, DOB, gender, etc.), addresses, contact info, photo, proof of income, and **at least 2 guarantors**.
- **Process:**
    - Validates that the user doesn't already exist (Robust Check: Flags duplicate if **any** of Photo ID, Email, or Phone already exist).
    - Creates `File` records for any uploaded images (photos, proof of income).
    - Creates a `User` record in the database.
    - Stores `UserAddress` and `UserGuarantor` records.
    - Logs the "CREATED USER" action.

---

## 2. Loan Application
**Controller:** `controllers/loan.controller.js` -> `createLoan`
**Route:** `POST /api/loan`

- **Input:** `userId`, `loanTypeId`, `principalLoanAmount`, `interestRate`, `tenureMonths`, `paymentFrequency`, etc.
- **Process:**
    - Calculates simple interest: `Interest = Principal * Rate * (Tenure/12) / 100`.
    - Determines `totalAmount` (Principal + Interest) and `monthlyPayableAmount`.
    - Sets the `fileStatus` to `PENDING_APPROVAL`.
    - Creates a `Loan` record.
    - Creates a sub-type record (`TwoWheelerLoan`, `AgricultureLoan`, or `MSMELoan`) based on the `loanTypeId`.
    - Logs the "CREATED_LOAN" action.

---

## 3. Loan Approval
**Controller:** `controllers/loan.controller.js` -> `approveLoan`
**Route:** `POST /api/loan/:id/approve`

- **Input:** `fileNo`, `startDate`, `disbursedDate`.
- **Process:**
    - Validates that the loan is in a pending status.
    - Generates an **EMI schedule** based on the `startDate` and `paymentFrequency`.
    - Updates `fileStatus` to `ACTIVE`.
    - Creates `EMI` records for the entire tenure.
    - Sets the `endDate` of the loan.
    - Logs the "APPROVED_LOAN" action.

---

## 4. Payment Flow
### A. Individual EMI Payment
**Controller:** `controllers/payment.controller.js` -> `payPaymentById`
**Route:** `POST /api/loan/payment/emi/:emiId/pay`

- **Process:**
    - Allocates payment in order: **Fine -> Interest -> Principal**.
    - Creates a `Payment` record.
    - Updates the `EMI` status (PARTIAL or PAID).
    - If verified (automatic for gateway, manual for cash/cheque), updates loan aggregates (`totalPaidPrincipal`, `totalPaidInterest`, `totalPaidFine`, `pendingAmount`).

### B. Bulk Payment / Multi-EMI
**Controller:** `controllers/payment.controller.js` -> `makePayment`
**Route:** `POST /api/loan/payment/:loanId`

- **Process:**
    - Takes a lump sum and distributes it across all unpaid/partial EMIs.
    - Allocation priority remains **Fine -> Interest -> Principal** per EMI.
    - Updates all affected EMIs.

### C. Payment Verification
**Controller:** `controllers/payment.controller.js` -> `verifyPayment`
**Route:** `POST /api/loan/payment/:paymentId/verify`

- **Process:**
    - Marks the `Payment` as `verified`.
    - Recomputes the distribution for the specific EMI to ensure accuracy.
    - Re-syncs loan totals from EMI aggregates.

---

## 5. Delinquency & Fines
**Utility:** `utils/calculateFine.js`

- If an EMI is not paid by its `paymentFor` date, a fine is calculated.
- Fines are assessed whenever the loan or EMI details are fetched (with a 24-hour cache for performance).
- The fine is usually a percentage of the outstanding EMI amount.

---

## 6. Asset Seizure (Optional)
**Controller:** `controllers/seized.controller.js`

- If a loan is defaulted, Admin can initiate a seizure.
- `fileStatus` moves to `SEIZED_INITIATED` -> `SEIZED`.
- Assets can later be released, moving the status back to `ACTIVE`.

---

## 7. Foreclosure
**Controller:** `controllers/forecloseApproval.controller.js`

- **Request:** Admin/Employee creates a `ForecloseRequest` with a `calculatedAmount`.
- **Calculation:** `Foreclosure Amount = (Overdue Principal + Interest + Fine) + (Future Principal + Recalculated Interest)`.
- **Recalculated Interest:** Future interest is often reduced as the loan is being closed early.
- **Approval:** Once approved:
    - A foreclosure `Payment` is created.
    - All remaining `EMI`s are marked as `PAID`.
    - Loan `fileStatus` becomes `FORECLOSED`.
    - `isClosed` is set to `true`.

---

## 8. Loan Closure
**Controller:** `controllers/loan.controller.js` -> `closeLoan`
**Route:** `PUT /api/loan/close/:id`

- A loan can be manually closed if:
    - `pendingAmount` is 0.
    - All EMIs are `PAID`.
    - All payments are `verified`.
- `fileStatus` becomes `CLOSED`.
- `isClosed` is set to `true`.

---

## 🛡️ Security & Integrity (Updated)
- **Interest Consistency:** Both creation and updates now use **Simple Interest (Flat Rate)** for consistent EMI scheduling.
- **Payment Verification:** `CHEQUE` and manual `ONLINE` entries now require manual verification, while `CASH` (for authorized users) and `Gateway` payments remain auto-verified.
- **Balance Integrity:** `pendingAmount` is recalculated from EMI aggregates after every verified payment to prevent rounding drift.
- **Permissions:** Sensitive actions like User Update Approval (`USER_UPDATE_APPROVE`) and Direct Foreclosure (`FORECLOSE_VERIFY`) now require specific permissions.
