const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema(
  {
    // Reference to the round being evaluated (one evaluation per round)
    roundId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Round',
      required: [true, 'Round ID is required'],
      unique: true,
      index: true,
    },
    // Reference to the evaluated student
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student ID is required'],
      index: true,
    },
    // Reference to the question evaluated
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: [true, 'Question ID is required'],
    },
    // Competition level number
    levelNumber: {
      type: Number,
      required: [true, 'Level number is required'],
      min: [1, 'Level number cannot be less than 1'],
      max: [6, 'Level number cannot exceed 6'],
      index: true,
    },
    // Official grading status
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'PASS', 'FAIL'],
        message: '{VALUE} is not a valid evaluation status',
      },
      default: 'PENDING',
      index: true,
    },
    // Volunteer staff member who conducted the walkthrough evaluation
    evaluatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      default: null,
    },
    // Timestamp when grading decision was recorded
    evaluatedAt: {
      type: Date,
      default: null,
    },
    // Programming language demonstrated by the student (e.g. C, C++, Java, Python)
    programmingLanguage: {
      type: String,
      trim: true,
      default: '',
    },
    // Qualitative evaluation notes or remarks
    volunteerNotes: {
      type: String,
      trim: true,
      default: '',
    },
    // Tracks whether financial wallet settlement has been applied for this evaluation
    isSettled: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Timestamp when wallet settlement was completed
    settledAt: {
      type: Date,
      default: null,
    },
    // Volunteer staff member who performed wallet settlement
    settledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      default: null,
    },
    // Reference to the immutable settlement Transaction record
    settlementTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
    },
    // Tracks whether student progression and statistics have been applied for this evaluation
    isProgressed: {
      type: Boolean,
      default: false,
    },
    // Timestamp when student progression was finalized
    progressedAt: {
      type: Date,
      default: null,
    },
    // Volunteer staff member who finalized progression
    progressedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compile and export Evaluation model
const Evaluation = mongoose.model('Evaluation', evaluationSchema);

module.exports = Evaluation;

