const mongoose = require('mongoose');
const crypto = require('crypto');

const licenseSchema = new mongoose.Schema({
  app: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'App',
    required: true
  },
  key: {
    type: String,
    unique: true
  },
  createdByUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByType: {
    type: String,
    enum: ['owner', 'reseller'],
    required: true
  },
  reseller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reseller'
  },
  used: {
    type: Boolean,
    default: false
  },
  usedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'REVOKED', 'EXPIRED', 'BANNED'],
    default: 'ACTIVE'
  },
  note: {
    type: String,
    maxlength: 500
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

// Generate license key before saving if not provided
licenseSchema.pre('save', async function(next) {
  if (this.isNew && !this.key) {
    try {
      // Generate a unique 24-character license key
      let licenseKey;
      let isUnique = false;
      
      // Ensure license key is unique
      while (!isUnique) {
        licenseKey = crypto.randomBytes(12).toString('hex').toUpperCase();
        const existingLicense = await mongoose.model('License').findOne({ key: licenseKey });
        if (!existingLicense) {
          isUnique = true;
        }
      }
      
      this.key = licenseKey;
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

// Check if license is expired
licenseSchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt;
});

// Check if license is active
licenseSchema.virtual('isActive').get(function() {
  return this.status === 'ACTIVE' && !this.isExpired;
});

// Method to ban/unban license
licenseSchema.methods.toggleBan = function() {
  if (this.status === 'BANNED') {
    this.status = 'ACTIVE';
  } else if (this.status === 'ACTIVE') {
    this.status = 'BANNED';
  }
  return this.save();
};

// Method to revoke license
licenseSchema.methods.revoke = function() {
  this.status = 'REVOKED';
  return this.save();
};

// Method to extend expiry
licenseSchema.methods.extendExpiry = function(days) {
  const currentExpiry = this.expiresAt;
  const newExpiry = new Date(currentExpiry);
  newExpiry.setDate(newExpiry.getDate() + days);
  this.expiresAt = newExpiry;
  return this.save();
};

// Compound index for efficient queries
licenseSchema.index({ app: 1, status: 1 });
licenseSchema.index({ createdByUser: 1, createdByType: 1 });
licenseSchema.index({ key: 1 }, { unique: true });

// Ensure virtual fields are serialized
licenseSchema.set('toJSON', { virtuals: true });
licenseSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('License', licenseSchema);