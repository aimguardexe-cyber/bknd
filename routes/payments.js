const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');
const Payment = require('../models/Payment');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Check if we're in development with mock credentials
const isDevelopmentMode = process.env.NODE_ENV === 'development' && 
  (process.env.RAZORPAY_KEY_ID === 'your_razorpay_key_id' || !process.env.RAZORPAY_KEY_ID);

// Coupon discount function
const getCouponDiscount = (couponCode) => {
  // Define valid coupon codes and their discounts
  const validCoupons = {
    'SAVE10': 10,     // 10% off
    'SAVE20': 20,     // 20% off
    'SAVE25': 25,     // 25% off
    'WELCOME': 15,    // 15% off
    'LAUNCH': 30      // 30% off
  };
  
  // Return discount percentage if coupon is valid, otherwise 0
  return validCoupons[couponCode?.toUpperCase()] || 0;
};

// @desc    Create Razorpay order for premium upgrade
// @route   POST /payments/razorpay/create-order
// @access  Private
router.post('/razorpay/create-order',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { planDuration = 'monthly', couponCode } = req.body; // Get plan duration and coupon code from request body

    // Validate plan duration
    if (!['monthly', 'yearly'].includes(planDuration)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan duration. Must be "monthly" or "yearly"'
      });
    }

    // Check if user is already premium
    if (req.user.plan === 'premium') {
      return res.status(400).json({
        success: false,
        message: 'You already have a premium plan'
      });
    }

    // Get premium plan price based on duration (in paisa)
    let monthlyPrice = parseInt(process.env.PREMIUM_PLAN_MONTHLY_PRICE) || 49900; // Default ₹499/month
    let yearlyPrice = parseInt(process.env.PREMIUM_PLAN_YEARLY_PRICE) || 499900; // Default ₹4999/year
    
    // Apply coupon discount if provided
    if (couponCode) {
      const discount = getCouponDiscount(couponCode);
      if (discount > 0) {
        monthlyPrice = Math.max(0, monthlyPrice - (monthlyPrice * discount / 100));
        yearlyPrice = Math.max(0, yearlyPrice - (yearlyPrice * discount / 100));
      }
    }
    
    const amount = planDuration === 'yearly' ? yearlyPrice : monthlyPrice;

    try {
      // Development mode - return mock order
      if (isDevelopmentMode) {
        const mockOrder = {
          id: `order_mock_${Date.now()}`,
          amount,
          currency: 'INR',
          receipt: `mock_${Date.now()}`,
          status: 'created',
          notes: {
            userId: userId.toString(),
            planType: 'premium',
            planDuration: planDuration,
            upgradeType: 'free_to_premium',
            ...(couponCode && { couponCode: couponCode.toUpperCase() })
          }
        };

        return res.status(200).json({
          success: true,
          message: 'Mock order created successfully (Development Mode)',
          data: {
            orderId: mockOrder.id,
            amount: mockOrder.amount,
            currency: mockOrder.currency,
            keyId: 'mock_key_id',
            isDevelopmentMode: true,
            planDuration: planDuration,
            ...(couponCode && { couponCode: couponCode.toUpperCase() })
          }
        });
      }

      // Production mode - create real Razorpay order
      const order = await razorpay.orders.create({
        amount, // Amount in paisa
        currency: 'INR',
        receipt: `prem_${Date.now()}`,
        notes: {
          userId: userId.toString(),
          planType: 'premium',
          planDuration: planDuration,
          upgradeType: 'free_to_premium',
          ...(couponCode && { couponCode: couponCode.toUpperCase() })
        }
      });

      res.status(200).json({
        success: true,
        message: 'Order created successfully',
        data: {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          keyId: process.env.RAZORPAY_KEY_ID,
          planDuration: planDuration,
          ...(couponCode && { couponCode: couponCode.toUpperCase() })
        }
      });
    } catch (error) {
      console.error('Razorpay order creation error:', error);
      
      // Provide more specific error messages based on error type
      let errorMessage = 'Failed to create payment order';
      if (error.statusCode === 400) {
        errorMessage = error.error?.description || 'Invalid payment request';
      } else if (error.statusCode === 401) {
        errorMessage = 'Payment gateway authentication failed';
      }
      
      res.status(500).json({
        success: false,
        message: errorMessage
      });
    }
  })
);

// @desc    Verify Razorpay payment and upgrade user to premium
// @route   POST /payments/razorpay/verify
// @access  Private
router.post('/razorpay/verify',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature 
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment verification data'
      });
    }

    try {
      // Handle mock payments in development mode
      if (isDevelopmentMode || razorpay_order_id.startsWith('order_mock_')) {
        console.log('Processing mock payment verification');
        
        // For mock payments, we need to get the plan duration from request body
        // since the mock order doesn't persist in Razorpay
        const { planDuration = 'monthly' } = req.body;
        
        // Get the correct amount based on plan duration
        const monthlyPrice = parseInt(process.env.PREMIUM_PLAN_MONTHLY_PRICE) || 49900;
        const yearlyPrice = parseInt(process.env.PREMIUM_PLAN_YEARLY_PRICE) || 499900;
        const amount = planDuration === 'yearly' ? yearlyPrice : monthlyPrice;
        
        // Create mock payment record in database
        const mockPayment = new Payment({
          user: req.user._id,
          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          razorpaySignature: razorpay_signature,
          amount: amount,
          currency: 'INR',
          status: 'captured',
          method: 'mock',
          planType: 'premium',
          planDuration: planDuration, // Use the correct plan duration
          description: `Mock payment for ${planDuration} premium plan${order.notes?.couponCode ? ` with coupon ${order.notes.couponCode}` : ''}`,
          razorpayCreatedAt: new Date(),
          isVerified: true,
          verifiedAt: new Date(),
          isMockPayment: true,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          paymentDetails: {
            email: req.user.email,
            contact: 'mock_contact'
          },
          notes: {
            planType: 'premium',
            planDuration: planDuration,
            upgradeType: 'free_to_premium',
            environment: 'development',
            ...(order.notes?.couponCode && { couponCode: order.notes.couponCode })
          }
        });
        
        await mockPayment.save();
        
        // Upgrade user to premium (mock)
        const user = await User.findByIdAndUpdate(
          req.user._id,
          {
            plan: 'premium',
            paymentStatus: 'paid',
            maxApps: -1,
            maxResellers: -1,
            maxLicensesPerApp: -1
          },
          { new: true }
        );

        return res.status(200).json({
          success: true,
          message: 'Mock payment verified successfully. Welcome to premium!',
          data: {
            user: user.toJSON(),
            payment: {
              id: mockPayment.razorpayPaymentId,
              amount: mockPayment.amount,
              currency: mockPayment.currency,
              status: mockPayment.status,
              method: mockPayment.method,
              planDuration: mockPayment.planDuration,
              createdAt: mockPayment.razorpayCreatedAt,
              paymentId: mockPayment._id
            }
          }
        });
      }

      // Real payment verification
      // Create signature for verification
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      // Verify signature
      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment signature'
        });
      }

      // Fetch payment details from Razorpay
      const payment = await razorpay.payments.fetch(razorpay_payment_id);

      if (payment.status !== 'captured') {
        return res.status(400).json({
          success: false,
          message: 'Payment not completed'
        });
      }

      // Verify order belongs to the user
      const order = await razorpay.orders.fetch(razorpay_order_id);
      if (order.notes.userId !== req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed - user mismatch'
        });
      }

      // Create payment record in database
      const paymentRecord = new Payment({
        user: req.user._id,
        razorpayPaymentId: payment.id,
        razorpayOrderId: payment.order_id,
        razorpaySignature: razorpay_signature,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        planType: order.notes.planType || 'premium',
        planDuration: order.notes.planDuration || 'monthly',
        description: `${order.notes.planType || 'Premium'} plan subscription${order.notes?.couponCode ? ` with coupon ${order.notes.couponCode}` : ''}`,
        razorpayCreatedAt: new Date(payment.created_at * 1000),
        isVerified: true,
        verifiedAt: new Date(),
        isMockPayment: false,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        paymentDetails: {
          email: payment.email,
          contact: payment.contact,
          fee: payment.fee,
          tax: payment.tax,
          acquirer_data: payment.acquirer_data,
          // Card details (if available)
          ...(payment.card && {
            card: {
              id: payment.card.id,
              entity: payment.card.entity,
              name: payment.card.name,
              last4: payment.card.last4,
              network: payment.card.network,
              type: payment.card.type,
              issuer: payment.card.issuer,
              international: payment.card.international,
              emi: payment.card.emi
            }
          }),
          // Bank details (if available)
          ...(payment.bank && { bank: payment.bank }),
          ...(payment.wallet && { wallet: payment.wallet }),
          ...(payment.vpa && { vpa: payment.vpa })
        },
        notes: {
          ...order.notes,
          razorpayOrderNotes: order.notes,
          razorpayPaymentNotes: payment.notes || {},
          ...(order.notes?.couponCode && { couponCode: order.notes.couponCode })
        }
      });
      
      await paymentRecord.save();

      // Upgrade user to premium
      const user = await User.findByIdAndUpdate(
        req.user._id,
        {
          plan: 'premium',
          paymentStatus: 'paid',
          maxApps: -1,
          maxResellers: -1,
          maxLicensesPerApp: -1
        },
        { new: true }
      );

      res.status(200).json({
        success: true,
        message: 'Payment verified successfully. Welcome to premium!',
        data: {
          user: user.toJSON(),
          payment: {
            id: payment.id,
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            method: payment.method,
            createdAt: new Date(payment.created_at * 1000),
            paymentId: paymentRecord._id,
            last4: payment.card?.last4,
            network: payment.card?.network
          }
        }
      });

    } catch (error) {
      console.error('Payment verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Payment verification failed'
      });
    }
  })
);

// @desc    Get payment history
// @route   GET /payments/history
// @access  Private
router.get('/history',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    try {
      // Fetch payments from database with pagination
      const payments = await Payment.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-razorpaySignature') // Exclude sensitive data
        .lean();

      // Get total count for pagination
      const totalPayments = await Payment.countDocuments({ user: userId });
      const totalPages = Math.ceil(totalPayments / limit);

      // Format payments for response
      const formattedPayments = payments.map(payment => ({
        id: payment._id,
        razorpayPaymentId: payment.razorpayPaymentId,
        orderId: payment.razorpayOrderId,
        amount: payment.amount,
        amountInRupees: payment.amount / 100,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        planType: payment.planType,
        planDuration: payment.planDuration,
        description: payment.description,
        createdAt: payment.createdAt,
        razorpayCreatedAt: payment.razorpayCreatedAt,
        isVerified: payment.isVerified,
        isMockPayment: payment.isMockPayment,
        // Include card last4 if available for reference
        last4: payment.paymentDetails?.card?.last4,
        network: payment.paymentDetails?.card?.network,
        bank: payment.paymentDetails?.bank,
        wallet: payment.paymentDetails?.wallet
      }));

      // Get payment statistics
      const stats = await Payment.getUserPaymentStats(userId);

      res.status(200).json({
        success: true,
        data: {
          payments: formattedPayments,
          pagination: {
            currentPage: page,
            totalPages,
            totalPayments,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          },
          stats: {
            totalAmount: stats.totalAmount,
            totalAmountInRupees: stats.totalAmount / 100,
            totalPayments: stats.totalPayments,
            avgAmount: stats.avgAmount,
            avgAmountInRupees: stats.avgAmount / 100,
            lastPayment: stats.lastPayment
          }
        }
      });

    } catch (error) {
      console.error('Payment history fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment history'
      });
    }
  })
);

// @desc    Get payment analytics
// @route   GET /payments/analytics
// @access  Private
router.get('/analytics',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { startDate, endDate, period = '30d' } = req.query;

    try {
      // Calculate date range
      let start, end;
      if (startDate && endDate) {
        start = new Date(startDate);
        end = new Date(endDate);
      } else {
        // Default to last 30 days
        end = new Date();
        const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
        start = new Date(end.getTime() - (days * 24 * 60 * 60 * 1000));
      }

      // Get payment analytics for user
      const userPayments = await Payment.find({
        user: userId,
        createdAt: { $gte: start, $lte: end },
        status: 'captured'
      }).sort({ createdAt: -1 });

      // Calculate analytics
      const analytics = {
        totalPayments: userPayments.length,
        totalAmount: userPayments.reduce((sum, p) => sum + p.amount, 0),
        avgAmount: userPayments.length > 0 ? 
          userPayments.reduce((sum, p) => sum + p.amount, 0) / userPayments.length : 0,
        
        // Payment method breakdown
        paymentMethods: userPayments.reduce((acc, p) => {
          acc[p.method] = (acc[p.method] || 0) + 1;
          return acc;
        }, {}),
        
        // Plan type breakdown
        planTypes: userPayments.reduce((acc, p) => {
          acc[p.planType] = (acc[p.planType] || 0) + 1;
          return acc;
        }, {}),
        
        // Monthly breakdown
        monthlyData: {},
        
        // Success rate
        totalAttempts: await Payment.countDocuments({
          user: userId,
          createdAt: { $gte: start, $lte: end }
        }),
        
        period: { start, end }
      };

      // Calculate success rate
      analytics.successRate = analytics.totalAttempts > 0 ? 
        (analytics.totalPayments / analytics.totalAttempts * 100).toFixed(2) : 0;

      res.status(200).json({
        success: true,
        data: {
          analytics: {
            ...analytics,
            totalAmountInRupees: analytics.totalAmount / 100,
            avgAmountInRupees: analytics.avgAmount / 100
          }
        }
      });

    } catch (error) {
      console.error('Payment analytics fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment analytics'
      });
    }
  })
);

// @desc    Get pricing information
// @route   GET /payments/pricing
// @access  Public
router.get('/pricing',
  asyncHandler(async (req, res) => {
    const premiumPrice = parseInt(process.env.PREMIUM_PLAN_PRICE) || 99900;

    res.status(200).json({
      success: true,
      data: {
        plans: {
          free: {
            name: 'Free',
            price: 0,
            currency: 'INR',
            features: {
              maxApps: 2,
              maxLicensesPerApp: 30,
              maxResellers: 1,
              customErrorMessages: true,
              hwidLock: true,
              licenseManagement: true
            }
          },
          premium: {
            name: 'Premium',
            price: premiumPrice,
            priceFormatted: `₹${(premiumPrice / 100).toFixed(2)}`,
            currency: 'INR',
            features: {
              maxApps: 'Unlimited',
              maxLicensesPerApp: 'Unlimited',
              maxResellers: 'Unlimited',
              customErrorMessages: true,
              hwidLock: true,
              licenseManagement: true,
              prioritySupport: true,
              advancedAnalytics: true
            }
          }
        }
      }
    });
  })
);
router.get('/pricing',
  asyncHandler(async (req, res) => {
    const monthlyPrice = parseInt(process.env.PREMIUM_PLAN_MONTHLY_PRICE) || 49900; // ₹499/month
    const yearlyPrice = parseInt(process.env.PREMIUM_PLAN_YEARLY_PRICE) || 499900; // ₹4999/year
    
    // Calculate yearly savings
    const monthlyYearlyEquivalent = monthlyPrice * 12;
    const yearlySavings = monthlyYearlyEquivalent - yearlyPrice;
    const yearlySavingsPercentage = Math.round((yearlySavings / monthlyYearlyEquivalent) * 100);

    res.status(200).json({
      success: true,
      data: {
        plans: {
          free: {
            name: 'Free',
            price: 0,
            currency: 'INR',
            duration: 'forever',
            features: {
              maxApps: 2,
              maxLicensesPerApp: 30,
              maxResellers: 1,
              customErrorMessages: true,
              hwidLock: true,
              licenseManagement: true
            }
          },
          premium_monthly: {
            name: 'Premium Monthly',
            price: monthlyPrice,
            priceFormatted: `₹${(monthlyPrice / 100).toFixed(0)}`,
            currency: 'INR',
            duration: 'monthly',
            billingCycle: '1 month',
            features: {
              maxApps: 'Unlimited',
              maxLicensesPerApp: 'Unlimited',
              maxResellers: 'Unlimited',
              customErrorMessages: true,
              hwidLock: true,
              licenseManagement: true,
              prioritySupport: true,
              advancedAnalytics: true
            }
          },
          premium_yearly: {
            name: 'Premium Yearly',
            price: yearlyPrice,
            priceFormatted: `₹${(yearlyPrice / 100).toFixed(0)}`,
            currency: 'INR',
            duration: 'yearly',
            billingCycle: '12 months',
            monthlyEquivalent: `₹${Math.round(yearlyPrice / 12 / 100)}`,
            savings: {
              amount: yearlySavings,
              amountFormatted: `₹${(yearlySavings / 100).toFixed(0)}`,
              percentage: yearlySavingsPercentage,
              description: `Save ${yearlySavingsPercentage}% compared to monthly billing`
            },
            popular: true, // Mark yearly as popular option
            features: {
              maxApps: 'Unlimited',
              maxLicensesPerApp: 'Unlimited',
              maxResellers: 'Unlimited',
              customErrorMessages: true,
              hwidLock: true,
              licenseManagement: true,
              prioritySupport: true,
              advancedAnalytics: true
            }
          }
        },
        comparison: {
          monthly: {
            price: monthlyPrice,
            priceFormatted: `₹${(monthlyPrice / 100).toFixed(0)}/month`,
            yearlyTotal: monthlyYearlyEquivalent,
            yearlyTotalFormatted: `₹${(monthlyYearlyEquivalent / 100).toFixed(0)}/year`
          },
          yearly: {
            price: yearlyPrice,
            priceFormatted: `₹${(yearlyPrice / 100).toFixed(0)}/year`,
            monthlyEquivalent: Math.round(yearlyPrice / 12),
            monthlyEquivalentFormatted: `₹${Math.round(yearlyPrice / 12 / 100)}/month`
          },
          savings: {
            amount: yearlySavings,
            amountFormatted: `₹${(yearlySavings / 100).toFixed(0)}`,
            percentage: yearlySavingsPercentage
          }
        }
      }
    });
  })
);

// @desc    Validate coupon code
// @route   POST /payments/validate-coupon
// @access  Private
router.post('/validate-coupon',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { couponCode } = req.body;
    
    if (!couponCode) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code is required'
      });
    }
    
    const discount = getCouponDiscount(couponCode);
    
    if (discount > 0) {
      res.status(200).json({
        success: true,
        message: `Coupon applied successfully! ${discount}% discount`,
        data: {
          discount: discount,
          couponCode: couponCode.toUpperCase()
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid coupon code'
      });
    }
  })
);

// @desc    Cancel subscription (downgrade to free)
// @route   POST /payments/cancel-subscription
// @access  Private
router.post('/cancel-subscription',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;

    if (req.user.plan === 'free') {
      return res.status(400).json({
        success: false,
        message: 'You are already on the free plan'
      });
    }

    // Check if user has apps that exceed free plan limits
    const userAppsCount = req.user.apps.length;
    if (userAppsCount > 2) {
      return res.status(400).json({
        success: false,
        message: `You have ${userAppsCount} apps. Please delete ${userAppsCount - 2} apps before downgrading to free plan.`
      });
    }

    // TODO: Add more checks for licenses and resellers if needed

    // Downgrade user to free
    const user = await User.findByIdAndUpdate(
      userId,
      {
        plan: 'free',
        paymentStatus: 'unpaid',
        maxApps: 2,
        maxResellers: 1,
        maxLicensesPerApp: 30
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Successfully downgraded to free plan',
      data: {
        user: user.toJSON()
      }
    });
  })
);

// @desc    Razorpay webhook handler
// @route   POST /payments/webhook
// @access  Public (but secured with webhook signature)
router.post('/webhook',
  asyncHandler(async (req, res) => {
    const webhookSignature = req.get('X-Razorpay-Signature');
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.warn('Razorpay webhook secret not configured');
      return res.status(200).json({ received: true });
    }

    try {
      // Verify webhook signature
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (webhookSignature !== expectedSignature) {
        console.error('Invalid webhook signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }

      const { event, payload } = req.body;
      
      console.log(`Received webhook: ${event}`);

      switch (event) {
        case 'payment.captured':
          await handlePaymentCaptured(payload.payment.entity);
          break;
          
        case 'payment.failed':
          await handlePaymentFailed(payload.payment.entity);
          break;
          
        case 'refund.processed':
          await handleRefundProcessed(payload.refund.entity);
          break;
          
        default:
          console.log(`Unhandled webhook event: ${event}`);
      }

      res.status(200).json({ received: true });

    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  })
);

// @desc    Get detailed payment information
// @route   GET /payments/:paymentId
// @access  Private
router.get('/:paymentId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { paymentId } = req.params;
    const userId = req.user._id;

    try {
      // Fetch payment details
      const payment = await Payment.findOne({
        _id: paymentId,
        user: userId
      }).select('-razorpaySignature'); // Exclude sensitive signature

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          payment: {
            ...payment.toJSON(),
            amountInRupees: payment.amount / 100
          }
        }
      });

    } catch (error) {
      console.error('Payment details fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment details'
      });
    }
  })
);

// @desc    Process refund
// @route   POST /payments/:paymentId/refund
// @access  Private (Admin only - you may want to add admin middleware)
router.post('/:paymentId/refund',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { paymentId } = req.params;
    const { amount, reason = 'Refund requested' } = req.body;

    try {
      // Find the payment record
      const payment = await Payment.findById(paymentId);
      
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      if (payment.status !== 'captured') {
        return res.status(400).json({
          success: false,
          message: 'Payment not eligible for refund'
        });
      }

      // Process refund with Razorpay (skip for mock payments)
      let refundData;
      if (!payment.isMockPayment) {
        refundData = await razorpay.payments.refund(payment.razorpayPaymentId, {
          amount: amount || payment.amount, // Partial or full refund
          notes: {
            reason,
            requestedBy: req.user._id.toString(),
            originalPaymentId: payment._id.toString()
          }
        });
      } else {
        // Mock refund for development
        refundData = {
          id: `rfnd_mock_${Date.now()}`,
          amount: amount || payment.amount,
          currency: payment.currency,
          status: 'processed',
          created_at: Math.floor(Date.now() / 1000),
          notes: { reason }
        };
      }

      // Add refund to payment record
      await payment.addRefund(refundData);

      res.status(200).json({
        success: true,
        message: 'Refund processed successfully',
        data: {
          refund: {
            id: refundData.id,
            amount: refundData.amount,
            amountInRupees: refundData.amount / 100,
            currency: refundData.currency,
            status: refundData.status,
            reason
          }
        }
      });

    } catch (error) {
      console.error('Refund processing error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process refund'
      });
    }
  })
);

// Helper function to handle payment captured webhook
async function handlePaymentCaptured(paymentData) {
  try {
    const payment = await Payment.findOne({ 
      razorpayPaymentId: paymentData.id 
    });
    
    if (payment && payment.status !== 'captured') {
      payment.status = 'captured';
      payment.paymentDetails = {
        ...payment.paymentDetails,
        ...paymentData
      };
      await payment.save();
      console.log(`Payment ${paymentData.id} marked as captured`);
    }
  } catch (error) {
    console.error('Error handling payment captured:', error);
  }
}

// Helper function to handle payment failed webhook
async function handlePaymentFailed(paymentData) {
  try {
    const payment = await Payment.findOne({ 
      razorpayPaymentId: paymentData.id 
    });
    
    if (payment) {
      payment.status = 'failed';
      payment.paymentDetails = {
        ...payment.paymentDetails,
        error_code: paymentData.error_code,
        error_description: paymentData.error_description
      };
      await payment.save();
      console.log(`Payment ${paymentData.id} marked as failed`);
    }
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

// Helper function to handle refund processed webhook
async function handleRefundProcessed(refundData) {
  try {
    const payment = await Payment.findOne({ 
      razorpayPaymentId: refundData.payment_id 
    });
    
    if (payment) {
      await payment.addRefund(refundData);
      console.log(`Refund ${refundData.id} processed for payment ${refundData.payment_id}`);
    }
  } catch (error) {
    console.error('Error handling refund processed:', error);
  }
}

module.exports = router;