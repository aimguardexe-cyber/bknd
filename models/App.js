const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const appSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  appId: {
    type: String,
    unique: true
  },
  appSecret: {
    type: String
  },
  version: {
    type: String,
    default: '1.0.0'
  },
  paused: {
    type: Boolean,
    default: false
  },
  settings: {
    hwidLock: {
      type: Boolean,
      default: true
    },
    allowCustomLicenseKey: {
      type: Boolean,
      default: false
    }
  },
  errorMessages: {
    appDisabled: {
      type: String,
      default: 'This application is disabled'
    },
    usernameTaken: {
      type: String,
      default: 'Username already taken, choose a different one'
    },
    keyNotFound: {
      type: String,
      default: 'Invalid license key'
    },
    keyUsed: {
      type: String,
      default: 'License key has already been used'
    },
    usernameNotFound: {
      type: String,
      default: 'Invalid username'
    },
    passMismatch: {
      type: String,
      default: 'Password does not match.'
    },
    hwidMismatch: {
      type: String,
      default: 'HWID doesn\'t match. Ask for a HWID reset'
    },
    noActiveSubs: {
      type: String,
      default: 'No active subscription(s) found'
    },
    hwidBlacklisted: {
      type: String,
      default: 'You\'ve been blacklisted from our application'
    },
    pausedSub: {
      type: String,
      default: 'Your subscription is paused and can\'t be used right now'
    },
    vpnBlocked: {
      type: String,
      default: 'VPNs are blocked on this application'
    },
    keyBanned: {
      type: String,
      default: 'Your license is banned'
    },
    userBanned: {
      type: String,
      default: 'The user is banned'
    },
    sessionUnauthed: {
      type: String,
      default: 'Session is not validated'
    },
    hashCheckFail: {
      type: String,
      default: 'This program hash does not match, make sure you\'re using latest version'
    },
    loggedInMsg: {
      type: String,
      default: 'Logged in!'
    },
    pausedApp: {
      type: String,
      default: 'Application is currently paused, please wait for the developer to say otherwise.'
    },
    unTooShort: {
      type: String,
      default: 'Username too short, try longer one.'
    },
    pwLeaked: {
      type: String,
      default: 'This password has been leaked in a data breach (not from us), please use a different one.'
    }
  }
}, {
  timestamps: true
});

// Generate unique appId and appSecret before saving
appSchema.pre('save', async function(next) {
  if (this.isNew && (!this.appId || !this.appSecret)) {
    try {
      // Generate unique appId: 8 character alphanumeric
      let appId;
      let isUnique = false;
      
      // Ensure appId is unique
      while (!isUnique) {
        appId = crypto.randomBytes(4).toString('hex').toUpperCase();
        const existingApp = await mongoose.model('App').findOne({ appId });
        if (!existingApp) {
          isUnique = true;
        }
      }
      
      this.appId = appId;
      
      // Generate appSecret: 32 character random string
      this.appSecret = crypto.randomBytes(16).toString('hex');
      
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

// Virtual for license count
appSchema.virtual('licenseCount', {
  ref: 'License',
  localField: '_id',
  foreignField: 'app',
  count: true
});

// Virtual for reseller count
appSchema.virtual('resellerCount', {
  ref: 'Reseller',
  localField: '_id',
  foreignField: 'app',
  count: true
});

// Method to check if app can have more licenses
appSchema.methods.canCreateLicense = async function(userId) {
  const user = await mongoose.model('User').findById(userId);
  if (!user) return false;
  
  if (user.maxLicensesPerApp === -1) return true; // Premium user
  
  const licenseCount = await mongoose.model('License').countDocuments({ app: this._id });
  return licenseCount < user.maxLicensesPerApp;
};

// Ensure virtual fields are serialized
appSchema.set('toJSON', { virtuals: true });
appSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('App', appSchema);