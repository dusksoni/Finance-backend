# ICICI UPI/QR Payment Gateway Integration Guide

This guide covers the complete setup and integration of ICICI Bank's UPI/QR payment gateway for Kushal Finance.

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Backend Setup](#backend-setup)
4. [Database Migration](#database-migration)
5. [API Endpoints](#api-endpoints)
6. [Frontend Integration](#frontend-integration)
7. [Testing](#testing)
8. [Production Deployment](#production-deployment)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The ICICI payment gateway integration allows users to make loan payments via:
- **QR Code**: Display QR code for scanning with any UPI app
- **UPI Intent**: Direct integration with UPI apps on mobile devices
- **Auto-approval**: Gateway payments are automatically approved (no manual verification needed)

### Payment Flow

1. **Generate QR/Intent** → User initiates payment
2. **User Scans QR** → Opens UPI app and pays
3. **ICICI Callback** → Payment status sent to your server
4. **Auto-process** → Payment automatically applied to loan/EMI

---

## Prerequisites

### From ICICI Bank
You need to provide ICICI with:
- IP address (or IP range if dynamic)
- Callback URL (webhook endpoint)
- Merchant public key (.pem or .cer format, 4096 bits)
- SSL certificate for callback URL

ICICI will provide you:
- Merchant ID (MID)
- Sub-Merchant ID
- Terminal ID (MCC code)
- API Key
- Virtual Payment Address (VPA)
- ICICI's public key certificate
- Gateway URLs (UAT and Production)

---

## Backend Setup

### Step 1: Generate RSA Keys

Generate 4096-bit RSA key pair for encryption:

```bash
cd kushal-finance-backend

# Generate private key
openssl genrsa -out keys/merchant_private_key.pem 4096

# Generate public key from private key
openssl rsa -in keys/merchant_private_key.pem -pubout -out keys/merchant_public_key.pem
```

**Important**:
- Send `merchant_public_key.pem` to ICICI Bank
- Keep `merchant_private_key.pem` secure and never commit to git
- Place ICICI's public key (provided by them) in `keys/icici_public_key.pem`

### Step 2: Environment Variables

Update your `.env` file with ICICI credentials:

```env
# ICICI UPI/QR Payment Gateway Configuration
ICICI_MERCHANT_ID=118449
ICICI_SUB_MERCHANT_ID=118449
ICICI_TERMINAL_ID=5411
ICICI_API_KEY=your_api_key_from_icici

# Gateway URLs
ICICI_GATEWAY_URL=https://apibankingonesandbox.icicibank.com

# Merchant VPA (provided by ICICI)
ICICI_MERCHANT_VPA=kushalfinance@icici
ICICI_MERCHANT_NAME=Kushal Finance

# Callback URL (must be publicly accessible)
ICICI_CALLBACK_URL=https://your-domain.com/api/icici-payment/callback
```

**For Local Testing**: Use ngrok to expose your localhost:
```bash
ngrok http 3001
# Use the https URL as ICICI_CALLBACK_URL
```

### Step 3: Database Migration

Run Prisma migration to create new tables:

```bash
# Generate Prisma client
npx prisma generate

# Create migration
npx prisma migrate dev --name add_icici_payment_gateway

# Or push schema directly (for development)
npx prisma db push
```

This creates two new tables:
- `PendingUPITransaction` - Tracks QR generation and pending payments
- `UPIRefund` - Tracks refund requests

### Step 4: Start Server

```bash
npm run dev
```

Server should start on port 3001. Verify the route is registered:
```
🚀 Server running on http://localhost:3001
```

---

## Database Migration

### New Tables Created

#### PendingUPITransaction
Stores QR generation requests and tracks payment status until callback is received.

```prisma
model PendingUPITransaction {
  id                    String    @id @default(uuid())
  loanId                String
  emiId                 String?
  merchantTranId        String    @unique
  refId                 String?   // ICICI generated refId
  billNumber            String
  amount                Decimal
  paymentType           String    // "bulk" or "emi"
  status                String    // PENDING, SUCCESS, FAILURE
  qrString              String?
  intentURL             String?

  // Populated by callback
  bankRRN               String?
  payerName             String?
  payerMobile           String?
  payerVA               String?
  txnInitDate           DateTime?
  txnCompletionDate     DateTime?
  callbackReceivedAt    DateTime?
}
```

#### UPIRefund
Tracks refund requests to ICICI.

```prisma
model UPIRefund {
  id                      String    @id @default(uuid())
  originalBankRRN         String
  originalMerchantTranId  String
  refundMerchantTranId    String    @unique
  refundAmount            Decimal
  status                  String    // PENDING, SUCCESS, FAILURE
  note                    String?
  refundResponse          Json?
}
```

---

## API Endpoints

### 1. Generate QR Code

**Endpoint**: `POST /api/icici-payment/generate-qr`

**Authentication**: Required (Admin/Employee)

**Request Body**:
```json
{
  "loanId": "uuid",
  "emiId": "uuid",  // optional, for EMI payment
  "amount": 5000.00,
  "paymentType": "bulk"  // "bulk" or "emi"
}
```

**Response**:
```json
{
  "status": 200,
  "data": {
    "transactionId": "uuid",
    "merchantTranId": "TXN1703123456789ABC",
    "refId": "EZY286844327832",
    "billNumber": "BILL1703123456789XYZ",
    "amount": "5000.00",
    "qrString": "upi://pay?pa=kushal@icici&pn=Kushal Finance&tr=EZY286844327832&am=5000.00&cu=INR&mc=5411",
    "intentURL": "upi://pay?...",
    "message": "Transaction Initiated",
    "expiresIn": 900
  }
}
```

**Usage**:
- Display `qrString` as QR code on web (use `qrcode.react` or similar)
- Use `intentURL` on mobile to trigger UPI apps
- Transaction expires in 15 minutes (900 seconds)

### 2. Payment Callback (Webhook)

**Endpoint**: `POST /api/icici-payment/callback`

**Authentication**: None (called by ICICI)

**Important**: This endpoint should be:
- Publicly accessible (no authentication)
- IP-whitelisted to ICICI's gateway IPs only
- HTTPS enabled

**Request Body**: Encrypted payload from ICICI

**Response**: Always return 200 to acknowledge receipt

**Automatic Processing**:
- Decrypts callback data
- Updates transaction status
- Auto-creates Payment record
- Auto-applies to loan/EMI (useGateway=true)
- No manual approval needed

### 3. Check Transaction Status

**Endpoint**: `GET /api/icici-payment/status/:merchantTranId`

**Authentication**: Required

**Response**:
```json
{
  "status": 200,
  "data": {
    "response": "0",
    "merchantId": "118449",
    "merchantTranId": "TXN1703123456789ABC",
    "amount": "5000.00",
    "success": "true",
    "message": "Transaction Successful",
    "status": "SUCCESS",
    "localStatus": "SUCCESS",
    "localData": {
      "id": "uuid",
      "bankRRN": "615519221396",
      "payerName": "John Doe",
      "payerVA": "customer@paytm"
    }
  }
}
```

### 4. Get Pending Transactions

**Endpoint**: `GET /api/icici-payment/pending/:loanId`

**Authentication**: Required

**Response**: Array of pending UPI transactions for the loan

### 5. Initiate Refund

**Endpoint**: `POST /api/icici-payment/refund`

**Authentication**: Required (Admin recommended)

**Request Body**:
```json
{
  "originalBankRRN": "615519221396",
  "originalMerchantTranId": "TXN1703123456789ABC",
  "refundAmount": 1000.00,
  "note": "Partial refund due to overpayment"
}
```

---

## Frontend Integration

### Web Application

#### 1. Install QR Code Library
```bash
npm install qrcode.react
```

#### 2. Create Payment Component

```jsx
import React, { useState } from 'react';
import QRCode from 'qrcode.react';
import axios from 'axios';

const UPIPayment = ({ loanId, amount, paymentType, emiId }) => {
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateQR = async () => {
    setLoading(true);
    try {
      const response = await axios.post('/api/icici-payment/generate-qr', {
        loanId,
        emiId,
        amount,
        paymentType
      }, {
        headers: {
          'Authorization': `Bearer ${yourAuthToken}`
        }
      });

      setQrData(response.data.data);

      // Poll for payment status every 5 seconds
      const pollInterval = setInterval(async () => {
        const status = await axios.get(
          `/api/icici-payment/status/${response.data.data.merchantTranId}`
        );

        if (status.data.data.status === 'SUCCESS') {
          clearInterval(pollInterval);
          // Payment successful! Redirect or show success
          alert('Payment Successful!');
        }
      }, 5000);

      // Stop polling after 15 minutes
      setTimeout(() => clearInterval(pollInterval), 900000);

    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate QR');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {!qrData ? (
        <button onClick={generateQR} disabled={loading}>
          {loading ? 'Generating...' : 'Pay via UPI'}
        </button>
      ) : (
        <div>
          <h3>Scan QR to Pay ₹{qrData.amount}</h3>
          <QRCode value={qrData.qrString} size={256} />
          <p>Transaction ID: {qrData.merchantTranId}</p>
          <p>Expires in 15 minutes</p>
          <small>Scan with any UPI app (Google Pay, PhonePe, Paytm, etc.)</small>
        </div>
      )}
      {error && <p style={{color: 'red'}}>{error}</p>}
    </div>
  );
};

export default UPIPayment;
```

### Mobile Application (React Native / Expo)

#### 1. Install Dependencies
```bash
npm install react-native-qrcode-svg react-native-svg
```

#### 2. Create Payment Component

```jsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Linking, Alert } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import axios from 'axios';

const UPIPayment = ({ loanId, amount, paymentType, emiId }) => {
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(false);

  const generatePayment = async (method = 'qr') => {
    setLoading(true);
    try {
      const response = await axios.post('/api/icici-payment/generate-qr', {
        loanId,
        emiId,
        amount,
        paymentType
      });

      setQrData(response.data.data);

      // For mobile, open UPI app directly
      if (method === 'app') {
        Linking.openURL(response.data.data.intentURL);
      }

      // Poll for status
      pollPaymentStatus(response.data.data.merchantTranId);

    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to initiate payment');
    } finally {
      setLoading(false);
    }
  };

  const pollPaymentStatus = (merchantTranId) => {
    const interval = setInterval(async () => {
      try {
        const status = await axios.get(`/api/icici-payment/status/${merchantTranId}`);

        if (status.data.data.status === 'SUCCESS') {
          clearInterval(interval);
          Alert.alert('Success', 'Payment completed successfully!');
          // Navigate back or refresh
        }
      } catch (err) {
        console.error('Status poll error:', err);
      }
    }, 5000);

    // Stop after 15 minutes
    setTimeout(() => clearInterval(interval), 900000);
  };

  return (
    <View>
      {!qrData ? (
        <>
          <TouchableOpacity onPress={() => generatePayment('app')}>
            <Text>Pay with UPI App</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => generatePayment('qr')}>
            <Text>Show QR Code</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View>
          <Text>Scan to Pay ₹{qrData.amount}</Text>
          <QRCode value={qrData.qrString} size={200} />
          <Text>Transaction ID: {qrData.merchantTranId}</Text>
        </View>
      )}
    </View>
  );
};

export default UPIPayment;
```

---

## Testing

### Local Testing Setup

1. **Start backend**:
```bash
npm run dev
```

2. **Expose localhost with ngrok**:
```bash
ngrok http 3001
```

3. **Update .env**:
```env
ICICI_CALLBACK_URL=https://your-ngrok-url.ngrok.io/api/icici-payment/callback
```

4. **Inform ICICI**: Provide ngrok URL as callback URL for testing

### Test Scenarios

#### 1. Generate QR for Bulk Payment
```bash
curl -X POST http://localhost:3001/api/icici-payment/generate-qr \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "loanId": "loan-uuid",
    "amount": 1000,
    "paymentType": "bulk"
  }'
```

#### 2. Generate QR for EMI Payment
```bash
curl -X POST http://localhost:3001/api/icici-payment/generate-qr \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "loanId": "loan-uuid",
    "emiId": "emi-uuid",
    "amount": 5000,
    "paymentType": "emi"
  }'
```

#### 3. Check Transaction Status
```bash
curl http://localhost:3001/api/icici-payment/status/TXN1703123456789ABC \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 4. Test Callback (Mock)
```bash
# This will be called by ICICI, but you can test with mock data
curl -X POST http://localhost:3001/api/icici-payment/callback \
  -H "Content-Type: text/plain" \
  -d "ENCRYPTED_PAYLOAD_FROM_ICICI"
```

### UAT Testing Checklist

- [ ] QR generation successful
- [ ] QR code displays correctly
- [ ] UPI intent opens correct app
- [ ] Test payment with UPI app
- [ ] Callback received correctly
- [ ] Payment auto-approved
- [ ] Loan/EMI updated correctly
- [ ] Transaction status API works
- [ ] Refund API works
- [ ] Error handling works

---

## Production Deployment

### Pre-deployment Checklist

1. **Environment Variables**:
   - [ ] Update `ICICI_GATEWAY_URL` to production URL
   - [ ] Update `ICICI_CALLBACK_URL` to production domain
   - [ ] Verify all ICICI credentials

2. **SSL Certificate**:
   - [ ] Ensure HTTPS is enabled
   - [ ] Valid SSL certificate installed
   - [ ] Callback URL uses HTTPS

3. **Security**:
   - [ ] Private key secured (not in git)
   - [ ] API key secured
   - [ ] Callback endpoint IP-whitelisted
   - [ ] Rate limiting enabled

4. **Database**:
   - [ ] Migration applied
   - [ ] Indexes created
   - [ ] Backup configured

5. **ICICI Configuration**:
   - [ ] Production MID configured
   - [ ] IP address whitelisted
   - [ ] Callback URL registered
   - [ ] Public key shared with ICICI

### Deployment Steps

1. **Update .env**:
```env
ICICI_GATEWAY_URL=https://apibankingone.icicibank.com
ICICI_CALLBACK_URL=https://api.kushalfinance.com/api/icici-payment/callback
```

2. **Run migration**:
```bash
npx prisma migrate deploy
```

3. **Restart server**:
```bash
pm2 restart all
```

4. **Verify**:
```bash
curl https://api.kushalfinance.com/api/status
```

### Monitoring

Set up monitoring for:
- Callback endpoint uptime
- Payment success rate
- Failed transactions
- Refund status
- API response times

---

## Troubleshooting

### Common Issues

#### 1. "Decryption failed"
- **Cause**: Wrong private key or corrupted encryption
- **Solution**: Verify private key matches public key sent to ICICI

#### 2. "Callback not received"
- **Cause**: URL not accessible or IP not whitelisted
- **Solution**: Check ngrok URL, verify HTTPS, check ICICI IP whitelist

#### 3. "Transaction not found"
- **Cause**: merchantTranId mismatch
- **Solution**: Verify merchantTranId in database

#### 4. "Payment not auto-approved"
- **Cause**: `useGateway` flag not set
- **Solution**: Verify callback handler sets useGateway=true

#### 5. "QR expired"
- **Cause**: 15-minute timeout
- **Solution**: Generate new QR code

### Debug Mode

Enable detailed logging:

```javascript
// In iciciPayment.controller.js
console.log('Request payload:', requestPayload);
console.log('Encrypted payload:', encryptedPayload);
console.log('Decrypted response:', decryptedResponse);
```

### ICICI Support

For production issues, contact ICICI support:
- Email: merchant.upi@icicibank.com
- Phone: 1800-XXX-XXXX (provided during onboarding)

---

## Security Best Practices

1. **Never commit private keys**: Always in .gitignore
2. **Rotate keys periodically**: Generate new keys every 12 months
3. **IP whitelist callback**: Only allow ICICI IPs
4. **Rate limit APIs**: Prevent abuse
5. **Log all transactions**: For audit trail
6. **Encrypt logs**: Don't log sensitive data in plain text
7. **Monitor anomalies**: Alert on unusual patterns

---

## Additional Resources

- [ICICI UPI API Documentation](https://www.icicibank.com/merchant-services)
- [UPI Specification](https://www.npci.org.in/what-we-do/upi)
- [Prisma Documentation](https://www.prisma.io/docs)

---

## Support

For integration support:
- Backend: Check server logs
- Database: Check Prisma migrations
- ICICI: Contact ICICI merchant support
- Code issues: Check GitHub issues

---

**Last Updated**: December 2024
**Version**: 1.0
