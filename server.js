require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const appRoutes = require('./routes/apps');
const licenseRoutes = require('./routes/licenses');
const resellerRoutes = require('./routes/resellers');
const clientRoutes = require('./routes/clients');
const paymentRoutes = require('./routes/payments');

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies



// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'License Management System API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/apps', appRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/resellers', resellerRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/payments', paymentRoutes);

// API documentation endpoint
app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'License Management & Reseller System API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Register a new user',
        'POST /api/auth/login': 'Login user',
        'GET /api/auth/profile': 'Get user profile'
      },
      apps: {
        'POST /api/apps': 'Create new app',
        'GET /api/apps': 'Get user apps',
        'GET /api/apps/:id': 'Get single app',
        'PUT /api/apps/:id': 'Update app',
        'DELETE /api/apps/:id': 'Delete app',
        'GET /api/apps/:id/error-messages': 'Get app error messages',
        'PUT /api/apps/:id/error-messages': 'Update app error messages',
        'GET /api/apps/:id/stats': 'Get app statistics'
      },
      licenses: {
        'POST /api/licenses': 'Create new license',
        'GET /api/licenses': 'Get licenses',
        'GET /api/licenses/:id': 'Get single license',
        'PUT /api/licenses/:id': 'Update license',
        'DELETE /api/licenses/:id': 'Delete license',
        'DELETE /api/licenses': 'Delete all licenses (with optional app filter)',
        'PATCH /api/licenses/:id/toggle-ban': 'Ban/unban license'
      },
      resellers: {
        'POST /api/resellers': 'Create new reseller',
        'GET /api/resellers': 'Get resellers',
        'GET /api/resellers/:id': 'Get single reseller',
        'PUT /api/resellers/:id': 'Update reseller',
        'DELETE /api/resellers/:id': 'Delete reseller',
        'GET /api/resellers/dashboard/data': 'Get reseller dashboard'
      },
      clients: {
        'POST /api/clients/register': 'Register new client',
        'POST /api/clients/login': 'Client login',
        'POST /api/clients/validate-session': 'Validate client session',
        'GET /api/clients': 'Get clients (owner only)',
        'DELETE /api/clients/:id': 'Delete client',
        'PATCH /api/clients/:id/toggle-ban': 'Ban/unban client',
        'PATCH /api/clients/:id/extend': 'Extend client subscription'
      },
      payments: {
        'POST /api/payments/razorpay/create-order': 'Create Razorpay order (accepts planDuration: monthly/yearly)',
        'POST /api/payments/razorpay/verify': 'Verify Razorpay payment (requires planDuration)',
        'GET /api/payments/history': 'Get payment history',
        'GET /api/payments/analytics': 'Get payment analytics',
        'GET /api/payments/:paymentId': 'Get payment details',
        'POST /api/payments/:paymentId/refund': 'Process refund',
        'GET /api/payments/pricing': 'Get pricing information (monthly & yearly)',
        'POST /api/payments/cancel-subscription': 'Cancel subscription',
        'POST /api/payments/webhook': 'Razorpay webhook handler'
      }
    },
    documentation: 'See README.md for detailed API documentation'
  });
});

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
🚀 License Management System API Server Started
📍 Server running on port ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
📚 API Documentation: http://localhost:${PORT}/api
🏥 Health Check: http://localhost:${PORT}/health
⚡ Ready to accept requests!
  `);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  // Close server & exit process
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log(`Error: ${err.message}`);
  process.exit(1);
});

module.exports = app;