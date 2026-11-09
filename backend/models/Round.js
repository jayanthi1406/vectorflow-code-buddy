const mongoose = require('mongoose');

// Subdocument schema for timer extension history
const timerExtensionSchema = new mongoose.Schema(
  {
    extendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      required: [true, 'Staff reference is required for timer extension'],
    },
    secondsAdded: {
      type: Number,
      required: [true, 'Seconds added is required'],
      min: [1, 'Seconds added must be at least 1'],
    },
    reason: {
      type: String,
      trim: true,
      default: '',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// Subdocument schema for frozen question snapshot
const questionSnapshotSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    statement: {
      type: String,
      required: true,
    },
    constraints: {
      type: [String],
      default: [],
    },
    examples: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    difficulty: {
      type: String,
      enum: ['EASY', 'HARD'],
      required: true,
    },
    levelNumber: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const roundSchema = new mongoose.Schema(
  {
    // Reference to the participating student
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student ID is required'],
      index: true,
    },
    // Level number being attempted (1 to 6)
    levelNumber: {
      type: Number,
      required: [true, 'Level number is required'],
      min: [1, 'Level number cannot be less than 1'],
      max: [6, 'Level number cannot exceed 6'],
      index: true,
    },
    // Reference to the assigned question
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: [true, 'Assigned question ID is required'],
    },
    // Immutable snapshot of the assigned question at the time of allocation
    questionSnapshot: {
      type: questionSnapshotSchema,
      required: [true, 'Question snapshot is required'],
    },
    // Current round status
    status: {
      type: String,
      enum: {
        values: ['ready', 'inProgress', 'timeExpired', 'submitted', 'evaluated', 'abandoned'],
        message: '{VALUE} is not a valid round status',
      },
      default: 'ready',
      index: true,
    },
    // Configured timer duration in seconds (default: 180s = 3 minutes)
    durationSeconds: {
      type: Number,
      default: 180,
      min: [10, 'Duration must be at least 10 seconds'],
    },
    // Official timestamp when volunteer started the round timer
    startedAt: {
      type: Date,
      default: null,
    },
    // Authoritative backend deadline timestamp (startedAt + duration + extensions)
    deadline: {
      type: Date,
      default: null,
      index: true,
    },
    // Log of all timer extensions granted by volunteers
    timerExtensions: {
      type: [timerExtensionSchema],
      default: [],
    },
    // Volunteer staff member who officially started this round
    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      default: null,
    },
    // Timestamp when the round was concluded/evaluated
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index: A student can only have ONE round attempt per level
roundSchema.index({ studentId: 1, levelNumber: 1 }, { unique: true });

// Compile and export Round model
const Round = mongoose.model('Round', roundSchema);

module.exports = Round;

