const { body, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// User registration validation
const validateRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email')
    .custom(async (value) => {
      // Block temporary email domains
      const tempDomains = [
        '10minutemail.com', 'guerrillamail.com', 'tempmail.org',
        'throwaway.email', 'maildrop.cc', 'temp-mail.org'
      ];
      
      const domain = value.split('@')[1];
      if (tempDomains.includes(domain)) {
        throw new Error('Temporary email addresses are not allowed');
      }
      return true;
    }),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];

// User login validation
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// App creation validation
const validateAppCreation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('App name must be between 1 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-_]+$/)
    .withMessage('App name can only contain letters, numbers, spaces, hyphens, and underscores')
];

// App update validation
const validateAppUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('App name must be between 1 and 100 characters'),
  
  body('version')
    .optional()
    .matches(/^\d+\.\d+\.\d+$/)
    .withMessage('Version must be in format x.y.z'),
  
  body('paused')
    .optional()
    .isBoolean()
    .withMessage('Paused must be a boolean'),
  
  body('settings.hwidLock')
    .optional()
    .isBoolean()
    .withMessage('HWID lock must be a boolean'),
  
  body('settings.allowCustomLicenseKey')
    .optional()
    .isBoolean()
    .withMessage('Allow custom license key must be a boolean')
];

// License creation validation
const validateLicenseCreation = [
  body('app')
    .isMongoId()
    .withMessage('Valid app ID is required'),
  
  body('key')
    .optional()
    .isLength({ min: 8, max: 50 })
    .withMessage('License key must be between 8 and 50 characters'),
  
  body('expiresAt')
    .isISO8601()
    .withMessage('Valid expiration date is required')
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('Expiration date must be in the future');
      }
      return true;
    }),
  
  body('note')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Note cannot exceed 500 characters')
];

// License update validation
const validateLicenseUpdate = [
  body('status')
    .optional()
    .isIn(['ACTIVE', 'REVOKED', 'EXPIRED', 'BANNED'])
    .withMessage('Invalid status'),
  
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Valid expiration date is required'),
  
  body('note')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Note cannot exceed 500 characters')
];

// Reseller creation validation
const validateResellerCreation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  
  body('app_id')
    .isMongoId()
    .withMessage('Valid app ID is required'),
  
  body('allowed_license_keys')
    .optional()
    .isInt({ min: -1 })
    .withMessage('License limit must be -1 (unlimited) or a positive number')
];

// Client registration validation
const validateClientRegistration = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  
  body('licenseKey')
    .notEmpty()
    .withMessage('License key is required'),
  
  body('hwid')
    .notEmpty()
    .withMessage('HWID is required')
];

// Client login validation
const validateClientLogin = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  body('hwid')
    .notEmpty()
    .withMessage('HWID is required'),
  
  body('appId')
    .notEmpty()
    .withMessage('App ID is required'),
  
  body('appSecret')
    .notEmpty()
    .withMessage('App Secret is required')
];

module.exports = {
  validate,
  validateRegistration,
  validateLogin,
  validateAppCreation,
  validateAppUpdate,
  validateLicenseCreation,
  validateLicenseUpdate,
  validateResellerCreation,
  validateClientRegistration,
  validateClientLogin
};