const { Level, Round, Evaluation, Transaction, Student } = require('../models');
const { formatLevelResponse } = require('./roundController');
const { runReadQuery } = require('./adminMonitoringController');

const OPEN_ROUND_STATUSES = ['ready', 'inProgress', 'timeExpired', 'submitted'];
const ACTIVE_COMPETITION_STATUSES = ['registered', 'inProgress', 'cleared'];

const ALLOWED_UPDATE_FIELDS = new Set([
  'name',
  'durationSeconds',
  'entryRiskAmount',
  'winningPayout',
  'losingPayout',
  'safeZoneAmount',
  'isSafeZone',
  'isFinal',
]);

const FINANCIAL_NUMERIC_FIELDS = [
  'entryRiskAmount',
  'winningPayout',
  'losingPayout',
  'safeZoneAmount',
];

const BOOLEAN_CONFIG_FIELDS = ['isSafeZone', 'isFinal'];

const LOCKED_FIELDS_WHEN_USED = [
  'entryRiskAmount',
  'winningPayout',
  'losingPayout',
  'safeZoneAmount',
  'isSafeZone',
  'isFinal',
];

const sendError = (res, status, code, message, extra = {}) =>
  res.status(status).json({
    success: false,
    code,
    message,
    ...extra,
  });

/**
 * Strictly validate `:number` route parameter as an integer between 1 and 6.
 */
const parseLevelParam = (rawNumber) => {
  if (typeof rawNumber !== 'string') {
    return { error: 'Level number must be an integer between 1 and 6.' };
  }
  const trimmed = rawNumber.trim();
  if (!/^[1-6]$/.test(trimmed)) {
    return { error: 'Level number must be an integer between 1 and 6.' };
  }
  return { levelNumber: Number(trimmed) };
};

/**
 * Compute competition usage (`isUsedInCompetition`) and open round state (`hasOpenRounds`)
 * across all levels concurrently without N+1 queries or DB writes.
 */
const getAllLevelUsageFlags = async () => {
  const [roundRows, evalRows, txRows] = await Promise.all([
    Round.aggregate([
      {
        $group: {
          _id: '$levelNumber',
          totalCount: { $sum: 1 },
          openCount: {
            $sum: {
              $cond: [{ $in: ['$status', OPEN_ROUND_STATUSES] }, 1, 0],
            },
          },
        },
      },
    ]),
    Evaluation.aggregate([
      {
        $group: {
          _id: '$levelNumber',
          count: { $sum: 1 },
        },
      },
    ]),
    Transaction.aggregate([
      { $match: { levelNumber: { $in: [1, 2, 3, 4, 5, 6] } } },
      {
        $group: {
          _id: '$levelNumber',
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const usageByLevel = new Map();
  for (let lvl = 1; lvl <= 6; lvl += 1) {
    usageByLevel.set(lvl, { isUsedInCompetition: false, hasOpenRounds: false });
  }

  for (const row of Array.isArray(roundRows) ? roundRows : []) {
    const lvl = Number(row?._id);
    if (usageByLevel.has(lvl)) {
      const entry = usageByLevel.get(lvl);
      if ((Number(row.totalCount) || 0) > 0) entry.isUsedInCompetition = true;
      if ((Number(row.openCount) || 0) > 0) entry.hasOpenRounds = true;
    }
  }

  for (const row of [...(Array.isArray(evalRows) ? evalRows : []), ...(Array.isArray(txRows) ? txRows : [])]) {
    const lvl = Number(row?._id);
    if (usageByLevel.has(lvl) && (Number(row?.count) || 0) > 0) {
      usageByLevel.get(lvl).isUsedInCompetition = true;
    }
  }

  return usageByLevel;
};

/**
 * Compute usage & open-round flags for a single level concurrently (read-only).
 */
const getSingleLevelUsageFlags = async (levelNumber) => {
  const [roundCount, openRoundCount, evalCount, txCount] = await Promise.all([
    Round.countDocuments({ levelNumber }),
    Round.countDocuments({ levelNumber, status: { $in: OPEN_ROUND_STATUSES } }),
    Evaluation.countDocuments({ levelNumber }),
    Transaction.countDocuments({ levelNumber }),
  ]);

  return {
    isUsedInCompetition:
      (Number(roundCount) || 0) > 0 ||
      (Number(evalCount) || 0) > 0 ||
      (Number(txCount) || 0) > 0,
    hasOpenRounds: (Number(openRoundCount) || 0) > 0,
  };
};

/**
 * Format Level document consistently for Admin endpoints, reusing formatLevelResponse().
 */
const formatAdminLevelResponse = (level, flags = {}) => ({
  id: level._id ? level._id.toString() : '',
  ...formatLevelResponse(level),
  isActive: Boolean(level.isActive),
  isUsedInCompetition: Boolean(flags.isUsedInCompetition),
  hasOpenRounds: Boolean(flags.hasOpenRounds),
  createdAt: level.createdAt || null,
  updatedAt: level.updatedAt || null,
});

/**
 * Strictly validate PUT /api/admin/levels/:number payload without silent coercions or ignored fields.
 */
const validateLevelUpdatePayload = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) {
    return {
      error: {
        status: 400,
        code: 'EMPTY_UPDATE_PAYLOAD',
        message: 'At least one allowed level configuration field must be provided.',
      },
    };
  }

  if (Object.prototype.hasOwnProperty.call(body, 'number')) {
    return {
      error: {
        status: 400,
        code: 'IMMUTABLE_LEVEL_NUMBER',
        message: 'Level number is immutable and cannot be modified.',
      },
    };
  }

  const unsupportedKeys = Object.keys(body).filter((key) => !ALLOWED_UPDATE_FIELDS.has(key));
  if (unsupportedKeys.length > 0) {
    return {
      error: {
        status: 400,
        code: 'UNSUPPORTED_FIELDS',
        message: `Unsupported field(s): ${unsupportedKeys.join(', ')}. Allowed fields: ${Array.from(ALLOWED_UPDATE_FIELDS).join(', ')}.`,
      },
    };
  }

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      return {
        error: {
          status: 400,
          code: 'INVALID_LEVEL_NAME',
          message: 'Level name must be a non-empty string.',
        },
      };
    }
    updates.name = body.name.trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, 'durationSeconds')) {
    const val = body.durationSeconds;
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      return {
        error: {
          status: 400,
          code: 'INVALID_FIELD_TYPE',
          message: 'durationSeconds must be a finite number.',
        },
      };
    }
    if (val < 10) {
      return {
        error: {
          status: 400,
          code: 'INVALID_DURATION_SECONDS',
          message: 'durationSeconds must be at least 10 seconds.',
        },
      };
    }
    updates.durationSeconds = val;
  }

  for (const field of FINANCIAL_NUMERIC_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      const val = body[field];
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        return {
          error: {
            status: 400,
            code: 'INVALID_FIELD_TYPE',
            message: `${field} must be a finite number.`,
          },
        };
      }
      if (val < 0) {
        return {
          error: {
            status: 400,
            code: 'NEGATIVE_FINANCIAL_VALUE',
            message: `${field} cannot be negative.`,
          },
        };
      }
      updates[field] = val;
    }
  }

  for (const field of BOOLEAN_CONFIG_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      const val = body[field];
      if (typeof val !== 'boolean') {
        return {
          error: {
            status: 400,
            code: 'INVALID_FIELD_TYPE',
            message: `${field} must be a boolean.`,
          },
        };
      }
      updates[field] = val;
    }
  }

  return { updates };
};

/**
 * List All Competition Levels (Ordered L1-L6, Read-Only)
 * Endpoint: GET /api/admin/levels
 * Access: Protected (Admin only)
 */
const listLevels = async (req, res) => {
  try {
    const [rawLevels, usageByLevel] = await Promise.all([
      runReadQuery(Level.find({}), { sort: { number: 1 }, lean: true }),
      getAllLevelUsageFlags(),
    ]);

    const sortedLevels = (Array.isArray(rawLevels) ? [...rawLevels] : []).sort(
      (a, b) => (Number(a.number) || 0) - (Number(b.number) || 0)
    );

    const levels = sortedLevels.map((lvl) =>
      formatAdminLevelResponse(
        lvl,
        usageByLevel.get(Number(lvl.number)) || { isUsedInCompetition: false, hasOpenRounds: false }
      )
    );

    return res.status(200).json({
      success: true,
      message: 'Competition levels retrieved successfully.',
      totalLevels: levels.length,
      levels,
    });
  } catch (error) {
    console.error('Admin list levels error:', error.message);
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to retrieve competition levels.');
  }
};

/**
 * Update Level Configuration
 * Endpoint: PUT /api/admin/levels/:number
 * Access: Protected (Admin only)
 */
const updateLevel = async (req, res) => {
  try {
    const { levelNumber, error: paramError } = parseLevelParam(req.params?.number);
    if (paramError) {
      return sendError(res, 400, 'INVALID_LEVEL_NUMBER', paramError);
    }

    const validation = validateLevelUpdatePayload(req.body);
    if (validation.error) {
      return sendError(res, validation.error.status, validation.error.code, validation.error.message);
    }

    const { updates } = validation;
    const level = await Level.findOne({ number: levelNumber });
    if (!level) {
      return sendError(
        res,
        404,
        'LEVEL_NOT_FOUND',
        `Level ${levelNumber} configuration was not found.`
      );
    }

    // Validate safeZoneAmount <= winningPayout using effective resulting values
    const effectiveSafeZoneAmount = Object.prototype.hasOwnProperty.call(updates, 'safeZoneAmount')
      ? updates.safeZoneAmount
      : level.safeZoneAmount ?? 0;
    const effectiveWinningPayout = Object.prototype.hasOwnProperty.call(updates, 'winningPayout')
      ? updates.winningPayout
      : level.winningPayout;

    if (
      typeof effectiveWinningPayout === 'number' &&
      effectiveSafeZoneAmount > effectiveWinningPayout
    ) {
      return sendError(
        res,
        400,
        'INVALID_SAFE_ZONE_AMOUNT',
        'safeZoneAmount cannot exceed winningPayout.'
      );
    }

    const usageFlags = await getSingleLevelUsageFlags(levelNumber);

    if (usageFlags.isUsedInCompetition) {
      const changedLockedFields = LOCKED_FIELDS_WHEN_USED.filter((field) => {
        if (!Object.prototype.hasOwnProperty.call(updates, field)) {
          return false;
        }
        const existingValue =
          BOOLEAN_CONFIG_FIELDS.includes(field) ? Boolean(level[field]) : level[field];
        return updates[field] !== existingValue;
      });

      if (changedLockedFields.length > 0) {
        return sendError(
          res,
          409,
          'LEVEL_CONFIGURATION_LOCKED',
          `Level ${levelNumber} has already been used in the competition. Cannot modify locked financial or structural field(s): ${changedLockedFields.join(', ')}.`,
          { lockedFields: changedLockedFields }
        );
      }
    }

    for (const [key, value] of Object.entries(updates)) {
      level[key] = value;
    }

    await level.save();

    return res.status(200).json({
      success: true,
      message: `Level ${levelNumber} configuration updated successfully.`,
      level: formatAdminLevelResponse(level, usageFlags),
    });
  } catch (error) {
    console.error('Admin update level error:', error.message);
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to update level configuration.');
  }
};

/**
 * Activate a Competition Level
 * Endpoint: PATCH /api/admin/levels/:number/activate
 * Access: Protected (Admin only)
 */
const activateLevel = async (req, res) => {
  try {
    const { levelNumber, error: paramError } = parseLevelParam(req.params?.number);
    if (paramError) {
      return sendError(res, 400, 'INVALID_LEVEL_NUMBER', paramError);
    }

    const level = await Level.findOne({ number: levelNumber });
    if (!level) {
      return sendError(
        res,
        404,
        'LEVEL_NOT_FOUND',
        `Level ${levelNumber} configuration was not found.`
      );
    }

    level.isActive = true;
    await level.save();

    const usageFlags = await getSingleLevelUsageFlags(levelNumber);

    return res.status(200).json({
      success: true,
      message: `Level ${levelNumber} activated successfully.`,
      level: formatAdminLevelResponse(level, usageFlags),
    });
  } catch (error) {
    console.error('Admin activate level error:', error.message);
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to activate level.');
  }
};

/**
 * Deactivate a Competition Level (Guarded Against In-Use Competition State)
 * Endpoint: PATCH /api/admin/levels/:number/deactivate
 * Access: Protected (Admin only)
 */
const deactivateLevel = async (req, res) => {
  try {
    const { levelNumber, error: paramError } = parseLevelParam(req.params?.number);
    if (paramError) {
      return sendError(res, 400, 'INVALID_LEVEL_NUMBER', paramError);
    }

    const level = await Level.findOne({ number: levelNumber });
    if (!level) {
      return sendError(
        res,
        404,
        'LEVEL_NOT_FOUND',
        `Level ${levelNumber} configuration was not found.`
      );
    }

    const [
      openRoundsCount,
      incompleteEvaluationsCount,
      activeParticipantsCount,
      usageFlags,
    ] = await Promise.all([
      Round.countDocuments({ levelNumber, status: { $in: OPEN_ROUND_STATUSES } }),
      Evaluation.countDocuments({
        levelNumber,
        $or: [{ isSettled: { $ne: true } }, { isProgressed: { $ne: true } }],
      }),
      Student.countDocuments({
        currentLevel: levelNumber,
        registrationComplete: { $ne: false },
        competitionStatus: { $in: ACTIVE_COMPETITION_STATUSES },
      }),
      getSingleLevelUsageFlags(levelNumber),
    ]);

    const openRounds = Number(openRoundsCount) || 0;
    const incompleteEvaluations = Number(incompleteEvaluationsCount) || 0;
    const activeParticipants = Number(activeParticipantsCount) || 0;

    if (openRounds > 0 || incompleteEvaluations > 0 || activeParticipants > 0) {
      const reasons = [];
      if (openRounds > 0) {
        reasons.push(`${openRounds} open round(s) (ready, inProgress, timeExpired, or submitted)`);
      }
      if (incompleteEvaluations > 0) {
        reasons.push(`${incompleteEvaluations} unsettled or unprogressed evaluation(s)`);
      }
      if (activeParticipants > 0) {
        reasons.push(`${activeParticipants} active participant(s) currently at Level ${levelNumber}`);
      }

      return sendError(
        res,
        409,
        'LEVEL_IN_USE',
        `Cannot deactivate Level ${levelNumber}: ${reasons.join('; ')}.`,
        {
          blockers: {
            openRoundsCount: openRounds,
            incompleteEvaluationsCount: incompleteEvaluations,
            activeParticipantsCount: activeParticipants,
          },
        }
      );
    }

    level.isActive = false;
    await level.save();

    return res.status(200).json({
      success: true,
      message: `Level ${levelNumber} deactivated successfully.`,
      level: formatAdminLevelResponse(level, usageFlags),
    });
  } catch (error) {
    console.error('Admin deactivate level error:', error.message);
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to deactivate level.');
  }
};

module.exports = {
  listLevels,
  updateLevel,
  activateLevel,
  deactivateLevel,
  parseLevelParam,
  validateLevelUpdatePayload,
  formatAdminLevelResponse,
};

