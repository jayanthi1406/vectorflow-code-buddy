const mongoose = require('mongoose');

const levelSchema = new mongoose.Schema(
  {
    // Level tier number: 1 to 6
    number: {
      type: Number,
      required: [true, 'Level number is required'],
      unique: true,
      min: [1, 'Level number cannot be less than 1'],
      max: [6, 'Level number cannot exceed 6'],
      index: true,
    },
    // Display name (e.g., 'Level 1', 'Final level')
    name: {
      type: String,
      required: [true, 'Level name is required'],
      trim: true,
    },
    // Entry risk/stake amount. Kept optional (default null) for L5 until finalized
    entryRiskAmount: {
      type: Number,
      min: [0, 'Entry risk amount cannot be negative'],
      default: null,
    },
    // Total secured payout upon winning/passing this level
    winningPayout: {
      type: Number,
      required: [true, 'Winning payout is required'],
      min: [0, 'Winning payout cannot be negative'],
    },
    // Payout upon losing or timer expiry at this level
    losingPayout: {
      type: Number,
      min: [0, 'Losing payout cannot be negative'],
      default: 0,
    },
    // Guaranteed safe-zone earnings locked upon clearing this level
    safeZoneAmount: {
      type: Number,
      min: [0, 'Safe-zone amount cannot be negative'],
      default: 0,
    },
    // Flags whether this level is a designated safe zone checkpoint (L1, L4)
    isSafeZone: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Flags whether this is the final competition level (L6)
    isFinal: {
      type: Boolean,
      default: false,
    },
    // Shared round countdown duration in seconds (default: 180s = 3 minutes)
    durationSeconds: {
      type: Number,
      default: 180,
      min: [10, 'Timer duration must be at least 10 seconds'],
    },
    // Active configuration status
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compile and export Level model
const Level = mongoose.model('Level', levelSchema);

module.exports = Level;

