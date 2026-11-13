const mongoose = require('mongoose');
const { Student, Round, Evaluation, Transaction, Question, Volunteer } = require('../models');
const { parsePaginationQuery, buildPaginationMeta } = require('./studentController');
const { computeTimerFields } = require('./roundController');
const { escapeRegex } = require('./adminController');

const MAX_SEARCH_LENGTH = 100;
const OBJECT_ID_HEX_REGEX = /^[0-9a-fA-F]{24}$/;
const USN_REGEX = /^[A-Z0-9]{8,15}$/;

const VALID_YEARS = new Set(['1st Year', '2nd Year', '3rd Year', '4th Year']);
const VALID_COMPETITION_STATUSES = new Set([
  'registered',
  'inProgress',
  'cleared',
  'eliminated',
  'completed',
]);
const VALID_ROUND_STATUSES = new Set([
  'ready',
  'inProgress',
  'timeExpired',
  'submitted',
  'evaluated',
  'abandoned',
]);
const VALID_EVALUATION_STATUSES = new Set(['PENDING', 'PASS', 'FAIL']);
const VALID_TRANSACTION_TYPES = new Set([
  'STAKE_DEBIT',
  'REWARD_CREDIT',
  'REFUND',
  'SAFE_ZONE_PAYOUT',
  'ADMIN_ADJUSTMENT',
  'ROUND_SETTLEMENT',
]);

// Explicit projections omit sensitive auth, staff audit IDs, notes, hidden tests, and internal keys.
const SAFE_STUDENT_SELECT =
  '_id name usn year registrationComplete currentLevel highestLevelReached levelsCleared competitionStatus roundAvailability walletBalance totalEarned totalRisked safeZoneAmount createdAt updatedAt';
const SAFE_STUDENT_BRIEF_SELECT = '_id name usn year currentLevel competitionStatus';
const SAFE_ROUND_SELECT =
  '_id studentId levelNumber questionId questionSnapshot status durationSeconds startedAt deadline completedAt createdAt updatedAt';
const SAFE_EVALUATION_SELECT =
  '_id roundId studentId questionId levelNumber status evaluatedAt programmingLanguage isSettled settledAt isProgressed progressedAt createdAt updatedAt';
const SAFE_TRANSACTION_SELECT =
  '_id studentId type amount balanceAfter levelNumber roundId description timestamp';

/**
 * Execute a Mongoose query safely while tolerating lightweight unit-test query mocks.
 */
const runReadQuery = async (
  query,
  { select = null, sort = null, skip = null, limit = null, lean = true } = {}
) => {
  if (!query) {
    return query;
  }

  let current = query;
  if (select && typeof current.select === 'function') {
    current = current.select(select);
  }
  if (sort && typeof current.sort === 'function') {
    current = current.sort(sort);
  }
  if (skip !== null && skip !== undefined && typeof current.skip === 'function') {
    current = current.skip(skip);
  }
  if (limit !== null && limit !== undefined && typeof current.limit === 'function') {
    current = current.limit(limit);
  }
  if (lean && typeof current.lean === 'function') {
    current = current.lean();
  }

  return await current;
};

const sendValidationError = (res, error) =>
  res.status(error.status).json({
    success: false,
    code: error.code,
    message: error.message,
  });

const parseSafePagination = (query = {}) => {
  const unsafeKey = Object.keys(query).find((key) => /[\$\[\]]/.test(key));
  if (unsafeKey) {
    return {
      error: {
        status: 400,
        code: 'INVALID_QUERY_PARAMETER',
        message: 'Malformed or nested query parameters are not permitted.',
      },
    };
  }
  return parsePaginationQuery(query);
};

/**
 * Validate a single string enum query parameter strictly (rejects arrays/objects from query pollution).
 */
const validateEnumFilter = (
  rawValue,
  validSet,
  code,
  label,
  { normalizeUpper = false } = {}
) => {
  if (rawValue === undefined) {
    return { provided: false };
  }
  if (typeof rawValue !== 'string') {
    return {
      error: {
        status: 400,
        code,
        message: `${label} filter must be a string.`,
      },
    };
  }

  const trimmed = rawValue.trim();
  const candidate = normalizeUpper ? trimmed.toUpperCase() : trimmed;
  if (!validSet.has(candidate)) {
    return {
      error: {
        status: 400,
        code,
        message: `${label} filter must be one of: ${Array.from(validSet).join(', ')}.`,
      },
    };
  }

  return { provided: true, value: candidate };
};

const validateBooleanFilter = (rawValue, code, label) => {
  if (rawValue === undefined) {
    return { provided: false };
  }
  if (typeof rawValue !== 'string') {
    return {
      error: {
        status: 400,
        code,
        message: `${label} filter must be either 'true' or 'false'.`,
      },
    };
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized !== 'true' && normalized !== 'false') {
    return {
      error: {
        status: 400,
        code,
        message: `${label} filter must be either 'true' or 'false'.`,
      },
    };
  }

  return { provided: true, value: normalized === 'true' };
};

const validateLevelFilter = (rawValue, paramName = 'levelNumber') => {
  if (rawValue === undefined) {
    return { provided: false };
  }
  if (typeof rawValue !== 'string') {
    return {
      error: {
        status: 400,
        code: 'INVALID_LEVEL_FILTER',
        message: `${paramName} filter must be an integer between 1 and 6.`,
      },
    };
  }

  const trimmed = rawValue.trim();
  if (!/^[1-6]$/.test(trimmed)) {
    return {
      error: {
        status: 400,
        code: 'INVALID_LEVEL_FILTER',
        message: `${paramName} filter must be an integer between 1 and 6.`,
      },
    };
  }

  return { provided: true, value: Number(trimmed) };
};

const validateUsnFilter = (rawValue) => {
  if (rawValue === undefined) {
    return { provided: false };
  }
  if (typeof rawValue !== 'string') {
    return {
      error: {
        status: 400,
        code: 'INVALID_USN_FILTER',
        message: 'USN filter must be an 8-15 character alphanumeric string.',
      },
    };
  }

  const normalized = rawValue.trim().toUpperCase();
  if (!USN_REGEX.test(normalized)) {
    return {
      error: {
        status: 400,
        code: 'INVALID_USN_FILTER',
        message: 'USN filter must be an 8-15 character alphanumeric string.',
      },
    };
  }

  return { provided: true, value: normalized };
};

const validateSearchQuery = (rawValue) => {
  if (rawValue === undefined) {
    return { provided: false };
  }
  if (typeof rawValue !== 'string') {
    return {
      error: {
        status: 400,
        code: 'INVALID_SEARCH_QUERY',
        message: 'Search query must be a string.',
      },
    };
  }

  const trimmed = rawValue.trim();
  if (trimmed.length > MAX_SEARCH_LENGTH) {
    return {
      error: {
        status: 400,
        code: 'INVALID_SEARCH_QUERY',
        message: `Search query must not exceed ${MAX_SEARCH_LENGTH} characters.`,
      },
    };
  }

  if (trimmed === '') {
    return { provided: false };
  }

  return {
    provided: true,
    trimmed,
    regex: new RegExp(escapeRegex(trimmed), 'i'),
  };
};

/**
 * Resolve a participant strictly by 24-hex ObjectId or normalized 8-15 char USN.
 * Checking 24-hex format first avoids BSON ObjectId.isValid() returning true for 12-char ASCII USNs.
 */
const resolveParticipantByIdentifier = async (rawIdentifier) => {
  if (typeof rawIdentifier !== 'string') {
    return {
      error: {
        status: 400,
        code: 'INVALID_PARTICIPANT_IDENTIFIER',
        message: 'Participant identifier must be a valid student ID or USN.',
      },
    };
  }

  const trimmed = rawIdentifier.trim();
  if (!trimmed) {
    return {
      error: {
        status: 400,
        code: 'INVALID_PARTICIPANT_IDENTIFIER',
        message: 'Participant identifier must be a valid student ID or USN.',
      },
    };
  }

  let query;
  if (OBJECT_ID_HEX_REGEX.test(trimmed) && mongoose.Types.ObjectId.isValid(trimmed)) {
    query = { _id: trimmed };
  } else {
    const normalizedUsn = trimmed.toUpperCase();
    if (!USN_REGEX.test(normalizedUsn)) {
      return {
        error: {
          status: 400,
          code: 'INVALID_PARTICIPANT_IDENTIFIER',
          message:
            'Participant identifier must be a 24-character ObjectId or an 8-15 character alphanumeric USN.',
        },
      };
    }
    query = { usn: normalizedUsn };
  }

  const student = await runReadQuery(Student.findOne(query), {
    select: SAFE_STUDENT_SELECT,
    lean: true,
  });

  if (!student) {
    return {
      error: {
        status: 404,
        code: 'PARTICIPANT_NOT_FOUND',
        message: 'Participant not found.',
      },
    };
  }

  return { student };
};

const fetchStudentMapByIds = async (studentIds) => {
  const uniqueIds = Array.from(
    new Set(
      studentIds
        .filter(Boolean)
        .map((id) => id.toString())
    )
  );
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const students = await runReadQuery(
    Student.find({ _id: { $in: uniqueIds } }),
    { select: SAFE_STUDENT_BRIEF_SELECT, lean: true }
  );

  return new Map(
    (Array.isArray(students) ? students : []).map((s) => [s._id.toString(), s])
  );
};

const fetchEvaluationMapByRoundIds = async (roundIds, extraFilter = {}) => {
  const uniqueRoundIds = Array.from(
    new Set(
      roundIds
        .filter(Boolean)
        .map((id) => id.toString())
    )
  );
  if (uniqueRoundIds.length === 0) {
    return new Map();
  }

  const evaluations = await runReadQuery(
    Evaluation.find({ roundId: { $in: uniqueRoundIds }, ...extraFilter }),
    { select: SAFE_EVALUATION_SELECT, lean: true }
  );

  return new Map(
    (Array.isArray(evaluations) ? evaluations : []).map((ev) => [
      ev.roundId.toString(),
      ev,
    ])
  );
};

// Explicit allowlist formatters guarantee sensitive DB/staff fields never leak even on unprojected mocks.
const formatAdminParticipantSummary = (student) => ({
  id: student._id ? student._id.toString() : '',
  name: student.name || '',
  usn: student.usn || null,
  year: student.year || null,
  registrationComplete: Boolean(student.registrationComplete),
  currentLevel: student.currentLevel ?? 1,
  highestLevelReached: student.highestLevelReached ?? 1,
  levelsCleared: student.levelsCleared ?? 0,
  competitionStatus: student.competitionStatus || 'registered',
  roundAvailability: student.roundAvailability || 'UNAVAILABLE',
  walletBalance: student.walletBalance ?? 0,
  totalEarned: student.totalEarned ?? 0,
  totalRisked: student.totalRisked ?? 0,
  safeZoneAmount: student.safeZoneAmount ?? 0,
  isCompleted: student.competitionStatus === 'completed',
  createdAt: student.createdAt || null,
  updatedAt: student.updatedAt || null,
});

const formatAdminParticipantBrief = (participant) =>
  participant
    ? {
        id: participant._id ? participant._id.toString() : '',
        name: participant.name || '',
        usn: participant.usn || null,
        year: participant.year || null,
        currentLevel: participant.currentLevel ?? 1,
        competitionStatus: participant.competitionStatus || 'registered',
      }
    : null;

const formatAdminEvaluationSummary = (evaluation) => {
  if (!evaluation) {
    return {
      status: 'PENDING',
      programmingLanguage: null,
      evaluatedAt: null,
      isSettled: false,
      settledAt: null,
      isProgressed: false,
      progressedAt: null,
    };
  }

  return {
    status: evaluation.status || 'PENDING',
    programmingLanguage: evaluation.programmingLanguage || null,
    evaluatedAt: evaluation.evaluatedAt || null,
    isSettled: Boolean(evaluation.isSettled),
    settledAt: evaluation.settledAt || null,
    isProgressed: Boolean(evaluation.isProgressed),
    progressedAt: evaluation.progressedAt || null,
  };
};

const formatAdminRoundResponse = (round, participant = null, evaluation = null) => {
  const snap = round.questionSnapshot || {};
  const timer = computeTimerFields(round);

  return {
    id: round._id ? round._id.toString() : '',
    levelNumber: round.levelNumber,
    status: round.status,
    durationSeconds: round.durationSeconds ?? 0,
    startedAt: round.startedAt || null,
    deadline: round.deadline || null,
    remainingSeconds: timer.remainingSeconds,
    isExpired: timer.isExpired,
    completedAt: round.completedAt || null,
    createdAt: round.createdAt || null,
    updatedAt: round.updatedAt || null,
    participant: formatAdminParticipantBrief(participant),
    question: {
      questionId: snap.questionId
        ? snap.questionId.toString()
        : round.questionId
          ? round.questionId.toString()
          : null,
      title: snap.title ?? '',
      statement: snap.statement ?? '',
      constraints: snap.constraints ?? '',
      examples: Array.isArray(snap.examples) ? snap.examples : [],
      difficulty: snap.difficulty ?? null,
      levelNumber: snap.levelNumber ?? round.levelNumber ?? null,
    },
    evaluation: formatAdminEvaluationSummary(evaluation),
  };
};

const formatAdminTransactionResponse = (transaction, participant = null) => ({
  id: transaction._id ? transaction._id.toString() : '',
  type: transaction.type,
  amount: transaction.amount,
  balanceAfter: transaction.balanceAfter,
  levelNumber: transaction.levelNumber ?? null,
  roundId: transaction.roundId ? transaction.roundId.toString() : null,
  description: transaction.description || '',
  timestamp: transaction.timestamp || null,
  participant: formatAdminParticipantBrief(participant),
});

/**
 * List Registered / Participating Students (Read-Only)
 * Endpoint: GET /api/admin/participants
 * Access: Protected (Admin only)
 */
const listParticipants = async (req, res) => {
  try {
    const query = req.query || {};

    const paginationInput = parseSafePagination(query);
    if (paginationInput.error) {
      return sendValidationError(res, paginationInput.error);
    }

    const yearCheck = validateEnumFilter(
      query.year,
      VALID_YEARS,
      'INVALID_YEAR_FILTER',
      'Academic year'
    );
    if (yearCheck.error) return sendValidationError(res, yearCheck.error);

    const statusCheck = validateEnumFilter(
      query.competitionStatus,
      VALID_COMPETITION_STATUSES,
      'INVALID_STATUS_FILTER',
      'Competition status'
    );
    if (statusCheck.error) return sendValidationError(res, statusCheck.error);

    const regCheck = validateBooleanFilter(
      query.registrationComplete,
      'INVALID_REGISTRATION_FILTER',
      'registrationComplete'
    );
    if (regCheck.error) return sendValidationError(res, regCheck.error);

    const levelCheck = validateLevelFilter(query.currentLevel, 'currentLevel');
    if (levelCheck.error) return sendValidationError(res, levelCheck.error);

    const searchCheck = validateSearchQuery(query.search);
    if (searchCheck.error) return sendValidationError(res, searchCheck.error);

    const filter = {};
    if (yearCheck.provided) filter.year = yearCheck.value;
    if (statusCheck.provided) filter.competitionStatus = statusCheck.value;
    if (regCheck.provided) filter.registrationComplete = regCheck.value;
    if (levelCheck.provided) filter.currentLevel = levelCheck.value;
    if (searchCheck.provided) {
      filter.$or = [
        { name: searchCheck.regex },
        { usn: searchCheck.regex },
      ];
    }

    const { page, limit, skip } = paginationInput;
    const [students, totalItems] = await Promise.all([
      runReadQuery(Student.find(filter), {
        select: SAFE_STUDENT_SELECT,
        sort: { createdAt: -1, _id: -1 },
        skip,
        limit,
        lean: true,
      }),
      Student.countDocuments(filter),
    ]);

    const participantList = Array.isArray(students) ? students : [];
    return res.status(200).json({
      success: true,
      message: 'Participants retrieved successfully.',
      count: participantList.length,
      pagination: buildPaginationMeta(page, limit, totalItems),
      participants: participantList.map(formatAdminParticipantSummary),
    });
  } catch (error) {
    console.error('Admin list participants error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve participants.',
    });
  }
};

/**
 * View Single Participant Details & Competition Summary (Read-Only)
 * Endpoint: GET /api/admin/participants/:identifier
 * Access: Protected (Admin only)
 */
const getParticipantDetails = async (req, res) => {
  try {
    const resolved = await resolveParticipantByIdentifier(req.params?.identifier);
    if (resolved.error) {
      return sendValidationError(res, resolved.error);
    }

    const { student } = resolved;
    const [rawRounds, rawEvaluations, rawTransactions] = await Promise.all([
      runReadQuery(Round.find({ studentId: student._id }), {
        select: '_id levelNumber status',
        lean: true,
      }),
      runReadQuery(Evaluation.find({ studentId: student._id }), {
        select: '_id roundId status',
        lean: true,
      }),
      runReadQuery(Transaction.find({ studentId: student._id }), {
        select: '_id type amount',
        lean: true,
      }),
    ]);

    const rounds = Array.isArray(rawRounds) ? rawRounds : [];
    const evaluations = Array.isArray(rawEvaluations) ? rawEvaluations : [];
    const transactions = Array.isArray(rawTransactions) ? rawTransactions : [];

    const roundCountsByStatus = {
      ready: 0,
      inProgress: 0,
      timeExpired: 0,
      submitted: 0,
      evaluated: 0,
      abandoned: 0,
    };
    for (const round of rounds) {
      if (round.status && Object.prototype.hasOwnProperty.call(roundCountsByStatus, round.status)) {
        roundCountsByStatus[round.status] += 1;
      }
    }

    const evaluationCountsByStatus = {
      PENDING: 0,
      PASS: 0,
      FAIL: 0,
    };
    const evalByRoundId = new Map();
    for (const evaluation of evaluations) {
      if (evaluation.roundId) {
        evalByRoundId.set(evaluation.roundId.toString(), evaluation);
      }
      if (
        evaluation.status &&
        Object.prototype.hasOwnProperty.call(evaluationCountsByStatus, evaluation.status)
      ) {
        evaluationCountsByStatus[evaluation.status] += 1;
      }
    }
    // Non-abandoned rounds with no Evaluation document yet are derived as PENDING.
    for (const round of rounds) {
      if (
        round.status !== 'abandoned' &&
        round._id &&
        !evalByRoundId.has(round._id.toString())
      ) {
        evaluationCountsByStatus.PENDING += 1;
      }
    }

    const transactionTotalsByType = {};
    for (const txType of VALID_TRANSACTION_TYPES) {
      transactionTotalsByType[txType] = { count: 0, totalAmount: 0 };
    }
    for (const tx of transactions) {
      if (tx.type && transactionTotalsByType[tx.type]) {
        transactionTotalsByType[tx.type].count += 1;
        transactionTotalsByType[tx.type].totalAmount += Number(tx.amount) || 0;
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Participant details retrieved successfully.',
      participant: formatAdminParticipantSummary(student),
      wallet: {
        walletBalance: student.walletBalance ?? 0,
        totalEarned: student.totalEarned ?? 0,
        totalRisked: student.totalRisked ?? 0,
        safeZoneAmount: student.safeZoneAmount ?? 0,
      },
      summary: {
        totalRounds: rounds.length,
        completedRounds: roundCountsByStatus.evaluated,
        roundCountsByStatus,
        evaluationCountsByStatus,
        totalTransactions: transactions.length,
        transactionTotalsByType,
      },
    });
  } catch (error) {
    console.error('Admin get participant details error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve participant details.',
    });
  }
};

/**
 * Resolve competition-wide optional USN & search student filters.
 * Returns { empty: true } when a strict USN filter matches no registered student.
 */
const resolveUsnAndSearchStudents = async (usnCheck, searchCheck) => {
  let usnStudent = null;
  if (usnCheck.provided) {
    usnStudent = await runReadQuery(Student.findOne({ usn: usnCheck.value }), {
      select: SAFE_STUDENT_BRIEF_SELECT,
      lean: true,
    });
    if (!usnStudent) {
      return { empty: true, searchStudentIds: [] };
    }
  }

  let searchStudentIds = null;
  if (searchCheck.provided) {
    const matched = await runReadQuery(
      Student.find({
        $or: [{ name: searchCheck.regex }, { usn: searchCheck.regex }],
      }),
      { select: '_id', lean: true }
    );
    searchStudentIds = (Array.isArray(matched) ? matched : []).map((s) => s._id);
  }

  return { empty: false, usnStudent, searchStudentIds };
};

/**
 * List Competition-Wide Rounds & Evaluations (Read-Only)
 * Endpoint: GET /api/admin/rounds
 * Access: Protected (Admin only)
 */
const listRounds = async (req, res) => {
  try {
    const query = req.query || {};

    const paginationInput = parseSafePagination(query);
    if (paginationInput.error) {
      return sendValidationError(res, paginationInput.error);
    }

    const levelCheck = validateLevelFilter(query.levelNumber, 'levelNumber');
    if (levelCheck.error) return sendValidationError(res, levelCheck.error);

    const statusCheck = validateEnumFilter(
      query.status,
      VALID_ROUND_STATUSES,
      'INVALID_ROUND_STATUS_FILTER',
      'Round status'
    );
    if (statusCheck.error) return sendValidationError(res, statusCheck.error);

    const evalStatusCheck = validateEnumFilter(
      query.evaluationStatus,
      VALID_EVALUATION_STATUSES,
      'INVALID_EVALUATION_STATUS_FILTER',
      'Evaluation status',
      { normalizeUpper: true }
    );
    if (evalStatusCheck.error) return sendValidationError(res, evalStatusCheck.error);

    const usnCheck = validateUsnFilter(query.usn);
    if (usnCheck.error) return sendValidationError(res, usnCheck.error);

    const searchCheck = validateSearchQuery(query.search);
    if (searchCheck.error) return sendValidationError(res, searchCheck.error);

    const { page, limit, skip } = paginationInput;
    const { empty, usnStudent, searchStudentIds } = await resolveUsnAndSearchStudents(
      usnCheck,
      searchCheck
    );
    if (empty) {
      return res.status(200).json({
        success: true,
        message: 'Rounds retrieved successfully.',
        count: 0,
        pagination: buildPaginationMeta(page, limit, 0),
        rounds: [],
      });
    }

    const filter = {};
    if (levelCheck.provided) filter.levelNumber = levelCheck.value;
    if (statusCheck.provided) filter.status = statusCheck.value;
    if (usnStudent) filter.studentId = usnStudent._id;

    if (searchCheck.provided) {
      if (searchStudentIds && searchStudentIds.length > 0) {
        filter.$or = [
          { studentId: { $in: searchStudentIds } },
          { 'questionSnapshot.title': searchCheck.regex },
        ];
      } else {
        filter['questionSnapshot.title'] = searchCheck.regex;
      }
    }

    if (evalStatusCheck.provided) {
      if (evalStatusCheck.value === 'PENDING') {
        const finalizedEvals = await runReadQuery(
          Evaluation.find({ status: { $in: ['PASS', 'FAIL'] } }),
          { select: 'roundId', lean: true }
        );
        const finalizedRoundIds = (Array.isArray(finalizedEvals) ? finalizedEvals : [])
          .map((ev) => ev.roundId)
          .filter(Boolean);
        if (finalizedRoundIds.length > 0) {
          filter._id = { $nin: finalizedRoundIds };
        }
      } else {
        const matchingEvals = await runReadQuery(
          Evaluation.find({ status: evalStatusCheck.value }),
          { select: 'roundId', lean: true }
        );
        const matchingRoundIds = (Array.isArray(matchingEvals) ? matchingEvals : [])
          .map((ev) => ev.roundId)
          .filter(Boolean);
        filter._id = { $in: matchingRoundIds };
      }
    }

    const [rawRounds, totalItems] = await Promise.all([
      runReadQuery(Round.find(filter), {
        select: SAFE_ROUND_SELECT,
        sort: { createdAt: -1, _id: -1 },
        skip,
        limit,
        lean: true,
      }),
      Round.countDocuments(filter),
    ]);

    const rounds = Array.isArray(rawRounds) ? rawRounds : [];
    const [studentMap, evalMap] = await Promise.all([
      fetchStudentMapByIds(rounds.map((r) => r.studentId)),
      fetchEvaluationMapByRoundIds(rounds.map((r) => r._id)),
    ]);

    const formattedRounds = rounds.map((round) =>
      formatAdminRoundResponse(
        round,
        round.studentId ? studentMap.get(round.studentId.toString()) || null : null,
        round._id ? evalMap.get(round._id.toString()) || null : null
      )
    );

    return res.status(200).json({
      success: true,
      message: 'Rounds retrieved successfully.',
      count: formattedRounds.length,
      pagination: buildPaginationMeta(page, limit, totalItems),
      rounds: formattedRounds,
    });
  } catch (error) {
    console.error('Admin list rounds error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve rounds.',
    });
  }
};

/**
 * List Chronological Rounds for a Single Participant (Includes Abandoned & TimeExpired)
 * Endpoint: GET /api/admin/participants/:identifier/rounds
 * Access: Protected (Admin only)
 */
const getParticipantRounds = async (req, res) => {
  try {
    const resolved = await resolveParticipantByIdentifier(req.params?.identifier);
    if (resolved.error) {
      return sendValidationError(res, resolved.error);
    }

    const query = req.query || {};
    const paginationInput = parseSafePagination(query);
    if (paginationInput.error) {
      return sendValidationError(res, paginationInput.error);
    }

    const levelCheck = validateLevelFilter(query.levelNumber, 'levelNumber');
    if (levelCheck.error) return sendValidationError(res, levelCheck.error);

    const statusCheck = validateEnumFilter(
      query.status,
      VALID_ROUND_STATUSES,
      'INVALID_ROUND_STATUS_FILTER',
      'Round status'
    );
    if (statusCheck.error) return sendValidationError(res, statusCheck.error);

    const { student } = resolved;
    const { page, limit, skip } = paginationInput;
    const filter = { studentId: student._id };
    if (levelCheck.provided) filter.levelNumber = levelCheck.value;
    if (statusCheck.provided) filter.status = statusCheck.value;

    const [rawRounds, totalItems] = await Promise.all([
      runReadQuery(Round.find(filter), {
        select: SAFE_ROUND_SELECT,
        sort: { levelNumber: 1, createdAt: 1, _id: 1 },
        skip,
        limit,
        lean: true,
      }),
      Round.countDocuments(filter),
    ]);

    const rounds = Array.isArray(rawRounds) ? rawRounds : [];
    const evalMap = await fetchEvaluationMapByRoundIds(
      rounds.map((r) => r._id),
      { studentId: student._id }
    );

    const formattedRounds = rounds.map((round) =>
      formatAdminRoundResponse(
        round,
        student,
        round._id ? evalMap.get(round._id.toString()) || null : null
      )
    );

    return res.status(200).json({
      success: true,
      message: 'Participant round history retrieved successfully.',
      participant: formatAdminParticipantSummary(student),
      count: formattedRounds.length,
      pagination: buildPaginationMeta(page, limit, totalItems),
      rounds: formattedRounds,
    });
  } catch (error) {
    console.error('Admin get participant rounds error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve participant rounds.',
    });
  }
};

/**
 * List Competition-Wide Transaction Ledger (Read-Only)
 * Endpoint: GET /api/admin/transactions
 * Access: Protected (Admin only)
 */
const listTransactions = async (req, res) => {
  try {
    const query = req.query || {};

    const paginationInput = parseSafePagination(query);
    if (paginationInput.error) {
      return sendValidationError(res, paginationInput.error);
    }

    const typeCheck = validateEnumFilter(
      query.type,
      VALID_TRANSACTION_TYPES,
      'INVALID_TRANSACTION_TYPE_FILTER',
      'Transaction type',
      { normalizeUpper: true }
    );
    if (typeCheck.error) return sendValidationError(res, typeCheck.error);

    const levelCheck = validateLevelFilter(query.levelNumber, 'levelNumber');
    if (levelCheck.error) return sendValidationError(res, levelCheck.error);

    const usnCheck = validateUsnFilter(query.usn);
    if (usnCheck.error) return sendValidationError(res, usnCheck.error);

    const searchCheck = validateSearchQuery(query.search);
    if (searchCheck.error) return sendValidationError(res, searchCheck.error);

    const { page, limit, skip } = paginationInput;
    const { empty, usnStudent, searchStudentIds } = await resolveUsnAndSearchStudents(
      usnCheck,
      searchCheck
    );
    if (empty) {
      return res.status(200).json({
        success: true,
        message: 'Transactions retrieved successfully.',
        count: 0,
        pagination: buildPaginationMeta(page, limit, 0),
        transactions: [],
      });
    }

    const filter = {};
    if (typeCheck.provided) filter.type = typeCheck.value;
    if (levelCheck.provided) filter.levelNumber = levelCheck.value;
    if (usnStudent) filter.studentId = usnStudent._id;

    if (searchCheck.provided) {
      if (searchStudentIds && searchStudentIds.length > 0) {
        filter.$or = [
          { studentId: { $in: searchStudentIds } },
          { description: searchCheck.regex },
        ];
      } else {
        filter.description = searchCheck.regex;
      }
    }

    const [rawTransactions, totalItems] = await Promise.all([
      runReadQuery(Transaction.find(filter), {
        select: SAFE_TRANSACTION_SELECT,
        sort: { timestamp: -1, _id: -1 },
        skip,
        limit,
        lean: true,
      }),
      Transaction.countDocuments(filter),
    ]);

    const transactions = Array.isArray(rawTransactions) ? rawTransactions : [];
    const studentMap = await fetchStudentMapByIds(transactions.map((t) => t.studentId));

    const formattedTransactions = transactions.map((tx) =>
      formatAdminTransactionResponse(
        tx,
        tx.studentId ? studentMap.get(tx.studentId.toString()) || null : null
      )
    );

    return res.status(200).json({
      success: true,
      message: 'Transactions retrieved successfully.',
      count: formattedTransactions.length,
      pagination: buildPaginationMeta(page, limit, totalItems),
      transactions: formattedTransactions,
    });
  } catch (error) {
    console.error('Admin list transactions error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve transactions.',
    });
  }
};

/**
 * List Chronological Transaction History for a Single Participant (Read-Only)
 * Endpoint: GET /api/admin/participants/:identifier/transactions
 * Access: Protected (Admin only)
 */
const getParticipantTransactions = async (req, res) => {
  try {
    const resolved = await resolveParticipantByIdentifier(req.params?.identifier);
    if (resolved.error) {
      return sendValidationError(res, resolved.error);
    }

    const query = req.query || {};
    const paginationInput = parseSafePagination(query);
    if (paginationInput.error) {
      return sendValidationError(res, paginationInput.error);
    }

    const typeCheck = validateEnumFilter(
      query.type,
      VALID_TRANSACTION_TYPES,
      'INVALID_TRANSACTION_TYPE_FILTER',
      'Transaction type',
      { normalizeUpper: true }
    );
    if (typeCheck.error) return sendValidationError(res, typeCheck.error);

    const levelCheck = validateLevelFilter(query.levelNumber, 'levelNumber');
    if (levelCheck.error) return sendValidationError(res, levelCheck.error);

    const { student } = resolved;
    const { page, limit, skip } = paginationInput;
    const filter = { studentId: student._id };
    if (typeCheck.provided) filter.type = typeCheck.value;
    if (levelCheck.provided) filter.levelNumber = levelCheck.value;

    const [rawTransactions, totalItems] = await Promise.all([
      runReadQuery(Transaction.find(filter), {
        select: SAFE_TRANSACTION_SELECT,
        sort: { timestamp: -1, _id: -1 },
        skip,
        limit,
        lean: true,
      }),
      Transaction.countDocuments(filter),
    ]);

    const transactions = Array.isArray(rawTransactions) ? rawTransactions : [];
    const formattedTransactions = transactions.map((tx) =>
      formatAdminTransactionResponse(tx, student)
    );

    return res.status(200).json({
      success: true,
      message: 'Participant transaction history retrieved successfully.',
      participant: formatAdminParticipantSummary(student),
      wallet: {
        walletBalance: student.walletBalance ?? 0,
        totalEarned: student.totalEarned ?? 0,
        totalRisked: student.totalRisked ?? 0,
        safeZoneAmount: student.safeZoneAmount ?? 0,
      },
      count: formattedTransactions.length,
      pagination: buildPaginationMeta(page, limit, totalItems),
      transactions: formattedTransactions,
    });
  } catch (error) {
    console.error('Admin get participant transactions error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve participant transactions.',
    });
  }
};

/**
 * Build Level 1..6 participant distribution statistics from aggregated Student facets
 * strictly using currentLevel, competitionStatus, highestLevelReached, and levelsCleared.
 */
const buildLevelStatistics = ({ byLevel = [], highestLevelCounts = [], levelsClearedCounts = [] }) => {
  const levels = {};
  for (let lvl = 1; lvl <= 6; lvl += 1) {
    levels[`L${lvl}`] = {
      levelNumber: lvl,
      participantCount: 0,
      activeCount: 0,
      eliminatedCount: 0,
      completedCount: 0,
      clearedCount: 0,
      reachedCount: 0,
    };
  }

  for (const row of byLevel) {
    const lvl = Number(row?._id);
    if (lvl >= 1 && lvl <= 6 && levels[`L${lvl}`]) {
      levels[`L${lvl}`].participantCount = Number(row.participantCount) || 0;
      levels[`L${lvl}`].activeCount = Number(row.activeCount) || 0;
      levels[`L${lvl}`].eliminatedCount = Number(row.eliminatedCount) || 0;
      levels[`L${lvl}`].completedCount = Number(row.completedCount) || 0;
    }
  }

  for (const row of highestLevelCounts) {
    const highest = Number(row?._id);
    const count = Number(row?.count) || 0;
    if (highest >= 1 && count > 0) {
      const upper = Math.min(6, highest);
      for (let lvl = 1; lvl <= upper; lvl += 1) {
        levels[`L${lvl}`].reachedCount += count;
      }
    }
  }

  for (const row of levelsClearedCounts) {
    const cleared = Number(row?._id);
    const count = Number(row?.count) || 0;
    if (cleared >= 1 && count > 0) {
      const upper = Math.min(6, cleared);
      for (let lvl = 1; lvl <= upper; lvl += 1) {
        levels[`L${lvl}`].clearedCount += count;
      }
    }
  }

  return levels;
};

/**
 * Retrieve Competition-Wide Admin Dashboard Aggregate Statistics (Read-Only)
 * Endpoint: GET /api/admin/dashboard
 * Access: Protected (Admin only)
 */
const getAdminDashboard = async (req, res) => {
  try {
    const evaluationsCollectionName =
      Evaluation.collection?.collectionName || Evaluation.collection?.name || 'evaluations';

    const [
      studentFacetRows,
      roundStatusRows,
      evaluationStatusRows,
      pendingRoundsWithoutEvalRows,
      transactionTypeRows,
      totalQuestions,
      activeQuestions,
      totalVolunteers,
      activeVolunteers,
    ] = await Promise.all([
      Student.aggregate([
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  totalParticipants: { $sum: 1 },
                  unregisteredParticipants: {
                    $sum: { $cond: [{ $ne: ['$registrationComplete', true] }, 1, 0] },
                  },
                  registrationCompletedParticipants: {
                    $sum: { $cond: [{ $eq: ['$registrationComplete', true] }, 1, 0] },
                  },
                  totalWalletBalance: { $sum: { $ifNull: ['$walletBalance', 0] } },
                  totalEarned: { $sum: { $ifNull: ['$totalEarned', 0] } },
                  totalRisked: { $sum: { $ifNull: ['$totalRisked', 0] } },
                  totalSafeZoneAmount: { $sum: { $ifNull: ['$safeZoneAmount', 0] } },
                },
              },
            ],
            byStatus: [
              { $match: { registrationComplete: true } },
              {
                $group: {
                  _id: '$competitionStatus',
                  count: { $sum: 1 },
                },
              },
            ],
            byLevel: [
              { $match: { registrationComplete: true } },
              {
                $group: {
                  _id: '$currentLevel',
                  participantCount: { $sum: 1 },
                  activeCount: {
                    $sum: {
                      $cond: [
                        { $in: ['$competitionStatus', ['registered', 'inProgress', 'cleared']] },
                        1,
                        0,
                      ],
                    },
                  },
                  eliminatedCount: {
                    $sum: {
                      $cond: [{ $eq: ['$competitionStatus', 'eliminated'] }, 1, 0],
                    },
                  },
                  completedCount: {
                    $sum: {
                      $cond: [{ $eq: ['$competitionStatus', 'completed'] }, 1, 0],
                    },
                  },
                },
              },
            ],
            highestLevelCounts: [
              { $match: { registrationComplete: true } },
              {
                $group: {
                  _id: '$highestLevelReached',
                  count: { $sum: 1 },
                },
              },
            ],
            levelsClearedCounts: [
              { $match: { registrationComplete: true } },
              {
                $group: {
                  _id: '$levelsCleared',
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ]),
      Round.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      Evaluation.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      Round.aggregate([
        { $match: { status: { $ne: 'abandoned' } } },
        {
          $lookup: {
            from: evaluationsCollectionName,
            localField: '_id',
            foreignField: 'roundId',
            as: 'evalDocs',
          },
        },
        { $match: { evalDocs: { $size: 0 } } },
        { $count: 'pendingWithoutEvalCount' },
      ]),
      Transaction.aggregate([
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalAmount: { $sum: { $ifNull: ['$amount', 0] } },
          },
        },
      ]),
      Question.countDocuments({}),
      Question.countDocuments({ isActive: true }),
      Volunteer.countDocuments({}),
      Volunteer.countDocuments({ isActive: true }),
    ]);

    // A & B & E: Student participant, level, and wallet totals
    const studentFacet = (Array.isArray(studentFacetRows) && studentFacetRows[0]) || {};
    const totalsRow = (Array.isArray(studentFacet.totals) && studentFacet.totals[0]) || {};

    const participantsByStatus = {};
    for (const status of VALID_COMPETITION_STATUSES) {
      participantsByStatus[status] = 0;
    }
    for (const row of Array.isArray(studentFacet.byStatus) ? studentFacet.byStatus : []) {
      if (row?._id && Object.prototype.hasOwnProperty.call(participantsByStatus, row._id)) {
        participantsByStatus[row._id] = Number(row.count) || 0;
      }
    }

    const totalParticipants = Number(totalsRow.totalParticipants) || 0;
    const unregisteredParticipants = Number(totalsRow.unregisteredParticipants) || 0;
    const registrationCompletedCount = Number(totalsRow.registrationCompletedParticipants) || 0;

    const levels = buildLevelStatistics({
      byLevel: Array.isArray(studentFacet.byLevel) ? studentFacet.byLevel : [],
      highestLevelCounts: Array.isArray(studentFacet.highestLevelCounts)
        ? studentFacet.highestLevelCounts
        : [],
      levelsClearedCounts: Array.isArray(studentFacet.levelsClearedCounts)
        ? studentFacet.levelsClearedCounts
        : [],
    });

    // C: Round statistics by every valid Round status
    const roundsByStatus = {};
    for (const status of VALID_ROUND_STATUSES) {
      roundsByStatus[status] = 0;
    }
    let totalRounds = 0;
    for (const row of Array.isArray(roundStatusRows) ? roundStatusRows : []) {
      const count = Number(row?.count) || 0;
      totalRounds += count;
      if (row?._id && Object.prototype.hasOwnProperty.call(roundsByStatus, row._id)) {
        roundsByStatus[row._id] = count;
      }
    }

    // D: Evaluation statistics (PASS, FAIL, and PENDING matching Task 4.2 derivation)
    const evalCounts = {
      PASS: 0,
      FAIL: 0,
      PENDING: 0,
    };
    for (const row of Array.isArray(evaluationStatusRows) ? evaluationStatusRows : []) {
      if (row?._id && Object.prototype.hasOwnProperty.call(evalCounts, row._id)) {
        evalCounts[row._id] = Number(row.count) || 0;
      }
    }
    const pendingWithoutEvalRow =
      (Array.isArray(pendingRoundsWithoutEvalRows) && pendingRoundsWithoutEvalRows[0]) || {};
    evalCounts.PENDING += Number(pendingWithoutEvalRow.pendingWithoutEvalCount) || 0;

    // F: Transaction statistics across every valid transaction type
    const transactionsByType = {};
    for (const txType of VALID_TRANSACTION_TYPES) {
      transactionsByType[txType] = { count: 0, totalAmount: 0 };
    }
    let totalTransactions = 0;
    let totalTransactionAmount = 0;
    for (const row of Array.isArray(transactionTypeRows) ? transactionTypeRows : []) {
      const count = Number(row?.count) || 0;
      const totalAmount = Number(row?.totalAmount) || 0;
      totalTransactions += count;
      totalTransactionAmount += totalAmount;
      if (row?._id && transactionsByType[row._id]) {
        transactionsByType[row._id] = { count, totalAmount };
      }
    }

    // G & H: Question and Volunteer counts
    const totalQuestionsCount = Number(totalQuestions) || 0;
    const activeQuestionsCount = Number(activeQuestions) || 0;
    const totalVolunteersCount = Number(totalVolunteers) || 0;
    const activeVolunteersCount = Number(activeVolunteers) || 0;

    return res.status(200).json({
      success: true,
      message: 'Admin dashboard statistics retrieved successfully.',
      generatedAt: new Date().toISOString(),
      dashboard: {
        participants: {
          total: totalParticipants,
          unregistered: unregisteredParticipants,
          registrationComplete: registrationCompletedCount,
          registered: participantsByStatus.registered,
          inProgress: participantsByStatus.inProgress,
          cleared: participantsByStatus.cleared,
          eliminated: participantsByStatus.eliminated,
          completed: participantsByStatus.completed,
          byCompetitionStatus: participantsByStatus,
        },
        levels,
        rounds: {
          total: totalRounds,
          byStatus: roundsByStatus,
        },
        evaluations: {
          total: evalCounts.PASS + evalCounts.FAIL + evalCounts.PENDING,
          PASS: evalCounts.PASS,
          FAIL: evalCounts.FAIL,
          PENDING: evalCounts.PENDING,
        },
        wallet: {
          totalWalletBalance: Number(totalsRow.totalWalletBalance) || 0,
          totalEarned: Number(totalsRow.totalEarned) || 0,
          totalRisked: Number(totalsRow.totalRisked) || 0,
          totalSafeZoneAmount: Number(totalsRow.totalSafeZoneAmount) || 0,
          ledgerTotals: {
            rewardCredits: transactionsByType.REWARD_CREDIT.totalAmount,
            safeZonePayouts: transactionsByType.SAFE_ZONE_PAYOUT.totalAmount,
            stakeDebits: transactionsByType.STAKE_DEBIT.totalAmount,
            refunds: transactionsByType.REFUND.totalAmount,
            adminAdjustments: transactionsByType.ADMIN_ADJUSTMENT.totalAmount,
            roundSettlements: transactionsByType.ROUND_SETTLEMENT.totalAmount,
          },
        },
        transactions: {
          total: totalTransactions,
          totalAmount: totalTransactionAmount,
          byType: transactionsByType,
        },
        questions: {
          total: totalQuestionsCount,
          active: activeQuestionsCount,
          inactive: Math.max(0, totalQuestionsCount - activeQuestionsCount),
        },
        volunteers: {
          total: totalVolunteersCount,
          active: activeVolunteersCount,
          inactive: Math.max(0, totalVolunteersCount - activeVolunteersCount),
        },
      },
    });
  } catch (error) {
    console.error('Admin dashboard error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve admin dashboard statistics.',
    });
  }
};

module.exports = {
  getAdminDashboard,
  listParticipants,
  getParticipantDetails,
  listRounds,
  getParticipantRounds,
  listTransactions,
  getParticipantTransactions,
  resolveParticipantByIdentifier,
  formatAdminParticipantSummary,
  formatAdminEvaluationSummary,
  formatAdminRoundResponse,
  formatAdminTransactionResponse,
  runReadQuery,
};
