# ICICI Payment Gateway - Frontend Integration Guide

Complete guide for integrating ICICI UPI/QR payment gateway on web and mobile frontends.

## Table of Contents
1. [Mobile App Integration](#mobile-app-integration)
2. [Web App Integration](#web-app-integration)
3. [Usage Examples](#usage-examples)
4. [Testing](#testing)

---

## Mobile App Integration

### ✅ What's Already Done

The mobile app (**kushal-finance-mobile**) integration is **complete**:

1. **API Service Functions** (`services/payment.ts`):
   - `iciciGenerateQR()` - Generate QR code/UPI intent
   - `iciciCheckStatus()` - Check transaction status
   - `iciciGetPendingTransactions()` - Get pending transactions

2. **UI Component** (`components/payment/ICICIUPIPayment.tsx`):
   - Complete payment component with QR display
   - UPI intent integration
   - Auto status polling
   - Countdown timer
   - Success/failure handling

3. **Dependencies**: Already has `react-native-qrcode-svg` installed

### Mobile Usage Example

```tsx
import ICICIUPIPayment from '@/components/payment/ICICIUPIPayment';

function PaymentScreen() {
  const loanId = 'your-loan-id';
  const emiId = 'your-emi-id'; // optional
  const amount = 5000;

  return (
    <ICICIUPIPayment
      loanId={loanId}
      emiId={emiId}
      amount={amount}
      paymentType="emi" // or "bulk"
      onSuccess={(data) => {
        console.log('Payment successful:', data);
        // Navigate to success screen or refresh loan details
      }}
      onError={(error) => {
        console.error('Payment error:', error);
      }}
      onCancel={() => {
        console.log('Payment cancelled');
      }}
    />
  );
}
```

### Mobile Features

1. **Two Payment Methods**:
   - **Pay with UPI App**: Opens UPI app directly via intent
   - **Show QR Code**: Displays QR for scanning

2. **Auto Status Polling**:
   - Polls backend every 5 seconds
   - Automatically detects success/failure
   - Shows real-time updates

3. **Countdown Timer**:
   - Shows time remaining (15 minutes)
   - Expires and stops polling after timeout

4. **User Experience**:
   - Loading indicators
   - Success/failure alerts
   - Clean modal interface
   - Cancel anytime

---

## Web App Integration

### Setup Required

The web app (**kushal-finance-static**) needs a few additions:

### 1. Install QR Code Library

```bash
cd ../kushal-finance-static
npm install qrcode.react
```

### 2. Create API Service

Create `lib/iciciPaymentService.ts`:

```typescript
// lib/iciciPaymentService.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface ICICIGenerateQRPayload {
  loanId: string;
  emiId?: string;
  amount: number;
  paymentType: 'bulk' | 'emi';
}

export interface ICICIGenerateQRResponse {
  success: boolean;
  data?: {
    transactionId: string;
    merchantTranId: string;
    refId: string;
    billNumber: string;
    amount: string;
    qrString: string;
    intentURL: string;
    message: string;
    expiresIn: number;
  };
  error?: string;
  status?: number;
}

export interface ICICITransactionStatusResponse {
  success: boolean;
  data?: {
    response: string;
    merchantId: string;
    merchantTranId: string;
    amount: string;
    success: string;
    message: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILURE';
    localStatus?: string;
    localData?: {
      id: string;
      bankRRN?: string;
      payerName?: string;
      payerMobile?: string;
      payerVA?: string;
      txnCompletionDate?: string;
    };
  };
  error?: string;
  status?: number;
}

export async function iciciGenerateQR(
  payload: ICICIGenerateQRPayload,
  token: string
): Promise<ICICIGenerateQRResponse> {
  const response = await fetch(`${API_BASE_URL}/icici-payment/generate-qr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  return response.json();
}

export async function iciciCheckStatus(
  merchantTranId: string,
  token: string
): Promise<ICICITransactionStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/icici-payment/status/${merchantTranId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  return response.json();
}

export async function iciciGetPendingTransactions(loanId: string, token: string) {
  const response = await fetch(`${API_BASE_URL}/icici-payment/pending/${loanId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  return response.json();
}
```

### 3. Create Payment Component

Create `components/payment/ICICIUPIPayment.tsx`:

```tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode.react';
import {
  iciciGenerateQR,
  iciciCheckStatus,
  type ICICIGenerateQRPayload,
} from '@/lib/iciciPaymentService';

interface ICICIUPIPaymentProps {
  loanId: string;
  emiId?: string;
  amount: number;
  paymentType: 'bulk' | 'emi';
  authToken: string;
  onSuccess?: (data: any) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
}

export default function ICICIUPIPayment({
  loanId,
  emiId,
  amount,
  paymentType,
  authToken,
  onSuccess,
  onError,
  onCancel,
}: ICICIUPIPaymentProps) {
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle');
  const [timeRemaining, setTimeRemaining] = useState(900); // 15 minutes
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  const generateQR = async () => {
    setLoading(true);
    setError(null);
    setPaymentStatus('pending');

    try {
      const payload: ICICIGenerateQRPayload = {
        loanId,
        emiId,
        amount,
        paymentType,
      };

      const response = await iciciGenerateQR(payload, authToken);

      if (response.success && response.data) {
        setQrData(response.data);
        setTimeRemaining(response.data.expiresIn || 900);

        // Start polling for status
        startStatusPolling(response.data.merchantTranId);

        // Start countdown
        startCountdownTimer();
      } else {
        throw new Error(response.error || 'Failed to generate QR');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate QR code');
      setPaymentStatus('idle');
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startStatusPolling = (merchantTranId: string) => {
    pollIntervalRef.current = setInterval(async () => {
      try {
        const statusResponse = await iciciCheckStatus(merchantTranId, authToken);

        if (statusResponse.success && statusResponse.data) {
          const status = statusResponse.data.status || statusResponse.data.localStatus;

          if (status === 'SUCCESS') {
            setPaymentStatus('success');
            stopPolling();
            onSuccess?.(statusResponse.data);
          } else if (status === 'FAILURE' || status === 'FAILED') {
            setPaymentStatus('failed');
            stopPolling();
            onError?.('Payment failed');
          }
        }
      } catch (error) {
        console.error('Status polling error:', error);
      }
    }, 5000);

    // Stop after 15 minutes
    setTimeout(() => {
      stopPolling();
      if (paymentStatus === 'pending') {
        setPaymentStatus('failed');
        setError('Payment timeout. Please try again.');
      }
    }, 900000);
  };

  const startCountdownTimer = () => {
    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          stopPolling();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const handleCancel = () => {
    stopPolling();
    setQrData(null);
    setPaymentStatus('idle');
    setError(null);
    onCancel?.();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {!qrData ? (
        <div className="space-y-4">
          <button
            onClick={generateQR}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating...
              </span>
            ) : (
              <>Pay via UPI - ₹{amount.toFixed(2)}</>
            )}
          </button>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
              {error}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold">Scan to Pay</h3>
            <button
              onClick={handleCancel}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col items-center">
            <div className="bg-white p-4 rounded-lg border-2 border-gray-200 mb-6">
              <QRCode value={qrData.qrString} size={256} />
            </div>

            <p className="text-3xl font-bold mb-2">₹{qrData.amount}</p>
            <p className="text-sm text-gray-600 mb-4">
              Transaction ID: {qrData.merchantTranId}
            </p>

            <div className="bg-yellow-50 border border-yellow-200 px-4 py-2 rounded mb-4">
              <p className="text-sm text-yellow-800 font-medium">
                {timeRemaining > 0 ? `Expires in ${formatTime(timeRemaining)}` : 'Expired'}
              </p>
            </div>

            <div className="mb-6">
              {paymentStatus === 'pending' && (
                <div className="flex items-center text-blue-600">
                  <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Waiting for payment...</span>
                </div>
              )}
              {paymentStatus === 'success' && (
                <p className="text-green-600 font-semibold">✓ Payment Successful</p>
              )}
              {paymentStatus === 'failed' && (
                <p className="text-red-600 font-semibold">✕ Payment Failed</p>
              )}
            </div>

            <p className="text-sm text-gray-600 text-center mb-4">
              Scan this QR code with any UPI app<br />
              (Google Pay, PhonePe, Paytm, etc.)
            </p>

            <button
              onClick={handleCancel}
              className="text-gray-600 hover:text-gray-800 underline"
            >
              Cancel Payment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 4. Add Environment Variable

Add to `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

---

## Usage Examples

### Mobile Example (Admin EMI Payment)

```tsx
// In your EMI payment screen
import ICICIUPIPayment from '@/components/payment/ICICIUPIPayment';

function EMIPaymentScreen({ route, navigation }) {
  const { emi, loan } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pay EMI</Text>
      <Text>EMI Amount: ₹{emi.emiPayAmount}</Text>
      <Text>Due Date: {emi.paymentFor}</Text>

      <ICICIUPIPayment
        loanId={loan.id}
        emiId={emi.id}
        amount={parseFloat(emi.emiPayAmount)}
        paymentType="emi"
        onSuccess={(data) => {
          Alert.alert('Success', 'Payment completed successfully!');
          navigation.goBack();
        }}
        onError={(error) => {
          Alert.alert('Error', error);
        }}
      />
    </View>
  );
}
```

### Web Example (Bulk Payment)

```tsx
// In your loan details page
import ICICIUPIPayment from '@/components/payment/ICICIUPIPayment';
import { useAuth } from '@/hooks/useAuth'; // Your auth hook

function LoanPaymentPage({ loanId }) {
  const { token } = useAuth();
  const [amount, setAmount] = useState(0);

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Make Payment</h1>

      <div className="mb-6">
        <label className="block mb-2">Enter Amount</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(parseFloat(e.target.value))}
          className="border px-4 py-2 rounded w-full"
          placeholder="0.00"
        />
      </div>

      {amount > 0 && (
        <ICICIUPIPayment
          loanId={loanId}
          amount={amount}
          paymentType="bulk"
          authToken={token}
          onSuccess={(data) => {
            alert('Payment successful!');
            // Refresh loan details
          }}
          onError={(error) => {
            alert(`Payment failed: ${error}`);
          }}
        />
      )}
    </div>
  );
}
```

---

## Testing

### Mobile Testing

1. Run the mobile app:
```bash
cd kushal-finance-mobile
npm start
```

2. Navigate to payment screen
3. Click "Pay with UPI App" or "Show QR Code"
4. Complete payment in UPI app or scan QR
5. Watch for auto-detection of success

### Web Testing

1. Run the web app:
```bash
cd kushal-finance-static
npm run dev
```

2. Navigate to payment page
3. Click "Pay via UPI"
4. Scan QR with mobile UPI app
5. Watch status update automatically

### Test Checklist

- [ ] QR code generates successfully
- [ ] QR displays correctly
- [ ] UPI intent opens correct app (mobile)
- [ ] Payment status polls automatically
- [ ] Success detected correctly
- [ ] Failure handled properly
- [ ] Timeout works (15 minutes)
- [ ] Cancel works
- [ ] Callbacks execute correctly

---

## Integration Points

### Where to Add Payment Button

#### Mobile Admin App
- **EMI Payment Screen**: Add "Pay via UPI" option
- **Bulk Payment Screen**: Add "Pay via UPI" option
- **Loan Details**: Add quick pay button

#### Web Admin App
- **Payment Modal**: Add UPI payment tab
- **EMI List**: Add "Pay Now" button per EMI
- **Loan Details**: Add "Make Payment" button

### Existing vs New Payment Flow

**Existing (Cash/Manual)**:
```
Select Payment → Enter Amount → Submit → Manual Approval
```

**New (ICICI Gateway)**:
```
Select Payment → Generate QR → User Pays → Auto-Approved ✓
```

Both flows work together seamlessly!

---

## Summary

### ✅ Mobile App - Complete
- API services added
- Payment component created
- Ready to use!

### ⚙️ Web App - Needs Setup
- Install `qrcode.react`
- Create API service
- Create payment component
- Add to payment screens

### 🎯 Next Steps

1. **Install dependencies** on web
2. **Test locally** with ngrok
3. **Integrate into existing payment screens**
4. **Test end-to-end payment flow**
5. **Deploy to UAT** for ICICI testing

---

**Questions?** See [ICICI_PAYMENT_SETUP.md](./ICICI_PAYMENT_SETUP.md) for backend details.

**Last Updated**: December 2024
