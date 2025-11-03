const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const resellerSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false // Don't include password in queries by default
  },
  app: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'App',
    required: true
  },
  licenseLimit: {
    type: Number,
    default: 30
  },
  usedLicenses: {
    type: Number,
    default: 0
  },
  active: {
    type: Boolean,
    default: true
  },
  allowedActions: {
    create: {
      type: Boolean,
      default: true
    },
    banUnban: {
      type: Boolean,
      default: true
    },
    editExpiry: {
      type: Boolean,
      default: true
    },
    delete: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// Ensure one reseller per email
resellerSchema.index({ email: 1 }, { unique: true });

// Hash password before saving
resellerSchema.pre('save', async function(next) {
  // Only hash password if it's modified (or new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    const hashedPassword = await bcrypt.hash(this.password, 12);
    this.password = hashedPassword;
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
resellerSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual for remaining license count
resellerSchema.virtual('remainingLicenses').get(function() {
  if (this.licenseLimit === -1) return -1; // Unlimited
  return Math.max(0, this.licenseLimit - this.usedLicenses);
});

// Method to check if reseller can create more licenses
resellerSchema.methods.canCreateLicense = function() {
  if (!this.active) return false;
  if (this.licenseLimit === -1) return true; // Unlimited
  return this.usedLicenses < this.licenseLimit;
};

// Method to increment used licenses
resellerSchema.methods.incrementUsedLicenses = function() {
  this.usedLicenses += 1;
  return this.save();
};

// Method to decrement used licenses
resellerSchema.methods.decrementUsedLicenses = function() {
  if (this.usedLicenses > 0) {
    this.usedLicenses -= 1;
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to check if reseller has permission for an action
resellerSchema.methods.hasPermission = function(action) {
  if (!this.active) return false;
  return this.allowedActions[action] === true;
};

// Ensure virtual fields are serialized
resellerSchema.set('toJSON', { virtuals: true });
resellerSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Reseller', resellerSchema);