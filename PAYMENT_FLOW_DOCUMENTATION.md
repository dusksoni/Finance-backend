# Payment & Fine System - Complete Documentation

## 🎯 Overview

This system handles loan payments with automatic fine calculation, smart caching, and precise distribution across multiple EMIs using a **single payment record**.

---

## 📊 Payment Flow Diagram

```
User Makes Payment (₹10,000)
         ↓
┌────────────────────────────────────────────┐
│  1. CREATE ONE PAYMENT RECORD (₹10,000)    │
│     - paymentId: "xyz123"                  │
│     - amount: 10000                        │
│     - emiId: null (not tied to one EMI)    │
└────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────┐
│  2. DISTRIBUTE ACROSS EMIs (Oldest First)  │
│                                            │
│  EMI #1 (Due: Jan 2025)                   │
│  ├─ Fine Due: ₹500 → Pay ₹500            │
│  ├─ EMI Due: ₹3,000 → Pay ₹3,000         │
│  └─ Status: PAID ✓                        │
│                                            │
│  EMI #2 (Due: Feb 2025)                   │
│  ├─ Fine Due: ₹300 → Pay ₹300            │
│  ├─ EMI Due: ₹3,000 → Pay ₹3,000         │
│  └─ Status: PAID ✓                        │
│                                            │
│  EMI #3 (Due: Mar 2025)                   │
│  ├─ Fine Due: ₹200 → Pay ₹200            │
│  ├─ EMI Due: ₹3,000 → Pay ₹2,700 only    │
│  └─ Status: PARTIAL (₹300 pending)        │
│                                            │
│  Remaining: ₹0                             │
└────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────┐
│  3. UPDATE PAYMENT METADATA                │
│     {                                      │
│       "affectedEmis": [emi1, emi2, emi3],  │
│       "summary": {                         │
│         "fineCollected": 1000,             │
│         "interestCollected": 4200,         │
│         "principalCollected": 4800         │
│       }                                    │
│     }                                      │
└────────────────────────────────────────────┘
```

---

## 🔄 Complete Payment Flow

### **Scenario 1: Partial Payment (Amount < Total Pending)**

**Example:**
- Total Pending: ₹15,000 (3 EMIs)
- Payment Amount: ₹10,000

**Flow:**
1. ✅ **Create ONE payment record** for ₹10,000
2. 📋 **Fetch overdue EMIs** (sorted by date, oldest first)
3. 💰 **Distribute amount:**
   - EMI #1: ₹3,500 (Fine ₹500 + EMI ₹3,000) → **PAID**
   - EMI #2: ₹3,300 (Fine ₹300 + EMI ₹3,000) → **PAID**
   - EMI #3: ₹3,200 (Fine ₹200 + EMI ₹3,000)
     - Amount left: ₹3,200
     - Pay Fine: ₹200
     - Pay EMI: ₹3,000 (but only ₹3,000 available, so partial)
     - **Status: PARTIAL** (₹300 remaining)
   - Remaining: ₹0

4. 🔄 **Next Payment:**
   - Fine calculated **ONLY on ₹300** (not on ₹3,000)
   - Previous fine already paid (₹200) → No fine charged again

---

### **Scenario 2: Full Payment + Excess (Amount > Total Pending)**

**Example:**
- Total Pending (Overdue): ₹9,000 (3 EMIs)
- Payment Amount: ₹15,000

**Flow:**
1. ✅ Create ONE payment for ₹15,000
2. 💰 **Pay all overdue EMIs first:**
   - EMI #1: ₹3,000 → PAID
   - EMI #2: ₹3,000 → PAID
   - EMI #3: ₹3,000 → PAID
   - Used: ₹9,000
   - Remaining: ₹6,000

3. 💰 **Pay current/future EMIs:**
   - EMI #4 (Current month): ₹3,000 → PAID
   - EMI #5 (Future): ₹3,000 → PAID
   - Remaining: ₹0

---

## 🧮 Payment Allocation Priority

For each EMI, payment is allocated in this order:

```
1. FINE      (Pay fine first - clears penalty)
   ↓
2. INTEREST  (Pay interest component)
   ↓
3. PRINCIPAL (Pay principal component)
```

### Example Breakdown:
```javascript
EMI Details:
- EMI Amount: ₹3,000 (Interest: ₹1,200 + Principal: ₹1,800)
- Fine Due: ₹500
- Payment Made: ₹2,500

Allocation:
1. Fine: ₹500 → ✅ Fully Paid
2. Interest: ₹1,200 → ✅ Fully Paid
3. Principal: ₹800 → ❌ Partial (₹1,000 pending)

EMI Status: PARTIAL
Next Time Fine Calculated On: ₹1,000 (remaining principal)
```

---

## 💾 Database Records

### **Payment Record (ONE per transaction)**
```json
{
  "id": "pay_xyz123",
  "loanId": "loan_abc",
  "emiId": null,           // ← Not tied to one EMI
  "amount": 10000,         // ← Full payment amount
  "paymentMode": "UPI",
  "transactionId": "UPI123456",
  "status": "PAID",
  "metadata": {
    "note": "Payment distributed across multiple EMIs",
    "affectedEmis": [
      {
        "emiId": "emi_1",
        "paymentFor": "2025-01-05",
        "paidAmount": 3500,
        "paidToFine": 500,
        "paidToInterest": 1200,
        "paidToPrincipal": 1800,
        "emiStatus": "PAID"
      },
      {
        "emiId": "emi_2",
        "paymentFor": "2025-02-05",
        "paidAmount": 3300,
        "paidToFine": 300,
        "paidToInterest": 1200,
        "paidToPrincipal": 1800,
        "emiStatus": "PAID"
      },
      {
        "emiId": "emi_3",
        "paymentFor": "2025-03-05",
        "paidAmount": 3200,
        "paidToFine": 200,
        "paidToInterest": 1200,
        "paidToPrincipal": 1800,
        "emiStatus": "PARTIAL"
      }
    ],
    "summary": {
      "totalAmount": 10000,
      "usedAmount": 10000,
      "unallocatedAmount": 0,
      "fineCollected": 1000,
      "interestCollected": 3600,
      "principalCollected": 5400,
      "emisAffected": 3
    }
  }
}
```

### **EMI Records (Multiple, linked to ONE payment)**
```json
// EMI #1
{
  "id": "emi_1",
  "emiPayAmount": 3000,
  "amountPaidSoFar": 3500,  // Includes fine (500) + EMI (3000)
  "finePaid": 500,
  "interestPaid": 1200,
  "principalPaid": 1800,
  "fineAmount": 500,
  "status": "PAID",
  "payments": ["pay_xyz123"]  // ← Links to the ONE payment
}

// EMI #2
{
  "id": "emi_2",
  "emiPayAmount": 3000,
  "amountPaidSoFar": 3300,
  "finePaid": 300,
  "interestPaid": 1200,
  "principalPaid": 1800,
  "fineAmount": 300,
  "status": "PAID",
  "payments": ["pay_xyz123"]  // ← Same payment ID
}

// EMI #3 (Partial)
{
  "id": "emi_3",
  "emiPayAmount": 3000,
  "amountPaidSoFar": 3200,
  "finePaid": 200,
  "interestPaid": 1200,
  "principalPaid": 1800,
  "fineAmount": 200,
  "status": "PARTIAL",
  "payments": ["pay_xyz123"]  // ← Same payment ID
}
```

---

## 🔍 Fine Calculation Logic

### **Key Principle: Fine calculated ONLY on unpaid EMI amount**

```javascript
// Formula
EMI Component Paid = amountPaidSoFar - finePaid
EMI Due = emiPayAmount - EMI Component Paid
Fine = calculateFine(dueDate, EMI Due)
```

### **Example:**
```
EMI Details:
- emiPayAmount: ₹3,000
- amountPaidSoFar: ₹2,500 (includes ₹500 fine + ₹2,000 EMI)
- finePaid: ₹500

Calculation:
1. EMI Component Paid = ₹2,500 - ₹500 = ₹2,000
2. EMI Due = ₹3,000 - ₹2,000 = ₹1,000
3. Fine = calculateFine(dueDate, ₹1,000) → e.g., ₹100 (10%)

Result: Fine charged on ₹1,000 only, NOT on ₹3,000
```

---

## 🎨 Fine Slabs

```javascript
Days Late    | Fine Percentage
-------------|------------------
0-7 days     | 0%
8-20 days    | 2.5%
21-30 days   | 5%
31+ days     | 5% + 5% per month
```

**Example:**
- Days Late: 45 days
- EMI Due: ₹1,000
- Fine: 5% + 5% (1 extra month) = 10%
- Fine Amount: ₹100

---

## ⚡ Smart Caching System

### **1-Hour Cache per Loan**
- ✅ Prevents unnecessary fine updates within 1 hour
- ✅ Reduces database load
- ✅ Improves performance

```javascript
// Cache Logic
if (shouldUpdateLoanFines(loanId)) {
  // Update fines (only if > 1 hour since last update)
  updateFinesForLoan(loanId);
  markLoanFinesUpdated(loanId);
}
```

---

## 🤖 Automated Fine Updates

### **Cron Jobs**
1. **Daily Update**: 12:01 AM (Asia/Kolkata)
2. **Backup Update**: Every 6 hours
3. **On Server Startup**: Runs once

### **Process:**
```javascript
1. Fetch all overdue EMIs (status: UNPAID/PARTIAL)
2. Calculate current fine for each
3. Update ONLY if fine/delayDays changed
4. Process in batches of 100
5. Log statistics
```

---

## 📡 API Endpoints

### **1. Get Pending Payments**
```http
GET /api/loan/:loanId/pending-payments
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "loanId": "loan_abc",
    "pending": [
      {
        "emiId": "emi_1",
        "paymentFor": "2025-01-05",
        "emiPayAmount": 3000,
        "alreadyPaid": 0,
        "fineAssessed": 500,
        "fineDue": 500,
        "totalDue": 3500,
        "delayDays": 45
      }
    ],
    "grandTotal": 10500
  }
}
```

---

### **2. Make Payment**
```http
POST /api/loan/:loanId/payment
```

**Request:**
```json
{
  "amountPaid": 10000,
  "paymentMode": "UPI",
  "transactionId": "UPI123456",
  "paymentDate": "2025-01-15"
}
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "message": "Payment processed",
    "paymentId": "pay_xyz123",
    "usedAmount": 10000,
    "unallocatedAmount": 0,
    "summary": {
      "fineCollected": 1000,
      "interestCollected": 3600,
      "principalCollected": 5400
    },
    "updatedInstallments": [
      {
        "emiId": "emi_1",
        "paidAmount": 3500,
        "emiStatus": "PAID"
      }
    ]
  }
}
```

---

### **3. Manual Fine Refresh (Admin Only)**
```http
POST /api/admin/refresh-fines
```

**Response:**
```json
{
  "status": 200,
  "message": "Fine refresh completed successfully",
  "data": {
    "success": true,
    "updated": 45,
    "duration": 1234
  }
}
```

---

### **4. Cache Statistics (Admin Only)**
```http
GET /api/admin/cache-stats
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "size": 10,
    "entries": [
      {
        "loanId": "loan_abc",
        "lastUpdate": "2025-01-15T10:30:00Z",
        "age": 3600000
      }
    ]
  }
}
```

---

## 🎯 Key Features

✅ **Single Payment Record**
- ONE payment for entire amount (e.g., ₹10,000)
- NOT multiple payments per EMI
- Links to all affected EMIs

✅ **Smart Distribution**
- Pays EMIs in chronological order (oldest first)
- Handles partial payments correctly
- Continues to future EMIs if excess amount

✅ **Fine Priority**
- Fine paid FIRST on each EMI
- Prevents accumulation of penalties
- Next fine calculated only on remaining EMI

✅ **Precision Math**
- Decimal.js for all calculations
- No floating-point errors
- Accurate to 2 decimal places

✅ **Performance**
- 1-hour smart caching
- Batch operations with Promise.all
- 30-second transaction timeout

✅ **Audit Trail**
- Detailed metadata in payment record
- Shows exact distribution across EMIs
- Easy reconciliation

---

## 🔧 Technical Implementation

### **Decimal.js Configuration**
```javascript
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });
```

### **Helper Function**
```javascript
const r2 = (n) => new Decimal(n || 0).toDecimalPlaces(2).toNumber();
```

### **Transaction Timeout**
```javascript
await prisma.$transaction(
  async (tx) => {
    // ... payment logic
  },
  { timeout: 30000 } // 30 seconds
);
```

---

## 📊 Example: Complete Payment Scenario

### **Initial State:**
```
Loan: ₹100,000 @ 12% p.a., 12 months
EMI: ₹8,885 per month

Overdue EMIs:
- Jan 2025: ₹8,885 (60 days overdue) → Fine: ₹890 (10%)
- Feb 2025: ₹8,885 (30 days overdue) → Fine: ₹445 (5%)
- Mar 2025: ₹8,885 (0 days overdue) → Fine: ₹0

Total Pending: ₹28,000 (₹26,655 + ₹1,335 fine)
```

### **User Pays: ₹20,000**

### **Distribution:**
```
1. Payment Record Created:
   - paymentId: "pay_001"
   - amount: ₹20,000
   - emiId: null

2. EMI #1 (Jan):
   - Fine: ₹890 → PAID
   - EMI: ₹8,885 → PAID
   - Status: PAID
   - Remaining: ₹10,225

3. EMI #2 (Feb):
   - Fine: ₹445 → PAID
   - EMI: ₹8,885 → PAID
   - Status: PAID
   - Remaining: ₹895

4. EMI #3 (Mar):
   - Fine: ₹0
   - EMI: ₹895 (partial) → PARTIAL
   - Status: PARTIAL
   - Remaining: ₹0

5. Payment Metadata Updated:
   {
     "fineCollected": 1335,
     "interestCollected": 1500,
     "principalCollected": 7165,
     "emisAffected": 3
   }
```

### **Next Payment:**
```
EMI #3 (Mar) has ₹7,990 pending
Fine will be calculated on ₹7,990 (not ₹8,885)
If 10 days late: Fine = ₹200 (2.5% of ₹7,990)
```

---

## 🚀 Summary

This payment system ensures:
1. ✅ **ONE payment record** per transaction
2. ✅ **Sequential EMI payment** (oldest first)
3. ✅ **Fine-first allocation** (clears penalties)
4. ✅ **Accurate fine calculation** (on remaining amount only)
5. ✅ **Detailed audit trail** (metadata tracks everything)
6. ✅ **High performance** (caching + batch operations)
7. ✅ **Precision math** (Decimal.js prevents errors)

---

**Generated with [Claude Code](https://claude.com/claude-code)**
