const express = require('express');
const App = require('../models/App');
const User = require('../models/User');
const License = require('../models/License');
const { authenticateToken, requireAppOwnership } = require('../middleware/auth');
const { validateAppCreation, validateAppUpdate, validate } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// @desc    Create a new app
// @route   POST /apps
// @access  Private
router.post('/',
  authenticateToken,
  validateAppCreation,
  validate,
  asyncHandler(async (req, res) => {
    const { name } = req.body;
    const userId = req.user._id;

    // Check if user can create more apps
    if (!req.user.canCreateApp()) {
      return res.status(403).json({
        success: false,
        message: `You have reached the maximum limit of ${req.user.maxApps} apps for your plan`
      });
    }

    // Create app (appId and appSecret will be auto-generated)
    const app = await App.create({
      name,
      owner: userId
    });

    // Add app to user's apps array
    await User.findByIdAndUpdate(userId, {
      $push: { apps: app._id }
    });

    res.status(201).json({
      success: true,
      message: 'App created successfully',
      data: {
        app: app.toJSON()
      }
    });
  })
);

// @desc    Get all user's apps
// @route   GET /apps
// @access  Private
router.get('/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const apps = await App.find({ owner: req.user._id })
      .populate('licenseCount')
      .populate('resellerCount')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        apps,
        count: apps.length
      }
    });
  })
);

// @desc    Get single app
// @route   GET /apps/:id
// @access  Private
router.get('/:id',
  authenticateToken,
  requireAppOwnership,
  asyncHandler(async (req, res) => {
    const app = await App.findById(req.params.id)
      .populate('licenseCount')
      .populate('resellerCount');

    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        app: app.toJSON()
      }
    });
  })
);

// @desc    Update app
// @route   PUT /apps/:id
// @access  Private
router.put('/:id',
  authenticateToken,
  requireAppOwnership,
  validateAppUpdate,
  validate,
  asyncHandler(async (req, res) => {
    const { name, version, paused, settings } = req.body;

    const app = await App.findById(req.params.id);
    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }

    // Update fields if provided
    if (name !== undefined) app.name = name;
    if (version !== undefined) app.version = version;
    if (paused !== undefined) app.paused = paused;
    if (settings !== undefined) {
      if (settings.hwidLock !== undefined) app.settings.hwidLock = settings.hwidLock;
      if (settings.allowCustomLicenseKey !== undefined) app.settings.allowCustomLicenseKey = settings.allowCustomLicenseKey;
    }

    await app.save();

    res.status(200).json({
      success: true,
      message: 'App updated successfully',
      data: {
        app: app.toJSON()
      }
    });
  })
);

// @desc    Delete app
// @route   DELETE /apps/:id
// @access  Private
router.delete('/:id',
  authenticateToken,
  requireAppOwnership,
  asyncHandler(async (req, res) => {
    const appId = req.params.id;

    const app = await App.findById(appId);
    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }

    // Delete all related licenses
    await License.deleteMany({ app: appId });

    // Remove app from user's apps array
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { apps: appId }
    });

    // Delete the app
    await App.findByIdAndDelete(appId);

    res.status(200).json({
      success: true,
      message: 'App and all related data deleted successfully'
    });
  })
);

// @desc    Get app error messages
// @route   GET /apps/:id/error-messages
// @access  Private
router.get('/:id/error-messages',
  authenticateToken,
  requireAppOwnership,
  asyncHandler(async (req, res) => {
    const app = await App.findById(req.params.id);
    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        errorMessages: app.errorMessages
      }
    });
  })
);

// @desc    Update app error messages
// @route   PUT /apps/:id/error-messages
// @access  Private
router.put('/:id/error-messages',
  authenticateToken,
  requireAppOwnership,
  asyncHandler(async (req, res) => {
    const app = await App.findById(req.params.id);
    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }

    // Update error messages
    const allowedFields = [
      'appDisabled', 'usernameTaken', 'keyNotFound', 'keyUsed', 'usernameNotFound',
      'passMismatch', 'hwidMismatch', 'noActiveSubs', 'hwidBlacklisted', 'pausedSub',
      'vpnBlocked', 'keyBanned', 'userBanned', 'sessionUnauthed', 'hashCheckFail',
      'loggedInMsg', 'pausedApp', 'unTooShort', 'pwLeaked'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        app.errorMessages[field] = req.body[field];
      }
    });

    await app.save();

    res.status(200).json({
      success: true,
      message: 'Error messages updated successfully',
      data: {
        errorMessages: app.errorMessages
      }
    });
  })
);

// @desc    Get app statistics
// @route   GET /apps/:id/stats
// @access  Private
router.get('/:id/stats',
  authenticateToken,
  requireAppOwnership,
  asyncHandler(async (req, res) => {
    const appId = req.params.id;

    const [
      totalLicenses,
      activeLicenses,
      usedLicenses,
      expiredLicenses,
      bannedLicenses
    ] = await Promise.all([
      License.countDocuments({ app: appId }),
      License.countDocuments({ app: appId, status: 'ACTIVE' }),
      License.countDocuments({ app: appId, used: true }),
      License.countDocuments({ app: appId, status: 'EXPIRED' }),
      License.countDocuments({ app: appId, status: 'BANNED' })
    ]);

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalLicenses,
          activeLicenses,
          usedLicenses,
          expiredLicenses,
          bannedLicenses
        }
      }
    });
  })
);

module.exports = router;