const express = require('express');
const Reseller = require('../models/Reseller');
const App = require('../models/App');
const License = require('../models/License');
const { authenticateToken, authenticateResellerToken } = require('../middleware/auth');
const { validateResellerCreation, validate } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// @desc    Reseller login
// @route   POST /resellers/auth/login
// @access  Public
router.post('/auth/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find reseller by email and include password for comparison
    const reseller = await Reseller.findOne({ email, active: true })
      .select('+password')
      .populate('app', 'name appId');

    if (!reseller) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordCorrect = await reseller.comparePassword(password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate token (we'll use reseller ID as identifier)
    const token = generateToken(reseller._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        reseller: {
          _id: reseller._id,
          email: reseller.email,
          app_id: {
            _id: reseller.app._id,
            name: reseller.app.name,
            app_name: reseller.app.name
          },
          allowed_license_keys: reseller.licenseLimit,
          created_licenses: reseller.usedLicenses,
          remaining_licenses: reseller.remainingLicenses,
          active: reseller.active,
          createdAt: reseller.createdAt
        },
        token
      }
    });
  })
);

// @desc    Get reseller profile
// @route   GET /resellers/auth/profile
// @access  Private (Reseller only)
router.get('/auth/profile',
  authenticateResellerToken,
  asyncHandler(async (req, res) => {
    const reseller = req.user; // reseller is already loaded by authenticateResellerToken

    if (!reseller.active) {
      return res.status(404).json({
        success: false,
        message: 'Reseller account not found or inactive'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        _id: reseller._id,
        email: reseller.email,
        app_id: {
          _id: reseller.app._id,
          name: reseller.app.name,
          app_name: reseller.app.name
        },
        allowed_license_keys: reseller.licenseLimit,
        created_licenses: reseller.usedLicenses,
        remaining_licenses: reseller.remainingLicenses,
        active: reseller.active,
        createdAt: reseller.createdAt
      }
    });
  })
);

// @desc    Get reseller's licenses
// @route   GET /resellers/auth/licenses
// @access  Private (Reseller only)
router.get('/auth/licenses',
  authenticateResellerToken,
  asyncHandler(async (req, res) => {
    const reseller = req.user; // reseller is already loaded by authenticateResellerToken

    if (!reseller.active) {
      return res.status(404).json({
        success: false,
        message: 'Reseller account not found or inactive'
      });
    }

    // Get licenses created by this reseller
    const licenses = await License.find({ reseller: reseller._id })
      .populate('app', 'name appId')
      .populate('usedBy', 'username')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        licenses: licenses.map(license => license.toJSON())
      }
    });
  })
);

// @desc    Create licenses as reseller
// @route   POST /resellers/auth/licenses
// @access  Private (Reseller only)
router.post('/auth/licenses',
  authenticateResellerToken,
  asyncHandler(async (req, res) => {
    const { count, expiresAt, note } = req.body;
    const reseller = req.user; // reseller is already loaded by authenticateResellerToken

    if (!reseller.active) {
      return res.status(404).json({
        success: false,
        message: 'Reseller account not found or inactive'
      });
    }

    // Validate count
    if (!count || count < 1 || count > 100) {
      return res.status(400).json({
        success: false,
        message: 'Count must be between 1 and 100'
      });
    }

    // Check if reseller can create more licenses
    if (!reseller.canCreateLicense()) {
      return res.status(403).json({
        success: false,
        message: `License limit reached. You can create ${reseller.licenseLimit === -1 ? 'unlimited' : reseller.licenseLimit} licenses total.`
      });
    }

    if (reseller.licenseLimit !== -1 && (reseller.usedLicenses + count) > reseller.licenseLimit) {
      return res.status(403).json({
        success: false,
        message: `Cannot create ${count} licenses. You have ${reseller.remainingLicenses} licenses remaining.`
      });
    }

    // Validate expiration date
    if (!expiresAt || new Date(expiresAt) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Valid future expiration date is required'
      });
    }

    const createdLicenses = [];
    
    for (let i = 0; i < count; i++) {
      const license = await License.create({
        app: reseller.app._id,
        createdByUser: reseller._id, // Use reseller ID as creator
        createdByType: 'reseller',
        reseller: reseller._id,
        expiresAt,
        note
      });

      await license.populate('app');
      createdLicenses.push(license.toJSON());
    }

    // Update reseller usage
    await reseller.incrementUsedLicenses();
    reseller.usedLicenses += (count - 1); // incrementUsedLicenses adds 1, so add the rest
    await reseller.save();

    res.status(201).json({
      success: true,
      message: `Successfully created ${count} license(s)`,
      data: {
        licenses: createdLicenses,
        count: createdLicenses.length
      }
    });
  })
);

// @desc    Create a new reseller
// @route   POST /resellers
// @access  Private (App Owner only)
router.post('/',
  authenticateToken,
  validateResellerCreation,
  validate,
  asyncHandler(async (req, res) => {
    const { email, password, app_id, allowed_license_keys } = req.body;
    const ownerId = req.user._id;

    // Validate required fields
    if (!email || !password || !app_id) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and app ID are required'
      });
    }

    // Check if app exists and user is owner
    const app = await App.findOne({ _id: app_id, owner: ownerId });
    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found or you are not the owner'
      });
    }

    // Check if owner can create more resellers
    const canCreate = await req.user.canCreateReseller();
    if (!canCreate) {
      // Get current reseller count for better error message
      const userApps = await App.find({ owner: ownerId }).select('_id');
      const appIds = userApps.map(app => app._id);
      const currentResellerCount = await Reseller.countDocuments({ app: { $in: appIds } });
      
      console.log(`Reseller creation blocked for user ${ownerId}: Current count ${currentResellerCount}, Max allowed ${req.user.maxResellers}, Plan: ${req.user.plan}`);
      
      return res.status(403).json({
        success: false,
        message: `Free plan users cannot create resellers. Upgrade to our monthly or yearly premium plan to create unlimited resellers and unlock other premium features.`
      });
    }

    console.log(`Reseller creation allowed for user ${ownerId}: Plan ${req.user.plan}, Max resellers: ${req.user.maxResellers}`);

    // Check if reseller with this email already exists
    const existingReseller = await Reseller.findOne({ email });
    if (existingReseller) {
      return res.status(400).json({
        success: false,
        message: 'A reseller with this email already exists'
      });
    }

    // Set license limit based on owner's plan
    const finalLicenseLimit = req.user.plan === 'premium' 
      ? (allowed_license_keys !== undefined ? allowed_license_keys : -1) 
      : Math.min(allowed_license_keys || 30, 30);

    // Create reseller directly with email and password
    const reseller = await Reseller.create({
      email: email,
      password: password,
      app: app_id,
      licenseLimit: finalLicenseLimit
    });

    await reseller.populate('app', 'name appId');

    res.status(201).json({
      success: true,
      message: 'Reseller created successfully',
      data: {
        _id: reseller._id,
        email: reseller.email,
        password: password, // Return password for frontend to show
        app_id: {
          _id: app._id,
          name: app.name,
          app_name: app.name // Backward compatibility
        },
        allowed_license_keys: finalLicenseLimit,
        created_licenses: 0,
        active: reseller.active,
        createdAt: reseller.createdAt
      }
    });
  })
);

// @desc    Get resellers
// @route   GET /resellers
// @access  Private
router.get('/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { app: appId, active } = req.query;
    const userId = req.user._id;

    // Build query
    let query = {};

    if (appId) {
      // Check if user is owner of the app
      const app = await App.findOne({ _id: appId, owner: userId });
      if (!app) {
        return res.status(404).json({
          success: false,
          message: 'App not found or you are not the owner'
        });
      }
      query.app = appId;
    } else {
      // Get resellers for all user's apps
      const userApps = await App.find({ owner: userId }).select('_id');
      query.app = { $in: userApps.map(app => app._id) };
    }

    // Filter by active status if specified
    if (active !== undefined) {
      query.active = active === 'true';
    }

    const resellers = await Reseller.find(query)
      .populate('app', 'name appId')
      .sort({ createdAt: -1 });

    // Transform data to match frontend expectations
    const transformedResellers = resellers.map(reseller => ({
      _id: reseller._id,
      email: reseller.email,
      app: reseller.app,
      app_id: {
        _id: reseller.app._id,
        name: reseller.app.name,
        app_name: reseller.app.name // Backward compatibility
      },
      licenseLimit: reseller.licenseLimit,
      usedLicenses: reseller.usedLicenses,
      allowed_license_keys: reseller.licenseLimit,
      created_licenses: reseller.usedLicenses,
      active: reseller.active,
      allowedActions: reseller.allowedActions,
      createdAt: reseller.createdAt,
      updatedAt: reseller.updatedAt,
      remainingLicenses: reseller.remainingLicenses
    }));

    res.status(200).json({
      success: true,
      data: {
        resellers: transformedResellers,
        count: transformedResellers.length
      }
    });
  })
);

// @desc    Get single reseller
// @route   GET /resellers/:id
// @access  Private
router.get('/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const reseller = await Reseller.findById(req.params.id)
      .populate('app', 'name appId owner');

    if (!reseller) {
      return res.status(404).json({
        success: false,
        message: 'Reseller not found'
      });
    }

    // Check if user is owner of the app
    if (reseller.app.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this reseller'
      });
    }

    // Get reseller statistics
    const [totalLicenses, activeLicenses] = await Promise.all([
      License.countDocuments({ reseller: reseller._id }),
      License.countDocuments({ reseller: reseller._id, status: 'ACTIVE' })
    ]);

    res.status(200).json({
      success: true,
      data: {
        reseller: {
          ...reseller.toJSON(),
          stats: {
            totalLicenses,
            activeLicenses
          }
        }
      }
    });
  })
);

// @desc    Update reseller
// @route   PUT /resellers/:id
// @access  Private (App Owner only)
router.put('/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { licenseLimit, active, allowedActions } = req.body;

    const reseller = await Reseller.findById(req.params.id)
      .populate('app', 'owner');

    if (!reseller) {
      return res.status(404).json({
        success: false,
        message: 'Reseller not found'
      });
    }

    // Check if user is owner of the app
    if (reseller.app.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update resellers for your own apps'
      });
    }

    // Update fields if provided
    if (licenseLimit !== undefined) {
      // Enforce limits based on owner's plan
      if (req.user.plan === 'free' && licenseLimit > 30) {
        return res.status(400).json({
          success: false,
          message: 'Free plan users cannot set license limit above 30'
        });
      }
      reseller.licenseLimit = licenseLimit;
    }

    if (active !== undefined) {
      reseller.active = active;
    }

    if (allowedActions !== undefined) {
      // Update allowed actions (but keep delete as false for resellers)
      if (allowedActions.create !== undefined) {
        reseller.allowedActions.create = allowedActions.create;
      }
      if (allowedActions.banUnban !== undefined) {
        reseller.allowedActions.banUnban = allowedActions.banUnban;
      }
      if (allowedActions.editExpiry !== undefined) {
        reseller.allowedActions.editExpiry = allowedActions.editExpiry;
      }
      // Delete permission is always false for resellers
      reseller.allowedActions.delete = false;
    }

    await reseller.save();
    await reseller.populate('user', 'name email');
    await reseller.populate('app', 'name appId');

    res.status(200).json({
      success: true,
      message: 'Reseller updated successfully',
      data: {
        reseller: reseller.toJSON()
      }
    });
  })
);

// @desc    Delete reseller
// @route   DELETE /resellers/:id
// @access  Private (App Owner only)
router.delete('/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const reseller = await Reseller.findById(req.params.id)
      .populate('app', 'owner');

    if (!reseller) {
      return res.status(404).json({
        success: false,
        message: 'Reseller not found'
      });
    }

    // Check if user is owner of the app
    if (reseller.app.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete resellers for your own apps'
      });
    }

    // Check if reseller has active licenses
    const activeLicenses = await License.countDocuments({ 
      reseller: reseller._id, 
      status: 'ACTIVE' 
    });

    if (activeLicenses > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete reseller with ${activeLicenses} active licenses`
      });
    }

    await Reseller.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Reseller deleted successfully'
    });
  })
);

// @desc    Get reseller dashboard data (for reseller users)
// @route   GET /resellers/dashboard
// @access  Private (Reseller only)
router.get('/dashboard/data',
  authenticateResellerToken,
  asyncHandler(async (req, res) => {
    const reseller = req.user; // reseller is already loaded by authenticateResellerToken

    if (!reseller.active) {
      return res.status(404).json({
        success: false,
        message: 'No active reseller account found'
      });
    }

    // Get statistics for this reseller
    const [totalLicenses, activeLicenses, expiredLicenses] = await Promise.all([
      License.countDocuments({ reseller: reseller._id }),
      License.countDocuments({ reseller: reseller._id, status: 'ACTIVE' }),
      License.countDocuments({ reseller: reseller._id, status: 'EXPIRED' })
    ]);

    const resellerData = {
      ...reseller.toJSON(),
      stats: {
        totalLicenses,
        activeLicenses,
        expiredLicenses,
        remainingLicenses: reseller.remainingLicenses
      }
    };

    res.status(200).json({
      success: true,
      data: {
        resellers: [resellerData],
        summary: {
          totalResellerAccounts: 1,
          totalLicensesCreated: totalLicenses,
          totalActiveLicenses: activeLicenses
        }
      }
    });
  })
);

module.exports = router;