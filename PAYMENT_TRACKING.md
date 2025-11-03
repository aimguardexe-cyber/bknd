# Payment Tracking System Documentation

## Overview

The payment tracking system stores all payment details in MongoDB for comprehensive tracking, analytics, and management. This includes successful payments, failed attempts, refunds, and detailed transaction metadata.

## Features

### ✅ Payment Storage
- Complete payment details stored in MongoDB
- Card information (last4, network, issuer)
- Payment method tracking (card, UPI, netbanking, wallet)
- Transaction metadata and notes
- User agent and IP address logging

### ✅ Payment Analytics
- Payment success rate calculations
- Revenue analytics by time period
- Payment method breakdown
- Plan type analytics
- User-specific payment statistics

### ✅ Payment History
- Paginated payment history
- Detailed transaction views
- Search and filter capabilities
- Export-ready data format

### ✅ Webhook Integration
- Real-time payment status updates
- Automatic refund processing
- Failed payment tracking
- Secure webhook verification

### ✅ Refund Management
- Full and partial refund support
- Refund reason tracking
- Automatic payment record updates
- Refund history maintenance

## Database Schema

### Payment Model Fields

```javascript
{
  user: ObjectId,                    // Reference to User
  razorpayPaymentId: String,         // Unique payment ID from Razorpay
  razorpayOrderId: String,           // Order ID from Razorpay
  razorpaySignature: String,         // Payment signature (secured)
  amount: Number,                    // Amount in paisa
  currency: String,                  // Currency (INR)
  status: String,                    // Payment status
  method: String,                    // Payment method
  planType: String,                  // Plan purchased
  planDuration: String,              // Plan duration
  paymentDetails: {                  // Detailed payment info
    card: { last4, network, issuer },
    bank: String,
    wallet: String,
    vpa: String,
    email: String,
    contact: String,
    fee: Number,
    tax: Number
  },
  refunds: [{                        // Refund history
    refundId: String,
    amount: Number,
    reason: String,
    status: String,
    createdAt: Date
  }],
  isVerified: Boolean,               // Verification status
  isMockPayment: Boolean,            // Development flag
  ipAddress: String,                 // User IP
  userAgent: String,                 // User agent
  createdAt: Date,                   // Payment creation time
  updatedAt: Date                    // Last update time
}
```

## API Endpoints

### 1. Create Payment Order
```http
POST /api/payments/razorpay/create-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "planDuration": "monthly"  // or "yearly"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "orderId": "order_xyz123",
    "amount": 99900,
    "currency": "INR",
    "keyId": "rzp_test_xyz",
    "planDuration": "monthly"
  }
}
```

### 2. Verify Payment
```http
POST /api/payments/razorpay/verify
Authorization: Bearer <token>
Content-Type: application/json

{
  "razorpay_order_id": "order_xyz123",
  "razorpay_payment_id": "pay_abc456",
  "razorpay_signature": "signature_hash",
  "planDuration": "monthly"  // Must match the order creation
}
```
```http
GET /api/payments/history?page=1&limit=10
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "id": "payment_id",
        "razorpayPaymentId": "pay_xyz123",
        "amount": 99900,
        "amountInRupees": 999,
        "currency": "INR",
        "status": "captured",
        "method": "card",
        "planType": "premium",
        "createdAt": "2024-01-15T10:30:00Z",
        "last4": "1111",
        "network": "Visa"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalPayments": 50
    },
    "stats": {
      "totalAmount": 4995000,
      "totalAmountInRupees": 49950,
      "totalPayments": 50,
      "avgAmount": 99900,
      "lastPayment": "2024-01-15T10:30:00Z"
    }
  }
}
```

### 2. Get Payment Analytics
```http
GET /api/payments/analytics?period=30d
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "analytics": {
      "totalPayments": 15,
      "totalAmount": 1498500,
      "totalAmountInRupees": 14985,
      "avgAmount": 99900,
      "avgAmountInRupees": 999,
      "paymentMethods": {
        "card": 10,
        "upi": 3,
        "netbanking": 2
      },
      "planTypes": {
        "premium": 15
      },
      "successRate": "94.67",
      "totalAttempts": 16
    }
  }
}
```

### 3. Get Payment Details
```http
GET /api/payments/payment_id_here
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "payment": {
      "id": "payment_id",
      "razorpayPaymentId": "pay_xyz123",
      "razorpayOrderId": "order_abc456",
      "amount": 99900,
      "amountInRupees": 999,
      "currency": "INR",
      "status": "captured",
      "method": "card",
      "planType": "premium",
      "planDuration": "yearly",
      "description": "Premium plan subscription",
      "paymentDetails": {
        "card": {
          "last4": "1111",
          "network": "Visa",
          "type": "credit",
          "issuer": "HDFC"
        },
        "email": "user@example.com",
        "contact": "+919876543210",
        "fee": 2357,
        "tax": 425
      },
      "isVerified": true,
      "verifiedAt": "2024-01-15T10:30:15Z",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

### 4. Process Refund
```http
POST /api/payments/payment_id_here/refund
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 99900,
  "reason": "Customer requested refund"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Refund processed successfully",
  "data": {
    "refund": {
      "id": "rfnd_xyz789",
      "amount": 99900,
      "amountInRupees": 999,
      "currency": "INR",
      "status": "processed",
      "reason": "Customer requested refund"
    }
  }
}
```

### 5. Webhook Handler
```http
POST /api/payments/webhook
X-Razorpay-Signature: webhook_signature
Content-Type: application/json

{
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_xyz123",
        "status": "captured",
        "amount": 99900,
        "method": "card"
      }
    }
  }
}
```

## Setup Instructions

### 1. Environment Variables

Add these to your `.env` file:

```env
# Existing Razorpay config
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# New webhook secret (get from Razorpay dashboard)
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
```

### 2. Webhook Configuration

1. Login to your Razorpay Dashboard
2. Go to Settings > Webhooks
3. Create a new webhook with URL: `https://yourdomain.com/api/payments/webhook`
4. Select these events:
   - `payment.captured`
   - `payment.failed`
   - `refund.processed`
5. Copy the webhook secret to your `.env` file

### 3. Testing Payment Tracking

#### Development Mode (Mock Payments)
```javascript
// Payments are automatically stored even in development mode
// Mock payments have isMockPayment: true flag
```

#### Production Mode
```javascript
// Real Razorpay payments are processed and stored
// Webhook updates payment status in real-time
```

## Benefits

### 🎯 Complete Audit Trail
- Every payment attempt is logged
- Failed payments are tracked with error details
- Refunds are automatically recorded
- User actions are logged with IP and user agent

### 📊 Business Intelligence
- Revenue analytics and trends
- Payment method preferences
- Success rate monitoring
- Customer payment behavior analysis

### 🔒 Security & Compliance
- Sensitive data is properly secured
- PCI compliance considerations
- Audit logs for financial reconciliation
- Secure webhook verification

### 💼 Customer Support
- Detailed payment history for customer queries
- Quick refund processing
- Payment method tracking
- Transaction troubleshooting data

## Advanced Usage

### Custom Analytics Queries

```javascript
// Get payment statistics for a specific user
const stats = await Payment.getUserPaymentStats(userId);

// Get system-wide analytics for date range
const analytics = await Payment.getPaymentAnalytics(
  new Date('2024-01-01'),
  new Date('2024-01-31')
);

// Find payments by method
const cardPayments = await Payment.find({ method: 'card' });

// Get failed payments for investigation
const failedPayments = await Payment.find({ status: 'failed' });
```

### Export Payment Data

```javascript
// Export for accounting/reconciliation
app.get('/admin/payments/export', async (req, res) => {
  const payments = await Payment.find({
    status: 'captured',
    createdAt: { $gte: startDate, $lte: endDate }
  }).populate('user', 'name email');
  
  // Convert to CSV/Excel format
  res.csv(payments);
});
```

This comprehensive payment tracking system ensures you have complete visibility into your payment operations while maintaining security and providing valuable business insights.