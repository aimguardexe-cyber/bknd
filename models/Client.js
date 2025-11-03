const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const clientSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  hwid: {
    type: String,
    required: false, // Make HWID optional for direct creation
    trim: true,
    default: null
  },
  app: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'App',
    required: true
  },
  licenseKey: {
    type: String,
    required: false, // Make license key optional for direct creation
    default: ''
  },
  ban: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    required: true
  },
  lastLogin: {
    type: Date
  },
  loginCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Compound index for app and username uniqueness
clientSchema.index({ app: 1, username: 1 }, { unique: true });

// Index for efficient queries
clientSchema.index({ app: 1, licenseKey: 1 });
clientSchema.index({ hwid: 1, app: 1 });

// Hash password before saving
clientSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Virtual for checking if client is expired
clientSchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt;
});

// Virtual for checking if client is active
clientSchema.virtual('isActive').get(function() {
  return !this.ban && !this.isExpired;
});

// Compare password method
clientSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to update login info
clientSchema.methods.updateLoginInfo = function() {
  this.lastLogin = new Date();
  this.loginCount += 1;
  return this.save();
};

// Method to extend expiry
clientSchema.methods.extendExpiry = function(days) {
  const newExpiry = new Date(this.expiresAt);
  newExpiry.setDate(newExpiry.getDate() + days);
  this.expiresAt = newExpiry;
  return this.save();
};

// Transform output (remove sensitive data)
clientSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Ensure virtual fields are serialized
clientSchema.set('toJSON', { virtuals: true });
clientSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Client', clientSchema);