const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    // Reference to the student owning this transaction
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student ID is required'],
      index: true,
    },
    // Transaction categorization
    type: {
      type: String,
      enum: {
        values: ['STAKE_DEBIT', 'REWARD_CREDIT', 'REFUND', 'SAFE_ZONE_PAYOUT', 'ADMIN_ADJUSTMENT', 'ROUND_SETTLEMENT'],
        message: '{VALUE} is not a valid transaction type',
      },
      required: [true, 'Transaction type is required'],
      index: true,
    },
    // Transaction amount (non-negative magnitude of balance change)
    amount: {
      type: Number,
      required: [true, 'Transaction amount is required'],
      min: [0, 'Transaction amount cannot be negative'],
    },
    // Resulting student wallet balance after this transaction (must not be negative)
    balanceAfter: {
      type: Number,
      required: [true, 'Resulting balance after transaction is required'],
      min: [0, 'Wallet balance after transaction cannot be negative'],
    },
    // Associated level (optional)
    levelNumber: {
      type: Number,
      min: [1, 'Level number cannot be less than 1'],
      max: [6, 'Level number cannot exceed 6'],
      default: null,
    },
    // Associated round (optional)
    roundId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Round',
      default: null,
    },
    // Unique settlement identifier enforcing at most one settlement transaction per round
    settlementKey: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      default: undefined,
    },
    // Human-readable transaction statement description
    description: {
      type: String,
      required: [true, 'Transaction description is required'],
      trim: true,
    },
    // Staff member who authorized/performed this transaction (if admin adjustment)
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      default: null,
    },
    // Official transaction timestamp
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  }
);

// Append-only constraint: prevent updates or modifications to existing ledger entries
transactionSchema.pre('updateOne', function () {
  throw new Error('Transactions are immutable and cannot be updated');
});
transactionSchema.pre('updateMany', function () {
  throw new Error('Transactions are immutable and cannot be updated');
});
transactionSchema.pre('findOneAndUpdate', function () {
  throw new Error('Transactions are immutable and cannot be updated');
});
transactionSchema.pre('deleteOne', function () {
  throw new Error('Transactions are immutable and cannot be deleted');
});
transactionSchema.pre('deleteMany', function () {
  throw new Error('Transactions are immutable and cannot be deleted');
});
transactionSchema.pre('findOneAndDelete', function () {
  throw new Error('Transactions are immutable and cannot be deleted');
});

// Compile and export Transaction model
const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;

