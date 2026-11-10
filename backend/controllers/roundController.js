const { Round, Question, Level } = require('../models');

/**
 * Validate and parse a stored Round deadline into epoch milliseconds.
 * Safely guards against null, undefined, booleans, empty strings, non-date objects, and NaN timestamps.
 */
const parseValidDeadlineMs = (deadline) => {
  if (deadline === null || deadline === undefined || deadline === '') {
    return {
      errorCode: 'MISSING_ROUND_DEADLINE',
      message: 'Active round is missing a stored deadline.',
    };
  }

  if (!(deadline instanceof Date) && typeof deadline !== 'string' && typeof deadline !== 'number') {
    return {
      errorCode: 'INVALID_ROUND_DEADLINE',
      message: 'Active round contains an invalid deadline value.',
    };
  }

  const timestampMs = deadline instanceof Date ? deadline.getTime() : new Date(deadline).getTime();
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return {
      errorCode: 'INVALID_ROUND_DEADLINE',
      message: 'Active round contains an invalid deadline timestamp.',
    };
  }

  return { timestampMs };
};

/**
 * Derive non-mutating remainingSeconds and isExpired timer metadata from a Round document.
 */
const computeTimerFields = (round, now = new Date()) => {
  if (!round) {
    return { remainingSeconds: null, isExpired: false };
  }

  if (round.status === 'timeExpired') {
    return { remainingSeconds: 0, isExpired: true };
  }

  if (round.status === 'inProgress') {
    const parsed = parseValidDeadlineMs(round.deadline);
    if (parsed.errorCode) {
      return { remainingSeconds: null, isExpired: false };
    }
    const diffMs = parsed.timestampMs - now.getTime();
    if (diffMs <= 0) {
      return { remainingSeconds: 0, isExpired: true };
    }
    return { remainingSeconds: Math.ceil(diffMs / 1000), isExpired: false };
  }

  if (['submitted', 'evaluated', 'abandoned'].includes(round.status)) {
    return { remainingSeconds: 0, isExpired: false };
  }

  // 'ready' or not yet started
  return { remainingSeconds: null, isExpired: false };
};

/**
 * Evaluate a Round's timer state against server time and atomically persist 'timeExpired'
 * when an 'inProgress' round reaches or passes its stored deadline.
 * Never resets startedAt or deadline, and handles concurrent expiration safely.
 */
const syncRoundDeadlineState = async (round, now = new Date()) => {
  if (!round) {
    return {
      error: {
        status: 404,
        code: 'ROUND_NOT_ALLOCATED',
        message: 'Round record not found.',
      },
    };
  }

  if (round.status === 'ready') {
    return {
      round,
      remainingSeconds: null,
      isExpired: false,
      didExpireNow: false,
    };
  }

  if (round.status === 'timeExpired') {
    return {
      round,
      remainingSeconds: 0,
      isExpired: true,
      didExpireNow: false,
    };
  }

  if (['submitted', 'evaluated', 'abandoned'].includes(round.status)) {
    return {
      round,
      remainingSeconds: 0,
      isExpired: false,
      didExpireNow: false,
    };
  }

  if (round.status === 'inProgress') {
    const parsed = parseValidDeadlineMs(round.deadline);
    if (parsed.errorCode) {
      return {
        error: {
          status: 500,
          code: parsed.errorCode,
          message: parsed.message,
        },
      };
    }

    const diffMs = parsed.timestampMs - now.getTime();
    if (diffMs > 0) {
      return {
        round,
        remainingSeconds: Math.ceil(diffMs / 1000),
        isExpired: false,
        didExpireNow: false,
      };
    }

    // Deadline reached (diffMs === 0) or passed (diffMs < 0): atomically transition inProgress -> timeExpired
    const expiredRound = await Round.findOneAndUpdate(
      {
        _id: round._id,
        status: 'inProgress',
      },
      {
        $set: {
          status: 'timeExpired',
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (expiredRound) {
      return {
        round: expiredRound,
        remainingSeconds: 0,
        isExpired: true,
        didExpireNow: true,
      };
    }

    // Concurrency fallback: re-read if another request transitioned the round concurrently
    const latestRound = await Round.findById(round._id);
    if (!latestRound) {
      return {
        error: {
          status: 404,
          code: 'ROUND_NOT_ALLOCATED',
          message: 'Round record no longer exists.',
        },
      };
    }

    if (latestRound.status === 'timeExpired') {
      return {
        round: latestRound,
        remainingSeconds: 0,
        isExpired: true,
        didExpireNow: false,
      };
    }

    return {
      round: latestRound,
      remainingSeconds: 0,
      isExpired: false,
      didExpireNow: false,
    };
  }

  return {
    error: {
      status: 500,
      code: 'INVALID_ROUND_STATUS',
      message: `Round has unexpected status '${round.status}'.`,
    },
  };
};

/**
 * Derive authoritative Student.roundAvailability from the active Round status
 * and Student.competitionStatus using valid Student schema enum values.
 */
const deriveStudentRoundAvailability = (student, round = null) => {
  if (!student) {
    return 'unavailable';
  }

  if (student.competitionStatus === 'completed') {
    return 'completed';
  }
  if (student.competitionStatus === 'eliminated') {
    return 'eliminated';
  }

  if (round) {
    if (round.status === 'inProgress') {
      return computeTimerFields(round).isExpired ? 'evaluationPending' : 'inProgress';
    }

    if (round.status === 'evaluated') {
      const postEvalMap = {
        completed: 'completed',
        eliminated: 'eliminated',
        cleared: 'cleared',
      };
      return postEvalMap[student.competitionStatus] || 'unavailable';
    }

    const roundToAvailabilityMap = {
      ready: 'ready',
      timeExpired: 'evaluationPending',
      submitted: 'evaluationPending',
      abandoned: 'unavailable',
    };

    if (roundToAvailabilityMap[round.status]) {
      return roundToAvailabilityMap[round.status];
    }
  }

  return student.roundAvailability || 'unavailable';
};

/**
 * Format round response for client consumption.
 * Strictly sanitizes question content: hiddenTestCases are NEVER exposed.
 */
const formatRoundStudentResponse = (round, timerState = null) => {
  const snapshot = round.questionSnapshot || {};
  const timer = timerState || computeTimerFields(round);
  return {
    id: (round._id || '').toString(),
    studentId: (round.studentId || '').toString(),
    levelNumber: round.levelNumber,
    questionId: (round.questionId || '').toString(),
    status: round.status,
    durationSeconds: round.durationSeconds,
    startedAt: round.startedAt || null,
    deadline: round.deadline || null,
    remainingSeconds: timer.remainingSeconds,
    isExpired: timer.isExpired,
    completedAt: round.completedAt || null,
    createdAt: round.createdAt,
    question: {
      questionId: snapshot.questionId
        ? snapshot.questionId.toString()
        : (round.questionId || '').toString(),
      title: snapshot.title,
      statement: snapshot.statement,
      constraints: snapshot.constraints || [],
      examples: snapshot.examples || [],
      difficulty: snapshot.difficulty,
      levelNumber: snapshot.levelNumber,
    },
  };
};

/**
 * Format Level configuration for student-facing API responses.
 */
const formatLevelResponse = (levelConfig) => ({
  number: levelConfig.number,
  name: levelConfig.name,
  entryRiskAmount:
    levelConfig.entryRiskAmount !== null && levelConfig.entryRiskAmount !== undefined
      ? levelConfig.entryRiskAmount
      : 0,
  winningPayout: levelConfig.winningPayout,
  losingPayout: levelConfig.losingPayout,
  safeZoneAmount: levelConfig.safeZoneAmount ?? 0,
  isSafeZone: Boolean(levelConfig.isSafeZone),
  isFinal: Boolean(levelConfig.isFinal),
  durationSeconds: levelConfig.durationSeconds,
});

/**
 * Controller: getLevelInfo
 * Endpoint: GET /api/rounds/level-info
 * Access: Protected (Student only)
 *
 * Responsibilities:
 * 1. Identifies student from authenticated session (req.student).
 * 2. Enforces registration completion.
 * 3. Reads currentLevel and walletBalance from Student document.
 * 4. Loads financial and timer configurations from Level collection.
 * 5. Does NOT allocate a question.
 * 6. Does NOT alter wallet balance or competition progress.
 */
const getLevelInfo = async (req, res) => {
  try {
    const student = req.student;

    if (!student.registrationComplete) {
      return res.status(403).json({
        success: false,
        code: 'REGISTRATION_INCOMPLETE',
        message: 'Registration must be completed before viewing competition level details.',
      });
    }

    const currentLevel = student.currentLevel;
    if (!currentLevel || currentLevel < 1 || currentLevel > 6) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_STUDENT_LEVEL',
        message: 'Student current level is invalid.',
      });
    }

    const levelConfig = await Level.findOne({ number: currentLevel, isActive: true });
    if (!levelConfig) {
      return res.status(404).json({
        success: false,
        code: 'LEVEL_NOT_FOUND',
        message: `Active level configuration for Level ${currentLevel} was not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      currentLevel,
      walletBalance: student.walletBalance ?? 0,
      level: formatLevelResponse(levelConfig),
    });
  } catch (error) {
    console.error('Error fetching level info:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve level information.',
    });
  }
};

/**
 * Controller: allocateQuestion
 * Endpoint: POST /api/rounds/allocate
 * Access: Protected (Student only)
 *
 * Responsibilities:
 * 1. Identifies student from authenticated session (req.student).
 * 2. Enforces registration completion.
 * 3. Reads currentLevel and academic year from Student document.
 * 4. Maps academic year to difficulty: 1st Year -> EASY, 2nd..4th Year -> HARD.
 * 5. Checks for existing Round: returns existing question snapshot if already allocated.
 * 6. Validates active Level configuration.
 * 7. Selects an active matching question from Question collection.
 * 8. Creates Round with frozen questionSnapshot (excluding hiddenTestCases).
 * 9. Catches E11000 duplicate key error and recovers by returning existing Round.
 * 10. Does NOT deduct wallet balance or modify progression.
 */
const allocateQuestion = async (req, res) => {
  try {
    // 0. Reject any client-supplied question, difficulty, level, or student overrides
    const bodyKeys = Object.keys(req.body || {});
    if (bodyKeys.length > 0) {
      return res.status(400).json({
        success: false,
        code: 'UNSUPPORTED_FIELDS',
        message: `Question allocation requests do not accept request body fields: ${bodyKeys.join(', ')}.`,
      });
    }

    const student = req.student;

    // 1. Verify registration is complete
    if (!student.registrationComplete) {
      return res.status(403).json({
        success: false,
        code: 'REGISTRATION_INCOMPLETE',
        message: 'Registration must be completed before entering competition rounds.',
      });
    }

    // 1b. Block eliminated or completed participants from allocating new rounds or retrying
    if (student.competitionStatus === 'eliminated') {
      return res.status(409).json({
        success: false,
        code: 'STUDENT_ELIMINATED',
        message: 'You have been eliminated from the competition and cannot allocate another round.',
      });
    }

    if (student.competitionStatus === 'completed') {
      return res.status(409).json({
        success: false,
        code: 'COMPETITION_COMPLETED',
        message: 'You have already completed all competition levels.',
      });
    }

    // 2. Validate current level
    const currentLevel = student.currentLevel;
    if (!currentLevel || currentLevel < 1 || currentLevel > 6) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_STUDENT_LEVEL',
        message: 'Student current level is invalid.',
      });
    }

    // 3. Determine question difficulty from academic year
    const year = student.year;
    let difficulty;
    if (year === '1st Year') {
      difficulty = 'EASY';
    } else if (['2nd Year', '3rd Year', '4th Year'].includes(year)) {
      difficulty = 'HARD';
    } else {
      return res.status(400).json({
        success: false,
        code: 'INVALID_STUDENT_YEAR',
        message: 'Student academic year must be 1st Year, 2nd Year, 3rd Year, or 4th Year.',
      });
    }

    // 4. Check whether a Round already exists for this student and current level
    const existingRound = await Round.findOne({
      studentId: student._id,
      levelNumber: currentLevel,
    });

    if (existingRound) {
      return res.status(200).json({
        success: true,
        message: 'Existing round retrieved successfully.',
        isExisting: true,
        round: formatRoundStudentResponse(existingRound),
      });
    }

    // 5. Verify that corresponding Level is active
    const levelConfig = await Level.findOne({ number: currentLevel, isActive: true });
    if (!levelConfig) {
      return res.status(404).json({
        success: false,
        code: 'LEVEL_NOT_FOUND',
        message: `Active level configuration for Level ${currentLevel} was not found.`,
      });
    }

    // 6. Find all active matching questions for this level and difficulty
    const eligibleQuestions = await Question.find({
      levelNumber: currentLevel,
      difficulty,
      isActive: true,
    });

    if (!eligibleQuestions || eligibleQuestions.length === 0) {
      return res.status(404).json({
        success: false,
        code: 'NO_ELIGIBLE_QUESTIONS',
        message: `No active ${difficulty} questions are available for Level ${currentLevel}.`,
      });
    }

    // 7. Avoid re-allocating questions previously assigned to this student in other rounds if possible
    const pastRounds = await Round.find({ studentId: student._id }).select('questionId');
    const pastQuestionIds = new Set(pastRounds.map((r) => r.questionId.toString()));

    const unassignedQuestions = eligibleQuestions.filter(
      (q) => !pastQuestionIds.has(q._id.toString())
    );

    const selectionPool = unassignedQuestions.length > 0 ? unassignedQuestions : eligibleQuestions;
    const randomIndex = Math.floor(Math.random() * selectionPool.length);
    const selectedQuestion = selectionPool[randomIndex];

    // 8. Construct immutable question snapshot (strictly omitting hiddenTestCases)
    const questionSnapshot = {
      questionId: selectedQuestion._id,
      title: selectedQuestion.title,
      statement: selectedQuestion.statement,
      constraints: selectedQuestion.constraints || [],
      examples: selectedQuestion.examples || [],
      difficulty: selectedQuestion.difficulty,
      levelNumber: selectedQuestion.levelNumber,
    };

    // 9. Create Round instance
    const round = new Round({
      studentId: student._id,
      levelNumber: currentLevel,
      questionId: selectedQuestion._id,
      questionSnapshot,
      status: 'ready',
      durationSeconds: levelConfig.durationSeconds || 180,
    });

    // 10. Save round with atomic concurrency protection against E11000 duplicate keys
    let savedRound;
    try {
      savedRound = await round.save();
    } catch (saveError) {
      if (saveError.code === 11000 || (saveError.message && saveError.message.includes('E11000'))) {
        const raceExistingRound = await Round.findOne({
          studentId: student._id,
          levelNumber: currentLevel,
        });
        if (raceExistingRound) {
          return res.status(200).json({
            success: true,
            message: 'Existing round retrieved successfully.',
            isExisting: true,
            round: formatRoundStudentResponse(raceExistingRound),
          });
        }
      }
      throw saveError;
    }

    return res.status(201).json({
      success: true,
      message: 'Question allocated successfully.',
      isExisting: false,
      round: formatRoundStudentResponse(savedRound),
    });
  } catch (error) {
    console.error('Error allocating question:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to allocate question.',
    });
  }
};

/**
 * Map active round status to clear student-facing status message.
 */
const getActiveRoundStatusMessage = (status, isExpired) => {
  if (isExpired || status === 'timeExpired') {
    return 'Round timer has expired.';
  }
  const statusMessages = {
    ready: 'Round is allocated and waiting to be started by a volunteer.',
    inProgress: 'Round is currently in progress.',
    submitted: 'Round has been submitted and is awaiting evaluation.',
    evaluated: 'Round has already been evaluated.',
  };
  return statusMessages[status] || 'Round details retrieved successfully.';
};

/**
 * Controller: getActiveRoundStatus
 * Endpoint: GET /api/rounds/active
 * Access: Protected (Student only)
 *
 * Responsibilities:
 * 1. Identifies student exclusively via req.student (never params/query/body studentId or USN).
 * 2. Enforces registrationComplete === true and valid currentLevel.
 * 3. Fetches the authenticated student's current-level Round (excluding abandoned rounds).
 * 4. Synchronizes deadline & expiration status via syncRoundDeadlineState().
 * 5. Derives consistent student.roundAvailability via deriveStudentRoundAvailability().
 * 6. Exposes only public student-safe question/timer fields (no hiddenTestCases, googleSubjectId, or staff info).
 * 7. Does NOT modify wallet balances or level progression.
 */
const getActiveRoundStatus = async (req, res) => {
  try {
    const student = req.student;

    // 1. Verify registration is complete
    if (!student.registrationComplete) {
      return res.status(403).json({
        success: false,
        code: 'REGISTRATION_INCOMPLETE',
        message: 'Registration must be completed before viewing your active round status.',
      });
    }

    // 2. Validate current level from authoritative Student DB document
    const currentLevel = student.currentLevel;
    if (!currentLevel || currentLevel < 1 || currentLevel > 6) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_STUDENT_LEVEL',
        message: 'Student current level is invalid.',
      });
    }

    // 3. Locate current-level round exclusively for the authenticated student
    const round = await Round.findOne({
      studentId: student._id,
      levelNumber: currentLevel,
      status: { $ne: 'abandoned' },
    });

    if (!round) {
      return res.status(404).json({
        success: false,
        code: 'ROUND_NOT_ALLOCATED',
        message: `No round has been allocated for Level ${currentLevel} yet.`,
        currentLevel,
        roundAvailability: deriveStudentRoundAvailability(student, null),
      });
    }

    // 4. Synchronize timer and expiration state atomically
    const timerSync = await syncRoundDeadlineState(round);
    if (timerSync.error) {
      return res.status(timerSync.error.status).json({
        success: false,
        code: timerSync.error.code,
        message: timerSync.error.message,
      });
    }

    const syncedRound = timerSync.round;

    // 5. Return student-safe active round details and synchronized availability
    return res.status(200).json({
      success: true,
      message: getActiveRoundStatusMessage(syncedRound.status, timerSync.isExpired),
      currentLevel,
      roundAvailability: deriveStudentRoundAvailability(student, syncedRound),
      competitionStatus: student.competitionStatus,
      round: formatRoundStudentResponse(syncedRound, {
        remainingSeconds: timerSync.remainingSeconds,
        isExpired: timerSync.isExpired,
      }),
    });
  } catch (error) {
    console.error('Error retrieving active round status:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve active round status.',
    });
  }
};

module.exports = {
  getLevelInfo,
  allocateQuestion,
  getActiveRoundStatus,
  formatLevelResponse,
  formatRoundStudentResponse,
  syncRoundDeadlineState,
  computeTimerFields,
  parseValidDeadlineMs,
  deriveStudentRoundAvailability,
};
