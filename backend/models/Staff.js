const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const staffSchema = new mongoose.Schema(
  {
    // Full name of the staff member
    name: {
      type: String,
      required: [true, 'Staff name is required'],
      trim: true,
    },
    // Unique username for credential login
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
      minlength: [3, 'Username must be at least 3 characters long'],
      match: [/^[a-z0-9_.-]+$/i, 'Username can only contain alphanumeric characters, underscores, dots, and hyphens'],
    },
    // Securely hashed password (never plain text)
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },
    // Staff role (discriminator key for ADMIN and VOLUNTEER models)
    role: {
      type: String,
      enum: {
        values: ['ADMIN', 'VOLUNTEER'],
        message: '{VALUE} is not a valid staff role',
      },
      set: (val) => (typeof val === 'string' ? val.toUpperCase() : val),
      required: [true, 'Role is required'],
      default: 'VOLUNTEER',
      index: true,
    },
    // Account active status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    // Optional lab or station assigned to the volunteer
    assignedLab: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
    discriminatorKey: 'role',
  }
);

// Prevent password hash from being leaked in JSON and object transforms
staffSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

staffSchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

/**
 * Compare plain candidate password against securely hashed password
 */
staffSchema.methods.comparePassword = async function (candidatePassword) {
  if (!candidatePassword || !this.passwordHash) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

/**
 * Static helper to hash a plain password using bcrypt (10 rounds)
 */
staffSchema.statics.hashPassword = async function (plainPassword) {
  const saltRounds = 10;
  return bcrypt.hash(plainPassword, saltRounds);
};

// Compile and export Staff base model
const Staff = mongoose.models.Staff || mongoose.model('Staff', staffSchema);

module.exports = Staff;