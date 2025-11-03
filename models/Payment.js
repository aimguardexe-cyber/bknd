const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // User who made the payment
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Razorpay payment details
  razorpayPaymentId: {
    type: String,
    required: true,
    unique: true
  },
  razorpayOrderId: {
    type: String,
    required: true
  },
  razorpaySignature: {
    type: String,
    required: true
  },
  
  // Payment amount details
  amount: {
    type: Number,
    required: true // Amount in paisa
  },
  currency: {
    type: String,
    default: 'INR'
  },
  
  // Payment status and method
  status: {
    type: String,
    enum: ['created', 'authorized', 'captured', 'refunded', 'failed'],
    required: true
  },
  method: {
    type: String, // card, netbanking, wallet, upi, etc.
    required: true
  },
  
  // Plan details
  planType: {
    type: String,
    enum: ['free', 'premium'],
    default: 'premium'
  },
  planDuration: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: 'yearly'
  },
  
  // Additional payment information from Razorpay
  paymentDetails: {
    // Card details (if applicable)
    card: {
      id: String,
      entity: String,
      name: String,
      last4: String,
      network: String,
      type: String,
      issuer: String,
      international: Boolean,
      emi: Boolean
    },
    
    // Bank details (if applicable)
    bank: String,
    wallet: String,
    vpa: String, // for UPI
    
    // Additional metadata
    email: String,
    contact: String,
    fee: Number,
    tax: Number,
    acquirer_data: mongoose.Schema.Types.Mixed
  },
  
  // Transaction metadata
  description: String,
  notes: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Refund information
  refunds: [{
    refundId: String,
    amount: Number,
    currency: String,
    status: String,
    reason: String,
    createdAt: Date,
    notes: mongoose.Schema.Types.Mixed
  }],
  
  // Timestamps from Razorpay
  razorpayCreatedAt: {
    type: Date,
    required: true
  },
  
  // Verification status
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedAt: Date,
  
  // Mock payment flag for development
  isMockPayment: {
    type: Boolean,
    default: false
  },
  
  // Additional tracking
  ipAddress: String,
  userAgent: String,
  
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Indexes for better query performance
paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ razorpayPaymentId: 1 });
paymentSchema.index({ razorpayOrderId: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ planType: 1 });

// Virtual for amount in rupees
paymentSchema.virtual('amountInRupees').get(function() {
  return this.amount / 100;
});

// Method to add refund
paymentSchema.methods.addRefund = function(refundData) {
  this.refunds.push({
    refundId: refundData.id,
    amount: refundData.amount,
    currency: refundData.currency,
    status: refundData.status,
    reason: refundData.notes?.reason || 'Refund requested',
    createdAt: new Date(refundData.created_at * 1000),
    notes: refundData.notes || {}
  });
  return this.save();
};

// Static method to get user payment stats
paymentSchema.statics.getUserPaymentStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { user: mongoose.Types.ObjectId(userId), status: 'captured' } },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        totalPayments: { $sum: 1 },
        avgAmount: { $avg: '$amount' },
        lastPayment: { $max: '$createdAt' }
      }
    }
  ]);
  
  return stats[0] || {
    totalAmount: 0,
    totalPayments: 0,
    avgAmount: 0,
    lastPayment: null
  };
};

// Static method to get payment analytics
paymentSchema.statics.getPaymentAnalytics = async function(startDate, endDate) {
  const pipeline = [
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'captured'
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        totalAmount: { $sum: '$amount' },
        totalPayments: { $sum: 1 },
        uniqueUsers: { $addToSet: '$user' }
      }
    },
    {
      $project: {
        date: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day'
          }
        },
        totalAmount: 1,
        totalPayments: 1,
        uniqueUsers: { $size: '$uniqueUsers' }
      }
    },
    { $sort: { date: 1 } }
  ];
  
  return this.aggregate(pipeline);
};

// Transform output
paymentSchema.methods.toJSON = function() {
  const obj = this.toObject({ virtuals: true });
  
  // Don't expose sensitive signature in API responses by default
  if (obj.razorpaySignature) {
    obj.razorpaySignature = '***';
  }
  
  return obj;
};

module.exports = mongoose.model('Payment', paymentSchema);