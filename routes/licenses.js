const express = require('express');
const License = require('../models/License');
const App = require('../models/App');
const Reseller = require('../models/Reseller');
const Client = require('../models/Client');
const { authenticateToken } = require('../middleware/auth');
const { validateLicenseCreation, validateLicenseUpdate, validate } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// @desc    Create a new license
// @route   POST /licenses
// @access  Private
router.post('/',
  authenticateToken,
  validateLicenseCreation,
  validate,
  asyncHandler(async (req, res) => {
    const { app: appId, key, expiresAt, note, resellerId } = req.body;
    const userId = req.user._id;

    // Check if app exists and user has access
    const app = await App.findOne({ _id: appId });
    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }

    let createdByType = 'owner';
    let reseller = null;

    // Check if user is owner or reseller
    if (app.owner.toString() === userId.toString()) {
      createdByType = 'owner';
    } else {
      // Check if user is a reseller for this app
      reseller = await Reseller.findOne({ 
        user: userId, 
        app: appId, 
        active: true 
      });
      
      if (!reseller) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to create licenses for this app'
        });
      }

      if (!reseller.hasPermission('create')) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to create licenses'
        });
      }

      if (!reseller.canCreateLicense()) {
        return res.status(403).json({
          success: false,
          message: 'You have reached your license creation limit'
        });
      }

      createdByType = 'reseller';
    }

    // Check app license limits for owner
    if (createdByType === 'owner' && !(await app.canCreateLicense(userId))) {
      return res.status(403).json({
        success: false,
        message: `App has reached the maximum limit of ${req.user.maxLicensesPerApp} licenses for your plan`
      });
    }

    // Validate custom license key if provided
    if (key) {
      if (!app.settings.allowCustomLicenseKey) {
        return res.status(400).json({
          success: false,
          message: 'Custom license keys are not allowed for this app'
        });
      }

      // Check if key already exists
      const existingLicense = await License.findOne({ key });
      if (existingLicense) {
        return res.status(400).json({
          success: false,
          message: 'License key already exists'
        });
      }
    }

    // Create license
    const licenseData = {
      app: appId,
      createdByUser: userId,
      createdByType,
      expiresAt,
      note
    };

    if (key) licenseData.key = key;
    if (reseller) licenseData.reseller = reseller._id;

    const license = await License.create(licenseData);

    // Update reseller usage if created by reseller
    if (reseller) {
      await reseller.incrementUsedLicenses();
    }

    await license.populate('app createdByUser reseller');

    res.status(201).json({
      success: true,
      message: 'License created successfully',
      data: {
        license: license.toJSON()
      }
    });
  })
);

// @desc    Get licenses
// @route   GET /licenses
// @access  Private
router.get('/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { app: appId, status, page = 1, limit = 1000 } = req.query;
    const userId = req.user._id;

    // Build query
    const query = {};
    
    // Filter by app if specified
    if (appId) {
      // Check if user has access to this app
      const app = await App.findById(appId);
      if (!app) {
        return res.status(404).json({
          success: false,
          message: 'App not found'
        });
      }

      // Check if user is owner or reseller
      if (app.owner.toString() !== userId.toString()) {
        const reseller = await Reseller.findOne({ 
          user: userId, 
          app: appId, 
          active: true 
        });
        
        if (!reseller) {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to this app'
          });
        }
        
        // Reseller can only see their own licenses
        query.reseller = reseller._id;
      }

      query.app = appId;
    } else {
      // Get all licenses for user's apps and reseller licenses
      const userApps = await App.find({ owner: userId }).select('_id');
      const resellerApps = await Reseller.find({ user: userId, active: true }).select('app');
      
      const appIds = [
        ...userApps.map(app => app._id),
        ...resellerApps.map(r => r.app)
      ];

      query.$or = [
        { app: { $in: appIds } },
        { createdByUser: userId }
      ];
    }

    // Filter by status if specified
    if (status) {
      query.status = status;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get licenses with pagination
    const [licenses, total] = await Promise.all([
      License.find(query)
        .populate('app', 'name appId')
        .populate('createdByUser', 'name email')
        .populate('reseller')
        .populate('usedBy', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      License.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: {
        licenses,
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

// @desc    Get single license
// @route   GET /licenses/:id
// @access  Private
router.get('/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const license = await License.findById(req.params.id)
      .populate('app', 'name appId owner')
      .populate('createdByUser', 'name email')
      .populate('reseller')
      .populate('usedBy', 'username hwid');

    if (!license) {
      return res.status(404).json({
        success: false,
        message: 'License not found'
      });
    }

    // Check permissions
    const userId = req.user._id;
    const isOwner = license.app.owner.toString() === userId.toString();
    const isCreator = license.createdByUser._id.toString() === userId.toString();

    if (!isOwner && !isCreator) {
      // Check if user is reseller for this app
      const reseller = await Reseller.findOne({ 
        user: userId, 
        app: license.app._id, 
        active: true 
      });
      
      if (!reseller) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this license'
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        license: license.toJSON()
      }
    });
  })
);

// @desc    Update license
// @route   PUT /licenses/:id
// @access  Private
router.put('/:id',
  authenticateToken,
  validateLicenseUpdate,
  validate,
  asyncHandler(async (req, res) => {
    const { status, expiresAt, note } = req.body;
    const userId = req.user._id;

    const license = await License.findById(req.params.id)
      .populate('app', 'owner')
      .populate('reseller');

    if (!license) {
      return res.status(404).json({
        success: false,
        message: 'License not found'
      });
    }

    // Check permissions
    const isOwner = license.app.owner.toString() === userId.toString();
    let reseller = null;

    if (!isOwner) {
      reseller = await Reseller.findOne({ 
        user: userId, 
        app: license.app._id, 
        active: true 
      });
      
      if (!reseller) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to update this license'
        });
      }

      // Check reseller permissions
      if (status && !reseller.hasPermission('banUnban')) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to change license status'
        });
      }

      if (expiresAt && !reseller.hasPermission('editExpiry')) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to edit license expiry'
        });
      }
    }

    // Update fields
    if (status !== undefined) license.status = status;
    if (expiresAt !== undefined) license.expiresAt = expiresAt;
    if (note !== undefined) license.note = note;

    await license.save();
    await license.populate('app createdByUser reseller usedBy');

    res.status(200).json({
      success: true,
      message: 'License updated successfully',
      data: {
        license: license.toJSON()
      }
    });
  })
);

// @desc    Delete license
// @route   DELETE /licenses/:id
// @access  Private
router.delete('/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const license = await License.findById(req.params.id)
      .populate('app', 'owner')
      .populate('reseller');

    if (!license) {
      return res.status(404).json({
        success: false,
        message: 'License not found'
      });
    }

    // Check permissions - only owners can delete
    const isOwner = license.app.owner.toString() === userId.toString();

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Only app owners can delete licenses'
      });
    }

    // Update reseller usage if license was created by reseller
    if (license.reseller) {
      await Reseller.findByIdAndUpdate(license.reseller._id, {
        $inc: { usedLicenses: -1 }
      });
    }

    await License.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'License deleted successfully'
    });
  })
);

// @desc    Toggle license ban status
// @route   PATCH /licenses/:id/toggle-ban
// @access  Private
router.patch('/:id/toggle-ban',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const license = await License.findById(req.params.id)
      .populate('app', 'owner');

    if (!license) {
      return res.status(404).json({
        success: false,
        message: 'License not found'
      });
    }

    // Check permissions
    const isOwner = license.app.owner.toString() === userId.toString();

    if (!isOwner) {
      const reseller = await Reseller.findOne({ 
        user: userId, 
        app: license.app._id, 
        active: true 
      });
      
      if (!reseller || !reseller.hasPermission('banUnban')) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to ban/unban licenses'
        });
      }
    }

    await license.toggleBan();
    await license.populate('app createdByUser reseller usedBy');

    res.status(200).json({
      success: true,
      message: `License ${license.status === 'BANNED' ? 'banned' : 'unbanned'} successfully`,
      data: {
        license: license.toJSON()
      }
    });
  })
);

// @desc    Delete all licenses for user's apps
// @route   DELETE /licenses
// @access  Private
router.delete('/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { app: appId } = req.query;

    let query = {};

    if (appId) {
      // Check if user owns the specific app
      const app = await App.findOne({ _id: appId, owner: userId });
      if (!app) {
        return res.status(404).json({
          success: false,
          message: 'App not found or you are not the owner'
        });
      }
      query.app = appId;
    } else {
      // Get all apps owned by the user
      const userApps = await App.find({ owner: userId }).select('_id');
      query.app = { $in: userApps.map(app => app._id) };
    }

    // Only delete licenses from apps owned by the user (not reseller licenses)
    query.createdByType = 'owner';

    // Count licenses before deletion
    const licenseCount = await License.countDocuments(query);

    // Find licenses that are being used by clients and free them up
    const usedLicenses = await License.find({ ...query, used: true });
    
    // Update reseller usage for licenses created by resellers
    for (const license of usedLicenses) {
      if (license.reseller) {
        await Reseller.findByIdAndUpdate(license.reseller, {
          $inc: { usedLicenses: -1 }
        });
      }
    }

    // Delete all matching licenses
    await License.deleteMany(query);

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${licenseCount} license(s)`,
      data: {
        deletedCount: licenseCount
      }
    });
  })
);

module.exports = router;