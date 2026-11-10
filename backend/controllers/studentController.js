const { Transaction, Round, Evaluation, Level } = require('../models');
const {
  formatLevelResponse,
  formatRoundStudentResponse,
  computeTimerFields,
} = require('./roundController');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse and strictly validate page and limit query parameters.
 */
const parsePaginationQuery = (query = {}) => {
  let page = DEFAULT_PAGE;
  let limit = DEFAULT_LIMIT;

  if (query.page !== undefined) {
    const rawPage = String(query.page).trim();
    if (!/^\d+$/.test(rawPage)) {
      return {
        error: {
          status: 400,
          code: 'INVALID_PAGINATION',
          message: "Query parameter 'page' must be a positive integer.",
        },
      };
    }
    page = Number(rawPage);
    if (!Number.isSafeInteger(page) || page < 1) {
      return {
        error: {
          status: 400,
          code: 'INVALID_PAGINATION',
          message: "Query parameter 'page' must be at least 1.",
        },
      };
    }
  }

  if (query.limit !== undefined) {
    const rawLimit = String(query.limit).trim();
    if (!/^\d+$/.test(rawLimit)) {
      return {
        error: {
          status: 400,
          code: 'INVALID_PAGINATION',
          message: "Query parameter 'limit' must be a positive integer.",
        },
      };
    }
    limit = Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return {
        error: {
          status: 400,
          code: 'INVALID_PAGINATION',
          message: `Query parameter 'limit' must be between 1 and ${MAX_LIMIT}.`,
        },
      };
    }
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

/**
 * Build standard pagination metadata for read-only list responses.
 */
const buildPaginationMeta = (page, limit, totalItems) => {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: totalPages > 0 && page < totalPages,
    hasPrevPage: totalPages > 0 && page > 1,
  };
};

/**
 * Format an immutable Transaction ledger record for student consumption.
 * Strictly excludes internal staff IDs (performedBy) and internal settlement keys.
 */
const formatStudentTransactionResponse = (transaction) => ({
  id: (transaction._id || '').toString(),
  type: transaction.type,
  amount: transaction.amount,
  balanceAfter: transaction.balanceAfter,
  levelNumber: transaction.levelNumber ?? null,
  roundId: transaction.roundId ? transaction.roundId.toString() : null,
  description: transaction.description,
  timestamp: transaction.timestamp,
});

/**
 * Format an Evaluation summary safely for the owning student.
 * Strictly excludes internal staff IDs (evaluatedBy, settledBy, progressedBy).
 */
const formatStudentEvaluationSummary = (evaluation) => {
  if (!evaluation) {
    return null;
  }

  const isFinalized = ['PASS', 'FAIL'].includes(evaluation.status);
  return {
    status: evaluation.status,
    remarks: isFinalized ? evaluation.volunteerNotes || '' : '',
    programmingLanguage: isFinalized ? evaluation.programmingLanguage || '' : '',
    evaluatedAt: evaluation.evaluatedAt || null,
    isSettled: Boolean(evaluation.isSettled),
    settledAt: evaluation.settledAt || null,
    isProgressed: Boolean(evaluation.isProgressed),
    progressedAt: evaluation.progressedAt || null,
  };
};

/**
 * Controller: getStudentTransactions
 * Endpoint: GET /api/student/transactions
 * Access: Protected (Student only)
 */
const getStudentTransactions = async (req, res) => {
  try {
    const student = req.student;

    if (!student.registrationComplete) {
      return res.status(403).json({
        success: false,
        code: 'REGISTRATION_INCOMPLETE',
        message: 'Registration must be completed before viewing transaction history.',
      });
    }

    const paginationInput = parsePaginationQuery(req.query);
    if (paginationInput.error) {
      return res.status(paginationInput.error.status).json({
        success: false,
        code: paginationInput.error.code,
        message: paginationInput.error.message,
      });
    }

    const { page, limit, skip } = paginationInput;
    const filter = { studentId: student._id };

    const [transactions, totalItems] = await Promise.all([
      Transaction.find(filter)
        .sort({ timestamp: -1, _id: -1 })
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Transaction history retrieved successfully.',
      walletBalance: student.walletBalance ?? 0,
      totalEarned: student.totalEarned ?? 0,
      totalRisked: student.totalRisked ?? 0,
      safeZoneAmount: student.safeZoneAmount ?? 0,
      count: transactions.length,
      pagination: buildPaginationMeta(page, limit, totalItems),
      transactions: transactions.map(formatStudentTransactionResponse),
    });
  } catch (error) {
    console.error('Error retrieving student transactions:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve transaction history.',
    });
  }
};

/**
 * Controller: getStudentRoundHistory
 * Endpoint: GET /api/student/rounds/history
 * Access: Protected (Student only)
 */
const getStudentRoundHistory = async (req, res) => {
  try {
    const student = req.student;

    if (!student.registrationComplete) {
      return res.status(403).json({
        success: false,
        code: 'REGISTRATION_INCOMPLETE',
        message: 'Registration must be completed before viewing round history.',
      });
    }

    const paginationInput = parsePaginationQuery(req.query);
    if (paginationInput.error) {
      return res.status(paginationInput.error.status).json({
        success: false,
        code: paginationInput.error.code,
        message: paginationInput.error.message,
      });
    }

    const { page, limit, skip } = paginationInput;
    const filter = {
      studentId: student._id,
      status: { $ne: 'abandoned' },
    };

    const [rounds, totalItems] = await Promise.all([
      Round.find(filter)
        .sort({ levelNumber: 1, createdAt: 1, _id: 1 })
        .skip(skip)
        .limit(limit),
      Round.countDocuments(filter),
    ]);

    let evalByRoundId = new Map();
    if (rounds.length > 0) {
      const roundIds = rounds.map((r) => r._id);
      const evaluations = await Evaluation.find({
        roundId: { $in: roundIds },
        studentId: student._id,
      });
      evalByRoundId = new Map(evaluations.map((ev) => [ev.roundId.toString(), ev]));
    }

    const formattedRounds = rounds.map((round) => {
      const publicRound = formatRoundStudentResponse(round, computeTimerFields(round));
      const evaluation = evalByRoundId.get(round._id.toString()) || null;
      return {
        ...publicRound,
        updatedAt: round.updatedAt || null,
        evaluation: formatStudentEvaluationSummary(evaluation),
      };
    });

    return res.status(200).json({
      success: true,
      message: 'Round history retrieved successfully.',
      currentLevel: student.currentLevel,
      competitionStatus: student.competitionStatus,
      count: formattedRounds.length,
      pagination: buildPaginationMeta(page, limit, totalItems),
      rounds: formattedRounds,
    });
  } catch (error) {
    console.error('Error retrieving student round history:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve round history.',
    });
  }
};

/**
 * Controller: getCompetitionConfig
 * Endpoint: GET /api/competition/config
 * Access: Protected (Student only)
 *
 * Returns authoritative six-level configuration without inventing undefined constants.
 */
const getCompetitionConfig = async (req, res) => {
  try {
    const levels = await Level.find({ isActive: true }).sort({ number: 1 });

    if (!levels || levels.length === 0) {
      return res.status(404).json({
        success: false,
        code: 'LEVEL_CONFIGURATION_NOT_FOUND',
        message: 'Active competition level configuration was not found.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Competition configuration retrieved successfully.',
      totalLevels: levels.length,
      levels: levels.map(formatLevelResponse),
    });
  } catch (error) {
    console.error('Error retrieving competition configuration:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve competition configuration.',
    });
  }
};

module.exports = {
  getStudentTransactions,
  getStudentRoundHistory,
  getCompetitionConfig,
};

