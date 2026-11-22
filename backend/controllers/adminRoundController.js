const mongoose = require('mongoose');
const { Round, Evaluation, Transaction, Student } = require('../models');
const { formatAdminRoundResponse } = require('./adminMonitoringController');

const OBJECT_ID_HEX_REGEX = /^[0-9a-fA-F]{24}$/;

const createRecoveryError = (status, code, message) => {
  const err = new Error(message);
  err.isRecoveryError = true;
  err.status = status;
  err.code = code;
  return err;
};

/**
 * Guarded In-Place Recovery of an Abandoned Round
 * Endpoint: POST /api/admin/rounds/:roundId/recover
 * Access: Protected (Admin only)
 *
 * Updates the existing Round document atomically inside a transaction session,
 * preserving _id, studentId, levelNumber, questionId, questionSnapshot, durationSeconds,
 * timerExtensions, and unique { studentId, levelNumber } constraints.
 */
const recoverAbandonedRound = async (req, res) => {
  const hasArrayBody = Array.isArray(req.body);
  const bodyKeys = req.body && typeof req.body === 'object' ? Object.keys(req.body) : [];
  if (hasArrayBody || bodyKeys.length > 0) {
    return res.status(400).json({
      success: false,
      code: 'UNSUPPORTED_FIELDS',
      message: hasArrayBody
        ? 'Round recovery requests do not accept an array request body.'
        : `Round recovery requests do not accept request body fields: ${bodyKeys.join(', ')}.`,
    });
  }

  const rawRoundId = req.params?.roundId;
  const trimmedRoundId = typeof rawRoundId === 'string' ? rawRoundId.trim() : '';
  if (!OBJECT_ID_HEX_REGEX.test(trimmedRoundId) || !mongoose.Types.ObjectId.isValid(trimmedRoundId)) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_ROUND_ID',
      message: 'Round ID must be a valid 24-character ObjectId.',
    });
  }

  const session = await mongoose.startSession();
  let recoveryOutput = null;

  try {
    await session.withTransaction(async () => {
      const existingRound = await Round.findById(trimmedRoundId).session(session);
      if (!existingRound) {
        throw createRecoveryError(404, 'ROUND_NOT_FOUND', 'Round record not found.');
      }

      if (existingRound.status !== 'abandoned') {
        throw createRecoveryError(
          409,
          'ROUND_NOT_ABANDONED',
          `Cannot recover round with status '${existingRound.status}'. Only abandoned rounds can be recovered.`
        );
      }

      const [linkedEvaluation, linkedTransaction, owningStudent] = await Promise.all([
        Evaluation.findOne({ roundId: existingRound._id }).session(session),
        Transaction.findOne({ roundId: existingRound._id }).session(session),
        Student.findById(existingRound.studentId).session(session),
      ]);

      if (linkedEvaluation) {
        throw createRecoveryError(
          409,
          'ROUND_HAS_EVALUATION',
          'Cannot recover round because an evaluation record is already linked to it.'
        );
      }

      if (linkedTransaction) {
        throw createRecoveryError(
          409,
          'ROUND_HAS_TRANSACTION',
          'Cannot recover round because a transaction record is already linked to it.'
        );
      }

      if (!owningStudent) {
        throw createRecoveryError(
          404,
          'PARTICIPANT_NOT_FOUND',
          'Owning participant record for this round no longer exists.'
        );
      }

      if (owningStudent.registrationComplete !== true) {
        throw createRecoveryError(
          409,
          'REGISTRATION_INCOMPLETE',
          'Cannot recover round because the participant has not completed registration.'
        );
      }

      if (owningStudent.competitionStatus === 'eliminated') {
        throw createRecoveryError(
          409,
          'STUDENT_ELIMINATED',
          'Cannot recover round because the participant has been eliminated from the competition.'
        );
      }

      if (owningStudent.competitionStatus === 'completed') {
        throw createRecoveryError(
          409,
          'COMPETITION_COMPLETED',
          'Cannot recover round because the participant has already completed the competition.'
        );
      }

      if (owningStudent.currentLevel !== existingRound.levelNumber) {
        throw createRecoveryError(
          409,
          'LEVEL_MISMATCH',
          `Cannot recover Level ${existingRound.levelNumber} round because the participant is currently at Level ${owningStudent.currentLevel}.`
        );
      }

      // Atomic conditional in-place recovery: strictly reset only lifecycle fields.
      const recoveredRound = await Round.findOneAndUpdate(
        {
          _id: existingRound._id,
          status: 'abandoned',
        },
        {
          $set: {
            status: 'ready',
            startedAt: null,
            deadline: null,
            startedBy: null,
            completedAt: null,
          },
        },
        {
          session,
          new: true,
          runValidators: true,
        }
      );

      if (!recoveredRound) {
        const latestRound = await Round.findById(existingRound._id).session(session);
        if (!latestRound) {
          throw createRecoveryError(404, 'ROUND_NOT_FOUND', 'Round record no longer exists.');
        }
        throw createRecoveryError(
          409,
          'ROUND_RECOVERY_CONFLICT',
          `Round could not be recovered because its status concurrently changed to '${latestRound.status}'.`
        );
      }

      recoveryOutput = {
        round: recoveredRound,
        student: owningStudent,
      };
    });

    return res.status(200).json({
      success: true,
      message: `Abandoned round for Level ${recoveryOutput.round.levelNumber} recovered in place and is ready to be started again.`,
      round: formatAdminRoundResponse(recoveryOutput.round, recoveryOutput.student, null),
    });
  } catch (error) {
    if (error && error.isRecoveryError) {
      return res.status(error.status).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    if (
      error &&
      (error.code === 112 ||
        (typeof error.hasErrorLabel === 'function' &&
          error.hasErrorLabel('TransientTransactionError')))
    ) {
      return res.status(409).json({
        success: false,
        code: 'ROUND_RECOVERY_CONFLICT',
        message: 'Concurrent recovery conflict occurred. Please verify round status before retrying.',
      });
    }

    console.error('Admin recover round error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to recover abandoned round.',
    });
  } finally {
    await session.endSession();
  }
};

module.exports = {
  recoverAbandonedRound,
};

