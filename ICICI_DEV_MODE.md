# ICICI Payment Gateway - Development Mode

## Overview

The ICICI payment integration has been set up with **Development Mode** support, allowing you to test the full payment flow without actual ICICI credentials or encryption keys.

## Current Status

✅ **Development Mode is ACTIVE**

The backend will automatically run in development mode when:
- Encryption keys are missing (`keys/icici_public_key.pem` or `keys/merchant_private_key.pem`)
- OR ICICI credentials are not configured in `.env`

## How It Works

### Development Mode (Current)
- Generates **valid UPI QR codes** with a test VPA (`kushalfinance@icici`)
- Creates transactions in the database
- Returns simulated responses without calling ICICI API
- **No encryption/decryption** is performed
- **No actual money is charged**

### What You Can Test
✅ QR code generation
✅ Frontend modal display
✅ Transaction creation in database
✅ Status polling (returns PENDING)
✅ Full UI/UX flow

### What You Cannot Test (Yet)
❌ Actual ICICI API calls
❌ Real payment processing
❌ Payment callbacks from ICICI
❌ Encryption/decryption

## Testing the Integration

1. **Start the backend** (it will show dev mode warning):
   ```bash
   npm start
   # You'll see: ⚠️  ICICI Payment Gateway - Running in DEVELOPMENT MODE
   ```

2. **Use the frontend** to initiate a payment:
   - Navigate to a loan payment page
   - Click "Initiate This Payment"
   - The modal will show a UPI QR code
   - The QR code is valid UPI format but points to test VPA

3. **Check the database**:
   - A `PendingUPITransaction` record is created with status `PENDING`
   - Status polling will return `PENDING` indefinitely in dev mode

4. **Simulate Payment Success** (for testing approval flow):
   - Manually update the database:
     ```sql
     UPDATE "PendingUPITransaction"
     SET status = 'SUCCESS'
     WHERE "merchantTranId" = 'your_transaction_id';
     ```
   - The next status check will return SUCCESS

## Switching to Production Mode

To enable **Production Mode** with real ICICI integration:

### Step 1: Generate RSA Keys

```bash
cd keys

# Generate merchant private key (4096-bit RSA)
openssl genrsa -out merchant_private_key.pem 4096

# Generate merchant public key from private key
openssl rsa -in merchant_private_key.pem -pubout -out merchant_public_key.pem
```

### Step 2: Get ICICI Credentials

Contact ICICI Bank and obtain:
1. Merchant ID
2. API Key
3. ICICI's Public Key (place as `icici_public_key.pem`)
4. Merchant VPA (Virtual Payment Address)

Send your `merchant_public_key.pem` to ICICI during onboarding.

### Step 3: Configure Environment

Update your `.env` file:

```env
# ICICI UPI/QR Payment Gateway
ICICI_MERCHANT_ID=your_merchant_id_from_icici
ICICI_SUB_MERCHANT_ID=your_sub_merchant_id
ICICI_TERMINAL_ID=5411
ICICI_API_KEY=your_api_key_from_icici

# Gateway URL (UAT for testing, Production for live)
ICICI_GATEWAY_URL=https://apibankingonesandbox.icicibank.com  # UAT
# ICICI_GATEWAY_URL=https://apibankingone.icicibank.com  # Production

ICICI_MERCHANT_VPA=your_vpa@icici
ICICI_MERCHANT_NAME=Kushal Finance

# Publicly accessible callback URL
ICICI_CALLBACK_URL=https://your-domain.com/api/icici-payment/callback
```

### Step 4: Restart Server

Once keys and credentials are configured, restart the server:
```bash
npm start
# You should NOT see the dev mode warning
```

## Security Notes

- ✅ Keys directory is already in `.gitignore`
- ✅ Never commit private keys to version control
- ✅ Store backup of private key securely
- ✅ Use environment variables for sensitive data

## Frontend Integration

The frontend Redux integration is **complete** and works with both dev and production modes:

- ✅ Redux actions, sagas, and reducers configured
- ✅ `ICICIQRPaymentModal` component using Redux
- ✅ Integrated into `bulkPay.jsx` and `recordPayment.jsx`

## Database Schema

The integration uses the `PendingUPITransaction` model. Ensure your Prisma schema includes:

```prisma
model PendingUPITransaction {
  id                   String    @id @default(cuid())
  loanId               String
  emiId                String?
  merchantTranId       String    @unique
  refId                String?
  billNumber           String
  amount               Float
  paymentType          String    // 'bulk' or 'emi'
  status               String    @default("PENDING")
  qrString             String?
  intentURL            String?
  bankRRN              String?
  payerName            String?
  payerMobile          String?
  payerVA              String?
  txnInitDate          DateTime?
  txnCompletionDate    DateTime?
  callbackReceivedAt   DateTime?
  createdByAdminId     String?
  createdByEmployeeId  String?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  loan                 Loan      @relation(fields: [loanId], references: [id])
  emi                  EMI?      @relation(fields: [emiId], references: [id])
}
```

If missing, run:
```bash
npx prisma migrate dev --name add_icici_payment_tables
```

## Support

For questions about:
- **ICICI Integration**: Check `ICICI_API_REFERENCE.md` and `ICICI_PAYMENT_SETUP.md`
- **Frontend Integration**: See `FRONTEND_INTEGRATION.md`
- **Encryption**: Check `utils/iciciEncryption.js` and `keys/README.md`

---

**Current Mode**: 🟡 Development (Simulated)
**Ready for Production**: ❌ (Keys and credentials needed)
