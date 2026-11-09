const mongoose = require('mongoose');

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
    // Staff role
    role: {
      type: String,
      enum: {
        values: ['admin', 'volunteer'],
        message: '{VALUE} is not a valid staff role',
      },
      required: [true, 'Role is required'],
      default: 'volunteer',
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
  }
);

// Prevent password hash from being leaked in JSON responses
staffSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

// Compile and export Staff model
const Staff = mongoose.model('Staff', staffSchema);

module.exports = Staff;

