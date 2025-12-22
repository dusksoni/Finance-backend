# ICICI Payment Gateway - API Quick Reference

## Base URL
- **UAT**: `https://apibankingonesandbox.icicibank.com`
- **Production**: `https://apibankingone.icicibank.com`

## Authentication
All endpoints require `apikey` header except callback endpoint.

---

## 1. Generate QR Code

Create a UPI QR code or intent URL for payment.

### Endpoint
```
POST /api/icici-payment/generate-qr
```

### Headers
```
Authorization: Bearer <token>
Content-Type: application/json
```

### Request Body
```json
{
  "loanId": "uuid",
  "emiId": "uuid",        // optional, required for EMI payment
  "amount": 5000.00,
  "paymentType": "bulk"   // "bulk" or "emi"
}
```

### Success Response (200)
```json
{
  "status": 200,
  "data": {
    "transactionId": "uuid",
    "merchantTranId": "TXN1703123456789ABC",
    "refId": "EZY286844327832",
    "billNumber": "BILL1703123456789XYZ",
    "amount": "5000.00",
    "qrString": "upi://pay?pa=merchant@icici&pn=Kushal Finance&tr=EZY286844327832&am=5000.00&cu=INR&mc=5411",
    "intentURL": "upi://pay?pa=merchant@icici&pn=Kushal Finance&tr=EZY286844327832&am=5000.00&cu=INR&mc=5411",
    "message": "Transaction Initiated",
    "expiresIn": 900
  }
}
```

### Error Response (400)
```json
{
  "error": "Valid amount is required",
  "status": 400
}
```

---

## 2. Payment Callback (Webhook)

Receives encrypted payment status from ICICI Bank.

### Endpoint
```
POST /api/icici-payment/callback
```

### Headers
```
Content-Type: text/plain
```

### Request Body
```
<Base64 encoded encrypted payload>
```

### Decrypted Payload Structure
```json
{
  "merchantId": "118449",
  "subMerchantId": "118449",
  "terminalId": "5411",
  "BankRRN": "615519221396",
  "merchantTranId": "TXN1703123456789ABC",
  "PayerName": "John Doe",
  "PayerMobile": "9876543210",
  "PayerVA": "customer@paytm",
  "PayerAmount": "5000.00",
  "TxnStatus": "SUCCESS",
  "TxnInitDate": "20231219142352",
  "TxnCompletionDate": "20231219142352"
}
```

### Success Response (200)
```json
{
  "status": "received",
  "merchantTranId": "TXN1703123456789ABC"
}
```

### Processing Steps
1. Decrypt payload using merchant private key
2. Update `PendingUPITransaction` with callback data
3. If `TxnStatus === 'SUCCESS'`:
   - Create `Payment` record
   - Auto-approve payment (verified=true)
   - Apply to loan/EMI
   - Update loan totals

---

## 3. Check Transaction Status

Query the status of a transaction by merchantTranId.

### Endpoint
```
GET /api/icici-payment/status/:merchantTranId
```

### Headers
```
Authorization: Bearer <token>
```

### Success Response (200)
```json
{
  "status": 200,
  "data": {
    "response": "0",
    "merchantId": "118449",
    "subMerchantId": "118449",
    "terminalId": "5411",
    "success": "true",
    "message": "Transaction Successful",
    "merchantTranId": "TXN1703123456789ABC",
    "OriginalBankRRN": "615519221396",
    "amount": "5000.00",
    "status": "SUCCESS",
    "localStatus": "SUCCESS",
    "localData": {
      "id": "uuid",
      "loanId": "uuid",
      "bankRRN": "615519221396",
      "payerName": "John Doe",
      "payerMobile": "9876543210",
      "payerVA": "customer@paytm",
      "txnCompletionDate": "2023-12-19T14:23:52.000Z"
    }
  }
}
```

---

## 4. Get Pending Transactions

Get all pending UPI transactions for a specific loan.

### Endpoint
```
GET /api/icici-payment/pending/:loanId
```

### Headers
```
Authorization: Bearer <token>
```

### Success Response (200)
```json
{
  "status": 200,
  "data": [
    {
      "id": "uuid",
      "loanId": "uuid",
      "emiId": null,
      "merchantTranId": "TXN1703123456789ABC",
      "refId": "EZY286844327832",
      "billNumber": "BILL1703123456789XYZ",
      "amount": "5000.00",
      "paymentType": "bulk",
      "status": "PENDING",
      "qrString": "upi://pay?...",
      "intentURL": "upi://pay?...",
      "createdAt": "2023-12-19T14:20:00.000Z"
    }
  ]
}
```

---

## 5. Initiate Refund

Initiate a refund for a completed transaction.

### Endpoint
```
POST /api/icici-payment/refund
```

### Headers
```
Authorization: Bearer <token>
Content-Type: application/json
```

### Request Body
```json
{
  "originalBankRRN": "615519221396",
  "originalMerchantTranId": "TXN1703123456789ABC",
  "refundAmount": 1000.00,
  "note": "Partial refund due to overpayment"
}
```

### Success Response (200)
```json
{
  "status": 200,
  "data": {
    "merchantId": "118449",
    "subMerchantId": "118449",
    "terminalId": "5411",
    "success": "true",
    "response": "0",
    "status": "SUCCESS",
    "message": "Refund initiated successfully",
    "originalBankRRN": "615519221396",
    "merchantTranId": "TXN1703567890DEF"
  }
}
```

---

## Status Codes

### Transaction Status
- `PENDING` - Transaction initiated, awaiting payment
- `SUCCESS` - Payment successful
- `FAILURE` - Payment failed

### Response Codes (from ICICI)
- `0` - Success
- `5000` - Invalid Request
- `5001` - Invalid Merchant ID
- `5002` - Duplicate Transaction ID
- `5006` - Transaction ID not available
- `8002` - Invalid JSON
- `8004` - Missing Required Field

See [ICICI_PAYMENT_SETUP.md](./ICICI_PAYMENT_SETUP.md) for complete error code list.

---

## Testing

### Test with cURL

#### Generate QR
```bash
curl -X POST http://localhost:3001/api/icici-payment/generate-qr \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "loanId": "loan-uuid",
    "amount": 1000,
    "paymentType": "bulk"
  }'
```

#### Check Status
```bash
curl http://localhost:3001/api/icici-payment/status/TXN1703123456789ABC \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Get Pending
```bash
curl http://localhost:3001/api/icici-payment/pending/loan-uuid \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Payment Flow Diagram

```
┌─────────────┐
│   Frontend  │
│  (Web/App)  │
└──────┬──────┘
       │
       │ 1. POST /generate-qr
       ▼
┌─────────────────────────────────┐
│  Backend (Kushal Finance)       │
│                                 │
│  ┌──────────────────────────┐  │
│  │ Generate QR API          │  │
│  │ - Encrypt request        │  │
│  │ - Call ICICI QR API      │  │
│  │ - Decrypt response       │  │
│  │ - Generate QR string     │  │
│  │ - Store in DB            │  │
│  └──────────────────────────┘  │
└─────────────┬───────────────────┘
              │
              │ 2. Return QR/Intent
              ▼
┌─────────────────────────────────┐
│   User scans QR with UPI app    │
│   or clicks UPI intent          │
└─────────────┬───────────────────┘
              │
              │ 3. UPI Transaction
              ▼
┌─────────────────────────────────┐
│   ICICI Bank UPI Gateway        │
└─────────────┬───────────────────┘
              │
              │ 4. Callback (encrypted)
              ▼
┌─────────────────────────────────┐
│  Backend (Kushal Finance)       │
│                                 │
│  ┌──────────────────────────┐  │
│  │ Callback Handler         │  │
│  │ - Decrypt callback       │  │
│  │ - Update transaction     │  │
│  │ - Create Payment         │  │
│  │ - Auto-approve           │  │
│  │ - Apply to loan/EMI      │  │
│  └──────────────────────────┘  │
└─────────────┬───────────────────┘
              │
              │ 5. Poll status or webhook
              ▼
┌─────────────────────────────────┐
│   Frontend shows success        │
└─────────────────────────────────┘
```

---

## Security Notes

1. **Encryption**: All requests to ICICI and callbacks use RSA-4096 encryption
2. **Authentication**: Use JWT tokens for API endpoints
3. **IP Whitelist**: Callback endpoint should be IP-whitelisted
4. **HTTPS**: Always use HTTPS in production
5. **Key Storage**: Never commit private keys to version control
6. **Rate Limiting**: Implement rate limiting on public endpoints

---

## Support

- **ICICI Merchant Support**: merchant.upi@icicibank.com
- **Documentation**: See [ICICI_PAYMENT_SETUP.md](./ICICI_PAYMENT_SETUP.md)
- **Issues**: Check server logs and database

---

**Version**: 1.0
**Last Updated**: December 2024
