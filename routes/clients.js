const express = require('express');
const Client = require('../models/Client');
const License = require('../models/License');
const App = require('../models/App');
const { validateClientRegistration, validateClientLogin, validate } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Helper function to get error message from app
const getErrorMessage = (app, messageKey) => {
  return app.errorMessages[messageKey] || 'An error occurred';
};

// @desc    Register a new client
// @route   POST /clients/register
// @access  Public
router.post('/register',
  validateClientRegistration,
  validate,
  asyncHandler(async (req, res) => {
    const { username, password, licenseKey, hwid } = req.body;

    // Find license and populate app
    const license = await License.findOne({ key: licenseKey })
      .populate('app');

    if (!license) {
      return res.status(400).json({
        success: false,
        message: 'Invalid license key'
      });
    }

    const app = license.app;

    // Check if app is paused
    if (app.paused) {
      return res.status(400).json({
        success: false,
        message: getErrorMessage(app, 'pausedApp')
      });
    }

    // Check if license is already used
    if (license.used) {
      return res.status(400).json({
        success: false,
        message: getErrorMessage(app, 'keyUsed')
      });
    }

    // Check if license is active
    if (license.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: getErrorMessage(app, 'keyBanned')
      });
    }

    // Check if license is expired
    if (license.isExpired) {
      return res.status(400).json({
        success: false,
        message: getErrorMessage(app, 'noActiveSubs')
      });
    }

    // Check username length
    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        message: getErrorMessage(app, 'unTooShort')
      });
    }

    // Check if username already exists for this app
    const existingClient = await Client.findOne({ 
      app: app._id, 
      username 
    });

    if (existingClient) {
      return res.status(400).json({
        success: false,
        message: getErrorMessage(app, 'usernameTaken')
      });
    }

    // Create client
    const client = await Client.create({
      username,
      password,
      hwid,
      app: app._id,
      licenseKey,
      expiresAt: license.expiresAt
    });

    // Mark license as used
    license.used = true;
    license.usedBy = client._id;
    await license.save();

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        client: client.toJSON(),
        app: {
          name: app.name,
          version: app.version
        }
      }
    });
  })
);

// @desc    Client login
// @route   POST /clients/login
// @access  Public
router.post('/login',
  validateClientLogin,
  validate,
  asyncHandler(async (req, res) => {
    const { username, password, hwid, appId, appSecret } = req.body;

    // Find app by appId and appSecret
    const app = await App.findOne({ appId, appSecret });

    if (!app) {
      return res.status(401).json({
        success: false,
        message: 'Invalid application credentials'
      });
    }

    // Check if app is paused
    if (app.paused) {
      return res.status(400).json({
        success: false,
        message: getErrorMessage(app, 'pausedApp')
      });
    }

    // Find client
    const client = await Client.findOne({ 
      app: app._id, 
      username 
    }).select('+password');

    if (!client) {
      return res.status(401).json({
        success: false,
        message: getErrorMessage(app, 'usernameNotFound')
      });
    }

    // Check password
    const isPasswordCorrect = await client.comparePassword(password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: getErrorMessage(app, 'passMismatch')
      });
    }

    // Check if client is banned
    if (client.ban) {
      return res.status(403).json({
        success: false,
        message: getErrorMessage(app, 'userBanned')
      });
    }

    // Check if client is expired
    if (client.isExpired) {
      return res.status(403).json({
        success: false,
        message: getErrorMessage(app, 'noActiveSubs')
      });
    }

    // Check HWID if HWID lock is enabled
    if (app.settings.hwidLock) {
      if (client.hwid !== hwid) {
        return res.status(403).json({
          success: false,
          message: getErrorMessage(app, 'hwidMismatch')
        });
      }
    } else {
      // Update HWID if lock is disabled
      if (client.hwid !== hwid) {
        client.hwid = hwid;
      }
    }

    // Update login info
    await client.updateLoginInfo();

    res.status(200).json({
      success: true,
      message: getErrorMessage(app, 'loggedInMsg'),
      data: {
        client: client.toJSON(),
        app: {
          name: app.name,
          version: app.version
        }
      }
    });
  })
);

// @desc    Validate client session
// @route   POST /clients/validate-session
// @access  Public
router.post('/validate-session',
  asyncHandler(async (req, res) => {
    const { username, appId, appSecret } = req.body;

    if (!username || !appId || !appSecret) {
      return res.status(400).json({
        success: false,
        message: 'Username, appId, and appSecret are required'
      });
    }

    // Find app
    const app = await App.findOne({ appId, appSecret });
    if (!app) {
      return res.status(401).json({
        success: false,
        message: 'Invalid application credentials'
      });
    }

    // Check if app is paused
    if (app.paused) {
      return res.status(400).json({
        success: false,
        message: getErrorMessage(app, 'pausedApp')
      });
    }

    // Find client
    const client = await Client.findOne({ 
      app: app._id, 
      username 
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: getErrorMessage(app, 'usernameNotFound')
      });
    }

    // Check if client is banned
    if (client.ban) {
      return res.status(403).json({
        success: false,
        message: getErrorMessage(app, 'userBanned')
      });
    }

    // Check if client is expired
    if (client.isExpired) {
      return res.status(403).json({
        success: false,
        message: getErrorMessage(app, 'noActiveSubs')
      });
    }

    res.status(200).json({
      success: true,
      message: 'Session is valid',
      data: {
        client: client.toJSON(),
        app: {
          name: app.name,
          version: app.version
        }
      }
    });
  })
);

// @desc    Get client info (for app developers to manage clients)
// @route   GET /clients
// @access  Private (requires app ownership)
router.get('/',
  require('../middleware/auth').authenticateToken,
  asyncHandler(async (req, res) => {
    const { app: appId, page = 1, limit = 20, search } = req.query;
    const userId = req.user._id;

    if (!appId) {
      return res.status(400).json({
        success: false,
        message: 'App ID is required'
      });
    }

    // Check if user owns the app
    const app = await App.findOne({ _id: appId, owner: userId });
    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found or you are not the owner'
      });
    }

    // Build query
    const query = { app: appId };

    // Add search if provided
    if (search) {
      query.username = { $regex: search, $options: 'i' };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get clients with pagination
    const [clients, total] = await Promise.all([
      Client.find(query)
        .populate('app', 'name version') // Populate app details
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Client.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: {
        clients,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }
    });
  })
);

// @desc    Ban/Unban client
// @route   PATCH /clients/:id/toggle-ban
// @access  Private (requires app ownership)
router.patch('/:id/toggle-ban',
  require('../middleware/auth').authenticateToken,
  asyncHandler(async (req, res) => {
    const clientId = req.params.id;
    const userId = req.user._id;

    // Find client and populate app
    const client = await Client.findById(clientId)
      .populate('app', 'owner name');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Check if user owns the app
    if (client.app.owner.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage this client'
      });
    }

    // Toggle ban status
    client.ban = !client.ban;
    await client.save();

    res.status(200).json({
      success: true,
      message: `Client ${client.ban ? 'banned' : 'unbanned'} successfully`,
      data: {
        client: client.toJSON()
      }
    });
  })
);

// @desc    Extend client subscription
// @route   PATCH /clients/:id/extend
// @access  Private (requires app ownership)
router.patch('/:id/extend',
  require('../middleware/auth').authenticateToken,
  asyncHandler(async (req, res) => {
    const clientId = req.params.id;
    const { days } = req.body;
    const userId = req.user._id;

    if (!days || days < 1) {
      return res.status(400).json({
        success: false,
        message: 'Days must be a positive number'
      });
    }

    // Find client and populate app
    const client = await Client.findById(clientId)
      .populate('app', 'owner name');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Check if user owns the app
    if (client.app.owner.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage this client'
      });
    }

    // Extend subscription
    await client.extendExpiry(days);

    res.status(200).json({
      success: true,
      message: `Client subscription extended by ${days} days`,
      data: {
        client: client.toJSON()
      }
    });
  })
);

// @desc    Reset client HWID
// @route   PATCH /clients/:id/reset-hwid
// @access  Private (requires app ownership)
router.patch('/:id/reset-hwid',
  require('../middleware/auth').authenticateToken,
  asyncHandler(async (req, res) => {
    const clientId = req.params.id;
    const userId = req.user._id;

    // Find client and populate app
    const client = await Client.findById(clientId)
      .populate('app', 'owner name');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Check if user owns the app
    if (client.app.owner.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage this client'
      });
    }

    // Reset HWID to null
    client.hwid = null;
    await client.save();

    res.status(200).json({
      success: true,
      message: 'Client HWID reset successfully',
      data: {
        client: client.toJSON()
      }
    });
  })
);

// @desc    Delete client
// @route   DELETE /clients/:id
// @access  Private (requires app ownership)
router.delete('/:id',
  require('../middleware/auth').authenticateToken,
  asyncHandler(async (req, res) => {
    const clientId = req.params.id;
    const userId = req.user._id;

    // Find client and populate app and license
    const client = await Client.findById(clientId)
      .populate('app', 'owner name');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Check if user owns the app
    if (client.app.owner.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this client'
      });
    }

    // Find and free up the license that was used by this client
    const license = await License.findOne({ key: client.licenseKey });
    if (license) {
      license.used = false;
      license.usedBy = undefined;
      await license.save();
    }

    // Delete the client
    await Client.findByIdAndDelete(clientId);

    res.status(200).json({
      success: true,
      message: 'Client deleted successfully and license has been freed'
    });
  })
);

// @desc    Create end user directly (owner only, no license key required)
// @route   POST /clients/create-direct
// @access  Private (Owner only)
router.post('/create-direct',
  require('../middleware/auth').authenticateToken,
  asyncHandler(async (req, res) => {
    const { username, password, appId, hwid = null, expiresAt } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!username || !password || !appId || !expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Username, password, appId, and expiresAt are required'
      });
    }

    // Find app and verify ownership
    const app = await App.findOne({ _id: appId, owner: userId });
    
    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found or you are not the owner'
      });
    }

    // Check if app is paused
    if (app.paused) {
      return res.status(400).json({
        success: false,
        message: 'Cannot create users for paused applications'
      });
    }

    // Validate username length
    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Username must be at least 3 characters long'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if username already exists for this app
    const existingClient = await Client.findOne({ 
      app: app._id, 
      username 
    });

    if (existingClient) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists for this application'
      });
    }

    // Validate expiration date
    const expireDate = new Date(expiresAt);
    if (isNaN(expireDate.getTime()) || expireDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid expiration date. Must be a future date.'
      });
    }

    // Create client without license key (direct creation)
    const client = await Client.create({
      username,
      password,
      hwid: hwid || null, // Use provided HWID or null
      app: app._id,
      licenseKey: '', // Empty license key for direct creation
      expiresAt: expireDate
    });

    res.status(201).json({
      success: true,
      message: 'End user created successfully',
      data: {
        client: client.toJSON(),
        app: {
          name: app.name,
          version: app.version
        }
      }
    });
  })
);

module.exports = router;