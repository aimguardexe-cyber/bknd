const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['owner', 'reseller'],
    default: 'owner'
  },
  plan: {
    type: String,
    enum: ['free', 'premium'],
    default: 'free'
  },
  maxApps: {
    type: Number,
    default: function() {
      return this.plan === 'premium' ? -1 : 2; // -1 means unlimited
    }
  },
  maxResellers: {
    type: Number,
    default: function() {
      return this.plan === 'premium' ? -1 : 0; // -1 means unlimited, 0 means no resellers for free users
    }
  },
  maxLicensesPerApp: {
    type: Number,
    default: function() {
      return this.plan === 'premium' ? -1 : 30; // -1 means unlimited
    }
  },
  apps: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'App'
  }],
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'paid'],
    default: 'unpaid'
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update limits when plan changes
userSchema.pre('save', function(next) {
  if (this.isModified('plan')) {
    if (this.plan === 'premium') {
      this.maxApps = -1;
      this.maxResellers = -1;
      this.maxLicensesPerApp = -1;
    } else {
      this.maxApps = 2;
      this.maxResellers = 0; // Free users cannot create resellers
      this.maxLicensesPerApp = 30;
    }
  }
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if user can create more apps
userSchema.methods.canCreateApp = function() {
  return this.maxApps === -1 || this.apps.length < this.maxApps;
};

// Check if user can create more resellers
userSchema.methods.canCreateReseller = async function() {
  // Free users cannot create resellers
  if (this.plan === 'free') return false;
  
  // Premium users have unlimited resellers
  if (this.maxResellers === -1) return true;
  
  // Find all apps owned by this user
  const userApps = await mongoose.model('App').find({ owner: this._id }).select('_id');
  const appIds = userApps.map(app => app._id);
  
  // Count resellers for all user's apps
  const resellerCount = await mongoose.model('Reseller').countDocuments({ app: { $in: appIds } });
  return resellerCount < this.maxResellers;
};

// Transform output (remove sensitive data)
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailVerificationToken;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);