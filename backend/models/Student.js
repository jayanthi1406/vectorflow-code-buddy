const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    // Google authentication subject identifier
    googleSubjectId: {
      type: String,
      required: [true, 'Google subject ID is required'],
      unique: true,
      trim: true,
      index: true,
    },
    // Student full name
    name: {
      type: String,
      required: [true, 'Student name is required'],
      trim: true,
    },
    // Official college email (must end in @vvce.ac.in)
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
      validate: {
        validator: function (value) {
          return /^[^\s@]+@vvce\.ac\.in$/i.test(value);
        },
        message: (props) => `${props.value} is not a valid VVCE college email address (@vvce.ac.in)`,
      },
    },
    // Email verification status from Google Identity Services
    emailVerified: {
      type: Boolean,
      default: false,
    },
    // Authorization role
    role: {
      type: String,
      enum: {
        values: ['STUDENT'],
        message: '{VALUE} is not a valid student role',
      },
      default: 'STUDENT',
      required: [true, 'Role is required'],
    },
    // University Seat Number (unique per student; required when registration is complete)
    usn: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      index: true,
      required: [
        function () {
          return this.registrationComplete === true;
        },
        'USN is required when registration is complete',
      ],
      validate: {
        validator: function (value) {
          if (!value) return true; // Handled by conditional required validator above
          // Flexible alphanumeric validation (8-15 characters) matching current platform standard
          return /^[A-Z0-9]{8,15}$/i.test(value);
        },
        message: (props) => `${props.value} is not a valid USN format (alphanumeric, 8-15 characters)`,
      },
    },
    // Academic year of study (required when registration is complete)
    year: {
      type: String,
      enum: {
        values: ['1st Year', '2nd Year', '3rd Year', '4th Year'],
        message: '{VALUE} is not a valid academic year',
      },
      trim: true,
      default: null,
      required: [
        function () {
          return this.registrationComplete === true;
        },
        'Academic year is required when registration is complete',
      ],
    },
    // Registration completion status
    registrationComplete: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Current level (1 to 6)
    currentLevel: {
      type: Number,
      default: 1,
      min: [1, 'Current level cannot be less than 1'],
      max: [6, 'Current level cannot exceed 6'],
    },
    // Highest level reached during the competition
    highestLevelReached: {
      type: Number,
      default: 1,
      min: [1, 'Highest level cannot be less than 1'],
      max: [6, 'Highest level cannot exceed 6'],
    },
    // Count of levels cleared successfully
    levelsCleared: {
      type: Number,
      default: 0,
      min: [0, 'Levels cleared cannot be negative'],
      max: [6, 'Levels cleared cannot exceed 6'],
    },
    // Overall student competition status
    competitionStatus: {
      type: String,
      enum: {
        values: ['registered', 'inProgress', 'cleared', 'eliminated', 'completed'],
        message: '{VALUE} is not a valid competition status',
      },
      default: 'registered',
      index: true,
    },
    // Student round availability state for the UI
    roundAvailability: {
      type: String,
      enum: {
        values: [
          'unavailable',
          'ready',
          'inProgress',
          'evaluationPending',
          'cleared',
          'eliminated',
          'completed',
          'insufficientBalance',
        ],
        message: '{VALUE} is not a valid round availability state',
      },
      default: 'ready',
    },
    // Current wallet balance available for staking
    walletBalance: {
      type: Number,
      default: 0,
      min: [0, 'Wallet balance cannot be negative'],
    },
    // Cumulative gross rewards won across all cleared levels (separate neutral aggregate)
    totalEarned: {
      type: Number,
      default: 0,
      min: [0, 'Total earned cannot be negative'],
    },
    // Cumulative amount staked across all entered rounds (separate neutral aggregate)
    totalRisked: {
      type: Number,
      default: 0,
      min: [0, 'Total risked cannot be negative'],
    },
    // Guaranteed earnings secured by clearing safe-zone checkpoints (separate neutral aggregate)
    safeZoneAmount: {
      type: Number,
      default: 0,
      min: [0, 'Safe-zone amount cannot be negative'],
    },
  },
  {
    timestamps: true,
  }
);

// Compile and export Student model
const Student = mongoose.model('Student', studentSchema);

module.exports = Student;