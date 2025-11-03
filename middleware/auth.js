const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Reseller = require('../models/Reseller');

// Verify JWT token for users
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).populate('apps');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

// Verify JWT token for resellers
const authenticateResellerToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const reseller = await Reseller.findById(decoded.userId).populate('app');
    
    if (!reseller) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - reseller not found'
      });
    }

    req.user = reseller; // Store reseller in req.user for consistency
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    console.error('Reseller auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

// Check if user is app owner
const requireAppOwnership = async (req, res, next) => {
  try {
    const { id: appId } = req.params;
    const userId = req.user._id;

    // Check if the app belongs to the user
    if (!req.user.apps.some(app => app._id.toString() === appId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - you do not own this app'
      });
    }

    next();
  } catch (error) {
    console.error('App ownership check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authorization error'
    });
  }
};

// Check if user has premium plan
const requirePremium = (req, res, next) => {
  if (req.user.plan !== 'premium') {
    return res.status(403).json({
      success: false,
      message: 'Premium plan required for this feature'
    });
  }
  next();
};

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

module.exports = {
  authenticateToken,
  authenticateResellerToken,
  requireAppOwnership,
  requirePremium,
  generateToken
};