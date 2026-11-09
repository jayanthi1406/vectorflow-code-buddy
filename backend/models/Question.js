const mongoose = require('mongoose');

// Subdocument schema for question examples/samples
const exampleSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      trim: true,
      default: '',
    },
    title: {
      type: String,
      trim: true,
      default: '',
    },
    input: {
      type: String,
      required: [true, 'Sample input is required'],
    },
    output: {
      type: String,
      required: [true, 'Sample output is required'],
    },
    explanation: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false }
);

// Subdocument schema for hidden volunteer test cases
const hiddenTestCaseSchema = new mongoose.Schema(
  {
    input: {
      type: String,
      required: [true, 'Test case input is required'],
    },
    expectedOutput: {
      type: String,
      required: [true, 'Expected output is required'],
    },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    // Question title
    title: {
      type: String,
      required: [true, 'Question title is required'],
      trim: true,
    },
    // Detailed problem statement
    statement: {
      type: String,
      required: [true, 'Problem statement is required'],
      trim: true,
    },
    // Problem constraints (e.g. 1 <= N <= 10^5)
    constraints: {
      type: [String],
      default: [],
    },
    // Sample inputs and outputs shown to the student
    examples: {
      type: [exampleSchema],
      default: [],
    },
    // Problem difficulty: EASY for 1st years, HARD for 2nd/3rd/4th years
    difficulty: {
      type: String,
      enum: {
        values: ['EASY', 'HARD'],
        message: '{VALUE} is not a valid difficulty level',
      },
      required: [true, 'Difficulty is required'],
      index: true,
    },
    // Target competition level (1 to 6)
    levelNumber: {
      type: Number,
      required: [true, 'Level number is required'],
      min: [1, 'Level number cannot be less than 1'],
      max: [6, 'Level number cannot exceed 6'],
      index: true,
    },
    // Optional hidden test cases for volunteer code verification
    hiddenTestCases: {
      type: [hiddenTestCaseSchema],
      default: [],
    },
    // Active status flag
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    // Reference to Admin staff who authored/uploaded the question
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient random question selection by level and difficulty
questionSchema.index({ levelNumber: 1, difficulty: 1, isActive: 1 });

// Compile and export Question model
const Question = mongoose.model('Question', questionSchema);

module.exports = Question;

