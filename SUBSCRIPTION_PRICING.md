# Premium Subscription Pricing System

## Overview

The system now supports both **monthly** and **yearly** premium subscription plans, allowing users to choose their preferred billing cycle with significant savings for yearly subscriptions.

## Environment Configuration

Add these environment variables to your `.env` file:

```env
# Premium Plan Pricing (in paisa for Razorpay)
PREMIUM_PLAN_MONTHLY_PRICE=49900   # ₹499/month
PREMIUM_PLAN_YEARLY_PRICE=499900   # ₹4999/year (save 17%)
```

### Pricing Calculation
- **Monthly**: ₹499/month = ₹5,988/year
- **Yearly**: ₹4,999/year (saves ₹989 or 17%)

## API Usage

### 1. Get Pricing Information

```http
GET /api/payments/pricing
```

**Response:**
```json
{
  "success": true,
  "data": {
    "plans": {
      "free": {
        "name": "Free",
        "price": 0,
        "currency": "INR",
        "duration": "forever",
        "features": {
          "maxApps": 2,
          "maxLicensesPerApp": 30,
          "maxResellers": 1
        }
      },
      "premium_monthly": {
        "name": "Premium Monthly",
        "price": 49900,
        "priceFormatted": "₹499",
        "currency": "INR",
        "duration": "monthly",
        "billingCycle": "1 month",
        "features": {
          "maxApps": "Unlimited",
          "maxLicensesPerApp": "Unlimited",
          "maxResellers": "Unlimited"
        }
      },
      "premium_yearly": {
        "name": "Premium Yearly",
        "price": 499900,
        "priceFormatted": "₹4999",
        "currency": "INR",
        "duration": "yearly",
        "billingCycle": "12 months",
        "monthlyEquivalent": "₹416",
        "savings": {
          "amount": 98900,
          "amountFormatted": "₹989",
          "percentage": 17,
          "description": "Save 17% compared to monthly billing"
        },
        "popular": true
      }
    },
    "comparison": {
      "monthly": {
        "price": 49900,
        "priceFormatted": "₹499/month",
        "yearlyTotal": 598800,
        "yearlyTotalFormatted": "₹5988/year"
      },
      "yearly": {
        "price": 499900,
        "priceFormatted": "₹4999/year",
        "monthlyEquivalent": 41658,
        "monthlyEquivalentFormatted": "₹416/month"
      },
      "savings": {
        "amount": 98900,
        "amountFormatted": "₹989",
        "percentage": 17
      }
    }
  }
}
```

### 2. Create Payment Order (Monthly)

```http
POST /api/payments/razorpay/create-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "planDuration": "monthly"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "orderId": "order_xyz123",
    "amount": 49900,
    "currency": "INR",
    "keyId": "rzp_test_xyz",
    "planDuration": "monthly"
  }
}
```

### 3. Create Payment Order (Yearly)

```http
POST /api/payments/razorpay/create-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "planDuration": "yearly"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "orderId": "order_abc456",
    "amount": 499900,
    "currency": "INR",
    "keyId": "rzp_test_xyz",
    "planDuration": "yearly"
  }
}
```

### 4. Verify Payment

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

## Frontend Integration Example

### React Component Example

```jsx
import { useState } from 'react';

const PricingComponent = () => {
  const [selectedPlan, setSelectedPlan] = useState('yearly');
  const [pricing, setPricing] = useState(null);

  const fetchPricing = async () => {
    const response = await fetch('/api/payments/pricing');
    const data = await response.json();
    setPricing(data.data);
  };

  const createOrder = async (planDuration) => {
    const response = await fetch('/api/payments/razorpay/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ planDuration })
    });
    
    const orderData = await response.json();
    
    // Proceed with Razorpay payment
    const options = {
      key: orderData.data.keyId,
      amount: orderData.data.amount,
      currency: orderData.data.currency,
      order_id: orderData.data.orderId,
      handler: (response) => {
        verifyPayment(response, planDuration);
      }
    };
    
    const razorpay = new Razorpay(options);
    razorpay.open();
  };

  const verifyPayment = async (paymentResponse, planDuration) => {
    await fetch('/api/payments/razorpay/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ...paymentResponse,
        planDuration
      })
    });
  };

  return (
    <div className="pricing-component">
      {pricing && (
        <div className="pricing-cards">
          {/* Monthly Plan */}
          <div className={`pricing-card ${selectedPlan === 'monthly' ? 'selected' : ''}`}>
            <h3>{pricing.plans.premium_monthly.name}</h3>
            <div className="price">
              {pricing.plans.premium_monthly.priceFormatted}
              <span>/month</span>
            </div>
            <button onClick={() => createOrder('monthly')}>
              Choose Monthly
            </button>
          </div>

          {/* Yearly Plan */}
          <div className={`pricing-card ${selectedPlan === 'yearly' ? 'selected' : ''}`}>
            <h3>{pricing.plans.premium_yearly.name}</h3>
            <div className="price">
              {pricing.plans.premium_yearly.priceFormatted}
              <span>/year</span>
            </div>
            <div className="savings">
              Save {pricing.plans.premium_yearly.savings.amountFormatted} 
              ({pricing.plans.premium_yearly.savings.percentage}%)
            </div>
            <div className="monthly-equivalent">
              Only {pricing.plans.premium_yearly.monthlyEquivalent}/month
            </div>
            <button onClick={() => createOrder('yearly')}>
              Choose Yearly
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
```

## Benefits

### 🎯 For Users
- **Flexibility**: Choose between monthly and yearly billing
- **Savings**: 17% discount on yearly subscriptions
- **Transparency**: Clear pricing comparison and savings display
- **Value**: Better long-term pricing for committed users

### 💼 For Business
- **Cash Flow**: Improved cash flow with yearly subscriptions
- **Retention**: Yearly plans increase user commitment
- **Revenue**: Higher annual revenue per user
- **Analytics**: Better tracking of subscription preferences

## Pricing Strategy

### Monthly Plan (₹499/month)
- **Target**: Users who prefer flexibility
- **Use Case**: Trial users, seasonal businesses
- **Revenue**: ₹5,988/year if retained

### Yearly Plan (₹4,999/year)
- **Target**: Committed long-term users
- **Use Case**: Established businesses, cost-conscious users
- **Savings**: 17% discount encourages yearly commitment
- **Revenue**: ₹4,999 upfront, better cash flow

### Discount Calculation
```javascript
const monthlyTotal = 499 * 12; // ₹5,988
const yearlyPrice = 4999;      // ₹4,999
const savings = monthlyTotal - yearlyPrice; // ₹989
const discount = (savings / monthlyTotal) * 100; // 17%
```

## Testing

### Development Mode
```javascript
// Mock payments work with both durations
{
  "planDuration": "monthly",  // Creates mock payment with monthly amount
  "planDuration": "yearly"    // Creates mock payment with yearly amount
}
```

### Production Testing
1. Use Razorpay test cards for both monthly and yearly plans
2. Verify correct amounts are charged
3. Check payment records store correct duration
4. Test savings calculations in pricing endpoint

This comprehensive pricing system provides flexibility for users while maximizing revenue potential for the business! 🎉