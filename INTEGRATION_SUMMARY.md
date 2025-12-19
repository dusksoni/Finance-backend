# ICICI UPI/QR Payment Gateway - Integration Summary

## What Has Been Done

### ✅ Backend Implementation

#### 1. **Encryption Utilities** (`utils/iciciEncryption.js`)
- RSA/ECB/PKCS1 encryption/decryption functions
- QR string generation (UPI format)
- Intent URL generation
- Merchant transaction ID generation
- Amount formatting helpers

#### 2. **Payment Controller** (`controllers/iciciPayment.controller.js`)
- **generateQR**: Creates QR code/intent for payment
- **handleCallback**: Processes ICICI webhook callbacks
- **checkTransactionStatus**: Queries transaction status
- **getPendingTransactions**: Lists pending payments for a loan
- **initiateRefund**: Processes refund requests

#### 3. **Routes** (`routes/iciciPayment.route.js`)
```
POST   /api/icici-payment/generate-qr      (Generate QR/Intent)
POST   /api/icici-payment/callback         (ICICI Webhook)
GET    /api/icici-payment/status/:id       (Check Status)
GET    /api/icici-payment/pending/:loanId  (Pending Txns)
POST   /api/icici-payment/refund           (Initiate Refund)
```

#### 4. **Database Schema Updates** (`prisma/schema.prisma`)
- **PendingUPITransaction** model: Tracks QR generation and payment status
- **UPIRefund** model: Tracks refund requests
- Added relation to Loan model

#### 5. **Configuration**
- Updated `server.js` with new routes
- Updated `.env.example` with ICICI configuration
- Created `keys/` directory for RSA certificates
- Added keys to `.gitignore`

---

## File Structure

```
kushal-finance-backend/
├── controllers/
│   └── iciciPayment.controller.js      ✅ NEW
├── routes/
│   └── iciciPayment.route.js           ✅ NEW
├── utils/
│   └── iciciEncryption.js              ✅ NEW
├── prisma/
│   └── schema.prisma                   ✅ UPDATED
├── keys/                               ✅ NEW
│   ├── README.md
│   ├── icici_public_key.pem           (to be added)
│   ├── merchant_private_key.pem       (to be generated)
│   └── merchant_public_key.pem        (to be generated)
├── server.js                           ✅ UPDATED
├── .env.example                        ✅ UPDATED
├── .gitignore                          ✅ UPDATED
├── ICICI_PAYMENT_SETUP.md             ✅ NEW (Complete Guide)
└── ICICI_API_REFERENCE.md             ✅ NEW (API Docs)
```

---

## Next Steps (Manual)

### 1. Generate RSA Keys
```bash
cd kushal-finance-backend

# Generate private key (4096 bits)
openssl genrsa -out keys/merchant_private_key.pem 4096

# Generate public key
openssl rsa -in keys/merchant_private_key.pem -pubout -out keys/merchant_public_key.pem
```

### 2. ICICI Onboarding
Send to ICICI Bank:
- [ ] Merchant public key (`keys/merchant_public_key.pem`)
- [ ] Server IP address (or range)
- [ ] Callback URL: `https://your-domain.com/api/icici-payment/callback`
- [ ] SSL certificate

Receive from ICICI:
- [ ] Merchant ID (MID)
- [ ] Sub-Merchant ID
- [ ] Terminal ID
- [ ] API Key
- [ ] Merchant VPA (Virtual Payment Address)
- [ ] ICICI Public Key → Save as `keys/icici_public_key.pem`

### 3. Update Environment Variables
Copy `.env.example` to `.env` and fill in ICICI credentials:
```env
ICICI_MERCHANT_ID=118449
ICICI_SUB_MERCHANT_ID=118449
ICICI_TERMINAL_ID=5411
ICICI_API_KEY=your_api_key_here
ICICI_MERCHANT_VPA=kushalfinance@icici
ICICI_MERCHANT_NAME=Kushal Finance
ICICI_CALLBACK_URL=https://your-domain.com/api/icici-payment/callback
```

### 4. Run Database Migration
```bash
# Generate Prisma client
npx prisma generate

# Run migration
npx prisma migrate dev --name add_icici_payment_gateway

# Or push directly (dev only)
npx prisma db push
```

### 5. Test Locally
```bash
# Start server
npm run dev

# Expose with ngrok (for callback testing)
ngrok http 3001

# Update ICICI_CALLBACK_URL in .env with ngrok URL
```

### 6. Frontend Integration

#### For Web (React):
```bash
cd ../kushal-finance-static
npm install qrcode.react
```

See `ICICI_PAYMENT_SETUP.md` for complete React component examples.

#### For Mobile (React Native):
```bash
cd ../kushal-finance-mobile
npm install react-native-qrcode-svg react-native-svg
```

See `ICICI_PAYMENT_SETUP.md` for complete React Native component examples.

---

## How It Works

### Payment Flow

1. **User initiates payment** (Web or Mobile)
   - Frontend calls `POST /api/icici-payment/generate-qr`
   - Backend generates QR/Intent and stores in database

2. **User pays via UPI**
   - Scans QR code or opens UPI app (intent)
   - Completes payment in UPI app (Google Pay, PhonePe, etc.)

3. **ICICI sends callback**
   - ICICI gateway calls `POST /api/icici-payment/callback`
   - Backend decrypts callback, creates Payment record
   - Payment is **auto-approved** (no manual verification)

4. **Payment applied to loan/EMI**
   - If `paymentType === 'emi'`: Applies to specific EMI
   - If `paymentType === 'bulk'`: Applies to pending EMIs in order
   - Loan totals updated automatically

5. **Frontend polls status** (optional)
   - Can poll `GET /api/icici-payment/status/:merchantTranId`
   - Or rely on callback webhook

---

## Key Features

### Auto-Approval
- Gateway payments are automatically verified (`verified: true`)
- No manual approval step needed
- Immediate application to loan/EMI

### Security
- RSA-4096 encryption for all communications
- Encrypted callbacks from ICICI
- IP whitelisting for callback endpoint
- Private keys never committed to git

### Flexibility
- Supports both QR code and UPI intent
- Works on web and mobile
- Bulk payments or EMI-specific payments
- Refund support

### Tracking
- All transactions stored in database
- Full audit trail
- Status polling available
- Transaction metadata preserved

---

## Testing

### Quick Test (Local)

1. Start backend:
```bash
npm run dev
```

2. Generate QR:
```bash
curl -X POST http://localhost:3001/api/icici-payment/generate-qr \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "loanId": "some-loan-uuid",
    "amount": 100,
    "paymentType": "bulk"
  }'
```

3. Check response for QR string

4. Test with ICICI UAT sandbox

---

## Integration with Existing Payment System

The ICICI integration works **alongside** your existing payment system:

### Existing Flow (Cash/Manual UPI)
```
User → makePayment/payPaymentById → Manual verification → Approve
```

### New Flow (ICICI Gateway)
```
User → Generate QR → Pay via UPI → Auto-callback → Auto-approved ✓
```

### Key Difference
- **useGateway: true** flag in payment controller
- Automatically sets `verified: true`
- Skips manual approval step

---

## Documentation

- **[ICICI_PAYMENT_SETUP.md](./ICICI_PAYMENT_SETUP.md)**: Complete setup guide with frontend examples
- **[ICICI_API_REFERENCE.md](./ICICI_API_REFERENCE.md)**: Quick API reference

---

## Support & Troubleshooting

### Common Issues

1. **"Decryption failed"**
   - Check keys match (merchant_private_key.pem vs merchant_public_key.pem)
   - Verify ICICI public key is correct

2. **"Callback not received"**
   - Ensure callback URL is publicly accessible
   - Check ngrok is running (for local testing)
   - Verify IP is whitelisted with ICICI

3. **"Transaction not found"**
   - Check database for PendingUPITransaction
   - Verify merchantTranId matches

### Logs to Check
```bash
# Backend logs
pm2 logs

# Database queries
npx prisma studio

# Test callback endpoint
curl https://your-domain.com/api/icici-payment/callback
```

---

## Production Checklist

Before going live:

- [ ] Generate production RSA keys
- [ ] Send public key to ICICI
- [ ] Receive production credentials from ICICI
- [ ] Update .env with production values
- [ ] Update ICICI_GATEWAY_URL to production
- [ ] Ensure HTTPS on callback URL
- [ ] Run database migration on production
- [ ] Test with small amount first
- [ ] Monitor logs for first few transactions
- [ ] Set up alerting for failed callbacks

---

## Contact

- **ICICI Support**: merchant.upi@icicibank.com
- **Backend Issues**: Check server logs
- **Integration Help**: See documentation files

---

**Status**: Ready for testing ✅
**Version**: 1.0
**Created**: December 2024
