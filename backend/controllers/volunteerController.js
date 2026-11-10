const mongoose = require('mongoose');
const { Volunteer, Student, Round, Level, Evaluation, Transaction } = require('../models');
const { signVolunteerToken } = require('../middleware/authMiddleware');
const { formatVolunteerResponse } = require('./adminController');
const {
  formatRoundStudentResponse,
  syncRoundDeadlineState,
  deriveStudentRoundAvailability,
  computeTimerFields,
} = require('./roundController');

/**
 * Format student identity, registration, and competition status for Volunteer inspection.
 * Omits internal authentication details such as googleSubjectId.
 */
const formatStudentVolunteerResponse = (student, round = null) => ({
  id: student._id.toString(),
  name: student.name,
  email: student.email,
  usn: student.usn || null,
  year: student.year || null,
  registrationComplete: Boolean(student.registrationComplete),
  currentLevel: student.currentLevel,
  highestLevelReached: student.highestLevelReached ?? 1,
  levelsCleared: student.levelsCleared ?? 0,
  competitionStatus: student.competitionStatus,
  roundAvailability: deriveStudentRoundAvailability(student, round),
  walletBalance: student.walletBalance ?? 0,
  totalEarned: student.totalEarned ?? 0,
  totalRisked: student.totalRisked ?? 0,
  safeZoneAmount: student.safeZoneAmount ?? 0,
});

/**
 * Helper to validate/normalize USN and fetch the corresponding registered Student.
 */
const resolveRegisteredStudent = async (rawUsn) => {
  if (!rawUsn || typeof rawUsn !== 'string' || rawUsn.trim() === '') {
    return {
      error: {
        status: 400,
        code: 'MISSING_USN',
        message: 'University Seat Number (USN) is required.',
      },
    };
  }

  const normalizedUsn = rawUsn.trim().toUpperCase();
  const usnRegex = /^[A-Z0-9]{8,15}$/i;
  if (!usnRegex.test(normalizedUsn)) {
    return {
      error: {
        status: 400,
        code: 'INVALID_USN_FORMAT',
        message: 'Invalid USN format. USN must be 8–15 alphanumeric characters.',
      },
    };
  }

  const student = await Student.findOne({ usn: normalizedUsn });
  if (!student) {
    return {
      error: {
        status: 404,
        code: 'STUDENT_NOT_FOUND',
        message: `No registered student found with USN ${normalizedUsn}.`,
      },
    };
  }

  if (!student.registrationComplete) {
    return {
      error: {
        status: 400,
        code: 'REGISTRATION_INCOMPLETE',
        message: `Student with USN ${normalizedUsn} has not completed registration.`,
      },
    };
  }

  const currentLevel = student.currentLevel;
  if (!currentLevel || currentLevel < 1 || currentLevel > 6) {
    return {
      error: {
        status: 400,
        code: 'INVALID_STUDENT_LEVEL',
        message: 'Student current level is invalid.',
      },
    };
  }

  return { student, normalizedUsn };
};

/**
 * Helper to format consistent round-start conflict responses for non-ready statuses.
 */
const buildRoundStartConflict = (status, currentLevel) => ({
  success: false,
  code: status === 'inProgress' ? 'ROUND_ALREADY_STARTED' : 'INVALID_ROUND_STATUS',
  message:
    status === 'inProgress'
      ? `Round for Level ${currentLevel} is already in progress and cannot be restarted.`
      : `Cannot start round with status '${status}'. Only 'ready' rounds can be started.`,
});

/**
 * Volunteer Login Controller
 * Endpoint: POST /api/volunteer/login (also mounted at /api/auth/volunteer/login)
 * Access: Public
 */
const volunteerLogin = async (req, res) => {
  try {
    const { username, password } = req.body || {};

    // 1. Missing credentials validation
    if (!username || typeof username !== 'string' || username.trim() === '' ||
      !password || typeof password !== 'string' || password === '') {
      return res.status(400).json({
        success: false,
        code: 'MISSING_CREDENTIALS',
        message: 'Username and password are required.',
      });
    }

    const normalizedUsername = username.trim().toLowerCase();

    // 2. Query volunteer user in database using Volunteer discriminator model
    const volunteer = await Volunteer.findOne({
      username: normalizedUsername,
    });

    // 3. Generic authentication failure to prevent username enumeration
    if (!volunteer) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password.',
      });
    }

    // 4. Check active account status: deactivated volunteers cannot log in
    if (!volunteer.isActive) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Volunteer account has been deactivated. Please contact an administrator.',
      });
    }

    // 5. Verify password hash using bcrypt
    const isMatch = await volunteer.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password.',
      });
    }

    // 6. Generate signed HS256 JWT
    const token = signVolunteerToken(volunteer._id);

    return res.status(200).json({
      success: true,
      message: 'Volunteer authenticated successfully.',
      token,
      volunteer: formatVolunteerResponse(volunteer),
    });
  } catch (error) {
    console.error('Volunteer login error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An internal error occurred during volunteer login.',
    });
  }
};

/**
 * Get current authenticated Volunteer profile
 * Endpoint: GET /api/volunteer/me
 * Access: Protected (Volunteer only)
 */
const getVolunteerMe = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      volunteer: formatVolunteerResponse(req.volunteer),
    });
  } catch (error) {
    console.error('getVolunteerMe error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Failed to retrieve volunteer profile.',
    });
  }
};

/**
 * Lookup a registered student by USN and retrieve their allocated active round
 * Endpoint: GET /api/volunteer/students/:usn/round
 * Access: Protected (Volunteer only)
 */
const getStudentActiveRoundByUsn = async (req, res) => {
  try {
    const resolved = await resolveRegisteredStudent(req.params.usn);
    if (resolved.error) {
      return res.status(resolved.error.status).json({
        success: false,
        code: resolved.error.code,
        message: resolved.error.message,
      });
    }

    const { student, normalizedUsn } = resolved;
    const currentLevel = student.currentLevel;

    // Retrieve student's allocated active round for their current level (excluding abandoned rounds)
    const round = await Round.findOne({
      studentId: student._id,
      levelNumber: currentLevel,
      status: { $ne: 'abandoned' },
    });

    if (!round) {
      return res.status(404).json({
        success: false,
        code: 'ROUND_NOT_ALLOCATED',
        message: `Student ${normalizedUsn} does not have an allocated active round for Level ${currentLevel}.`,
      });
    }

    // Synchronize deadline status (computes remainingSeconds and atomically expires timed-out rounds)
    const timerSync = await syncRoundDeadlineState(round);
    if (timerSync.error) {
      return res.status(timerSync.error.status).json({
        success: false,
        code: timerSync.error.code,
        message: timerSync.error.message,
      });
    }

    const syncedRound = timerSync.round;

    // Return student identity/registration summary, timer state, and public question snapshot (no hiddenTestCases)
    return res.status(200).json({
      success: true,
      message: timerSync.isExpired
        ? 'Round timer has expired.'
        : 'Round details retrieved successfully.',
      student: formatStudentVolunteerResponse(student, syncedRound),
      round: formatRoundStudentResponse(syncedRound, {
        remainingSeconds: timerSync.remainingSeconds,
        isExpired: timerSync.isExpired,
      }),
    });
  } catch (error) {
    console.error('Error looking up student round by USN:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve student round details.',
    });
  }
};

/**
 * Start a student's allocated round for their current level
 * Endpoint: POST /api/volunteer/students/:usn/round/start
 * Access: Protected (Volunteer only)
 */
const startStudentRoundByUsn = async (req, res) => {
  try {
    // 1. Validate USN, find student, verify registrationComplete and currentLevel
    const resolved = await resolveRegisteredStudent(req.params.usn);
    if (resolved.error) {
      return res.status(resolved.error.status).json({
        success: false,
        code: resolved.error.code,
        message: resolved.error.message,
      });
    }

    const { student, normalizedUsn } = resolved;
    const currentLevel = student.currentLevel;

    // 2. Locate student's round for their current level
    const existingRound = await Round.findOne({
      studentId: student._id,
      levelNumber: currentLevel,
    });

    if (!existingRound) {
      return res.status(404).json({
        success: false,
        code: 'ROUND_NOT_ALLOCATED',
        message: `Student ${normalizedUsn} does not have an allocated round for Level ${currentLevel}.`,
      });
    }

    // 3. Enforce strict state pre-check: only 'ready' rounds may be started
    if (existingRound.status !== 'ready') {
      return res.status(409).json(buildRoundStartConflict(existingRound.status, currentLevel));
    }

    // 4. Resolve authoritative round duration from active Level configuration (never hardcoded)
    const levelConfig = await Level.findOne({ number: currentLevel, isActive: true });
    if (!levelConfig) {
      return res.status(404).json({
        success: false,
        code: 'LEVEL_NOT_FOUND',
        message: `Active level configuration for Level ${currentLevel} was not found.`,
      });
    }

    const durationSeconds = Number.isFinite(levelConfig.durationSeconds)
      ? levelConfig.durationSeconds
      : existingRound.durationSeconds;

    if (!Number.isFinite(durationSeconds) || durationSeconds < 10) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ROUND_DURATION',
        message: 'Authoritative level duration must be at least 10 seconds.',
      });
    }

    // 5. Compute authoritative timestamps and perform atomic conditional transition ready -> inProgress
    const startedAt = new Date();
    const deadline = new Date(startedAt.getTime() + durationSeconds * 1000);

    const startedRound = await Round.findOneAndUpdate(
      {
        _id: existingRound._id,
        status: 'ready',
      },
      {
        $set: {
          status: 'inProgress',
          durationSeconds,
          startedAt,
          deadline,
          startedBy: req.volunteer._id,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    // 6. Handle concurrent race condition where another volunteer started/modified the round first
    if (!startedRound) {
      const latestRound = await Round.findById(existingRound._id);
      if (!latestRound) {
        return res.status(404).json({
          success: false,
          code: 'ROUND_NOT_ALLOCATED',
          message: `Round for Level ${currentLevel} no longer exists.`,
        });
      }
      return res.status(409).json(buildRoundStartConflict(latestRound.status, currentLevel));
    }

    // 7. Return sanitized response (no hiddenTestCases, no passwordHash, no googleSubjectId)
    return res.status(200).json({
      success: true,
      message: 'Round started successfully.',
      student: formatStudentVolunteerResponse(student, startedRound),
      round: {
        ...formatRoundStudentResponse(startedRound),
        startedBy: startedRound.startedBy ? startedRound.startedBy.toString() : req.volunteer._id.toString(),
      },
      startedBy: {
        id: req.volunteer._id.toString(),
        name: req.volunteer.name,
        username: req.volunteer.username,
        assignedLab: req.volunteer.assignedLab || '',
      },
    });
  } catch (error) {
    console.error('Error starting student round:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to start student round.',
    });
  }
};

/**
 * Helper to validate extensionSeconds (strict positive safe integer) and optional reason.
 */
const parseExtensionPayload = (body) => {
  const { extensionSeconds, reason } = body || {};

  if (
    extensionSeconds === undefined ||
    extensionSeconds === null ||
    typeof extensionSeconds === 'boolean' ||
    (typeof extensionSeconds !== 'number' && typeof extensionSeconds !== 'string') ||
    (typeof extensionSeconds === 'string' && !/^-?\d+$/.test(extensionSeconds.trim()))
  ) {
    return {
      error: {
        status: 400,
        code: 'INVALID_EXTENSION_SECONDS',
        message: 'extensionSeconds is required and must be a positive integer.',
      },
    };
  }

  const parsedExtensionSeconds =
    typeof extensionSeconds === 'number' ? extensionSeconds : Number(extensionSeconds.trim());

  if (!Number.isSafeInteger(parsedExtensionSeconds) || parsedExtensionSeconds <= 0) {
    return {
      error: {
        status: 400,
        code: 'INVALID_EXTENSION_SECONDS',
        message: 'extensionSeconds must be a positive integer greater than 0.',
      },
    };
  }

  if (reason !== undefined && typeof reason !== 'string') {
    return {
      error: {
        status: 400,
        code: 'INVALID_EXTENSION_REASON',
        message: 'Extension reason must be a string.',
      },
    };
  }

  return {
    extensionSeconds: parsedExtensionSeconds,
    reason: typeof reason === 'string' ? reason.trim() : '',
  };
};

/**
 * Helper to format an ineligible round status rejection for extension requests.
 */
const buildExtensionIneligibleResponse = (status, currentLevel) => {
  if (status === 'timeExpired') {
    return {
      status: 409,
      code: 'ROUND_TIMER_EXPIRED',
      message: `Cannot extend round for Level ${currentLevel} because the timer has already expired.`,
    };
  }
  return {
    status: 409,
    code: 'INVALID_ROUND_STATUS',
    message: `Cannot extend round with status '${status}'. Only 'inProgress' rounds can be extended.`,
  };
};

/**
 * Extend an active student round's deadline
 * Endpoint: POST /api/volunteer/students/:usn/round/extend
 * Access: Protected (Volunteer only)
 */
const extendStudentRoundByUsn = async (req, res) => {
  try {
    // 1. Validate request payload
    const parsedPayload = parseExtensionPayload(req.body);
    if (parsedPayload.error) {
      return res.status(parsedPayload.error.status).json({
        success: false,
        code: parsedPayload.error.code,
        message: parsedPayload.error.message,
      });
    }

    const { extensionSeconds: parsedExtensionSeconds, reason: normalizedReason } = parsedPayload;

    // 2. Validate USN, locate registered student, verify registrationComplete and currentLevel
    const resolved = await resolveRegisteredStudent(req.params.usn);
    if (resolved.error) {
      return res.status(resolved.error.status).json({
        success: false,
        code: resolved.error.code,
        message: resolved.error.message,
      });
    }

    const { student, normalizedUsn } = resolved;
    const currentLevel = student.currentLevel;

    // 3. Locate student's round for their current level
    const initialRound = await Round.findOne({
      studentId: student._id,
      levelNumber: currentLevel,
    });

    if (!initialRound) {
      return res.status(404).json({
        success: false,
        code: 'ROUND_NOT_ALLOCATED',
        message: `Student ${normalizedUsn} does not have an allocated round for Level ${currentLevel}.`,
      });
    }

    // 4. Optimistic Concurrency Control (CAS) loop on stored deadline to prevent lost updates
    const MAX_CAS_ATTEMPTS = 5;
    let candidateRound = initialRound;
    let extendedRound = null;

    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
      if (candidateRound.status !== 'inProgress') {
        const conflict = buildExtensionIneligibleResponse(candidateRound.status, currentLevel);
        return res.status(conflict.status).json({
          success: false,
          code: conflict.code,
          message: conflict.message,
        });
      }

      // Sync timer state so an un-synced expired round cannot be extended
      const timerSync = await syncRoundDeadlineState(candidateRound);
      if (timerSync.error) {
        return res.status(timerSync.error.status).json({
          success: false,
          code: timerSync.error.code,
          message: timerSync.error.message,
        });
      }

      if (timerSync.isExpired || timerSync.round.status === 'timeExpired') {
        const conflict = buildExtensionIneligibleResponse('timeExpired', currentLevel);
        return res.status(conflict.status).json({
          success: false,
          code: conflict.code,
          message: conflict.message,
        });
      }

      const activeRound = timerSync.round;
      const storedDeadlineDate = new Date(activeRound.deadline);
      const newDeadlineMs = storedDeadlineDate.getTime() + parsedExtensionSeconds * 1000;

      // Guard against JavaScript Date maximum timestamp overflow (8.64e15 ms)
      if (!Number.isFinite(newDeadlineMs) || newDeadlineMs > 8.64e15) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_EXTENSION_SECONDS',
          message: 'Requested extension produces an invalid deadline timestamp.',
        });
      }

      const extensionEntry = {
        extendedBy: req.volunteer._id,
        secondsAdded: parsedExtensionSeconds,
        reason: normalizedReason,
        timestamp: new Date(),
      };

      const updated = await Round.findOneAndUpdate(
        {
          _id: activeRound._id,
          status: 'inProgress',
          deadline: storedDeadlineDate,
        },
        {
          $set: {
            deadline: new Date(newDeadlineMs),
          },
          $push: {
            timerExtensions: extensionEntry,
          },
        },
        {
          new: true,
          runValidators: true,
        }
      );

      if (updated) {
        extendedRound = updated;
        break;
      }

      // Concurrent write altered deadline or status; re-fetch for retry or conflict report
      const refreshedRound = await Round.findById(activeRound._id);
      if (!refreshedRound) {
        return res.status(404).json({
          success: false,
          code: 'ROUND_NOT_ALLOCATED',
          message: `Round for Level ${currentLevel} no longer exists.`,
        });
      }
      candidateRound = refreshedRound;
    }

    if (!extendedRound) {
      return res.status(409).json({
        success: false,
        code: 'EXTENSION_CONFLICT',
        message: 'Could not apply timer extension due to concurrent modifications. Please retry.',
      });
    }

    const updatedTimer = computeTimerFields(extendedRound);

    return res.status(200).json({
      success: true,
      message: `Round deadline extended by ${parsedExtensionSeconds} seconds.`,
      extensionSeconds: parsedExtensionSeconds,
      student: formatStudentVolunteerResponse(student, extendedRound),
      round: {
        ...formatRoundStudentResponse(extendedRound, updatedTimer),
        startedBy: extendedRound.startedBy ? extendedRound.startedBy.toString() : null,
        timerExtensions: Array.isArray(extendedRound.timerExtensions)
          ? extendedRound.timerExtensions.map((ext) => ({
              extendedBy: ext.extendedBy ? ext.extendedBy.toString() : null,
              secondsAdded: ext.secondsAdded,
              reason: ext.reason || '',
              timestamp: ext.timestamp,
            }))
          : [],
      },
      extendedBy: {
        id: req.volunteer._id.toString(),
        name: req.volunteer.name,
        username: req.volunteer.username,
        assignedLab: req.volunteer.assignedLab || '',
      },
    });
  } catch (error) {
    console.error('Error extending student round timer:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to extend round timer.',
    });
  }
};

/**
 * Helper to strictly validate manual PASS/FAIL evaluation payload.
 * Rejects evaluator spoofing fields or unsupported properties.
 */
const parseEvaluationPayload = (body) => {
  const payload = body || {};
  const allowedFields = ['result', 'remarks', 'programmingLanguage'];
  const extraFields = Object.keys(payload).filter((key) => !allowedFields.includes(key));

  if (extraFields.length > 0) {
    return {
      error: {
        status: 400,
        code: 'UNSUPPORTED_FIELDS',
        message: `Request contains unsupported fields: ${extraFields.join(', ')}.`,
      },
    };
  }

  const { result, remarks, programmingLanguage } = payload;

  if (!result || typeof result !== 'string') {
    return {
      error: {
        status: 400,
        code: 'INVALID_EVALUATION_RESULT',
        message: "Evaluation result is required and must be 'PASS' or 'FAIL'.",
      },
    };
  }

  const normalizedResult = result.trim().toUpperCase();
  if (!['PASS', 'FAIL'].includes(normalizedResult)) {
    return {
      error: {
        status: 400,
        code: 'INVALID_EVALUATION_RESULT',
        message: "Evaluation result must be strictly 'PASS' or 'FAIL'.",
      },
    };
  }

  if (remarks !== undefined && remarks !== null && typeof remarks !== 'string') {
    return {
      error: {
        status: 400,
        code: 'INVALID_REMARKS',
        message: 'Remarks must be a string.',
      },
    };
  }

  const normalizedRemarks = typeof remarks === 'string' ? remarks.trim() : '';
  if (normalizedRemarks.length > 1000) {
    return {
      error: {
        status: 400,
        code: 'INVALID_REMARKS',
        message: 'Remarks cannot exceed 1000 characters.',
      },
    };
  }

  if (programmingLanguage !== undefined && programmingLanguage !== null && typeof programmingLanguage !== 'string') {
    return {
      error: {
        status: 400,
        code: 'INVALID_PROGRAMMING_LANGUAGE',
        message: 'Programming language must be a string.',
      },
    };
  }

  const normalizedLanguage = typeof programmingLanguage === 'string' ? programmingLanguage.trim() : '';
  if (normalizedLanguage.length > 50) {
    return {
      error: {
        status: 400,
        code: 'INVALID_PROGRAMMING_LANGUAGE',
        message: 'Programming language cannot exceed 50 characters.',
      },
    };
  }

  return {
    result: normalizedResult,
    remarks: normalizedRemarks,
    programmingLanguage: normalizedLanguage,
  };
};

/**
 * Format Evaluation document cleanly for API response.
 */
const formatEvaluationResponse = (evaluation) => ({
  id: (evaluation._id || '').toString(),
  roundId: (evaluation.roundId || '').toString(),
  studentId: (evaluation.studentId || '').toString(),
  questionId: (evaluation.questionId || '').toString(),
  levelNumber: evaluation.levelNumber,
  status: evaluation.status,
  volunteerNotes: evaluation.volunteerNotes || '',
  programmingLanguage: evaluation.programmingLanguage || '',
  evaluatedBy: evaluation.evaluatedBy ? evaluation.evaluatedBy.toString() : null,
  evaluatedAt: evaluation.evaluatedAt || null,
  isSettled: Boolean(evaluation.isSettled),
  settledAt: evaluation.settledAt || null,
  settledBy: evaluation.settledBy ? evaluation.settledBy.toString() : null,
  settlementTransactionId: evaluation.settlementTransactionId
    ? evaluation.settlementTransactionId.toString()
    : null,
  isProgressed: Boolean(evaluation.isProgressed),
  progressedAt: evaluation.progressedAt || null,
  progressedBy: evaluation.progressedBy ? evaluation.progressedBy.toString() : null,
});

/**
 * Manually evaluate a student's current-level round as PASS or FAIL
 * Endpoint: POST /api/volunteer/students/:usn/round/evaluate
 * Access: Protected (Volunteer only)
 *
 * Strictly handles manual evaluation persistence only; does NOT perform wallet
 * settlement, transaction creation, or level progression.
 */
const evaluateStudentRoundByUsn = async (req, res) => {
  try {
    // 1. Validate request payload
    const parsedPayload = parseEvaluationPayload(req.body);
    if (parsedPayload.error) {
      return res.status(parsedPayload.error.status).json({
        success: false,
        code: parsedPayload.error.code,
        message: parsedPayload.error.message,
      });
    }

    const { result: normalizedResult, remarks: normalizedRemarks, programmingLanguage: normalizedLanguage } = parsedPayload;

    // 2. Validate USN, locate registered student, verify registrationComplete and currentLevel
    const resolved = await resolveRegisteredStudent(req.params.usn);
    if (resolved.error) {
      return res.status(resolved.error.status).json({
        success: false,
        code: resolved.error.code,
        message: resolved.error.message,
      });
    }

    const { student, normalizedUsn } = resolved;
    const currentLevel = student.currentLevel;

    // 3. Locate student's round for their current level
    const existingRound = await Round.findOne({
      studentId: student._id,
      levelNumber: currentLevel,
    });

    if (!existingRound) {
      return res.status(404).json({
        success: false,
        code: 'ROUND_NOT_ALLOCATED',
        message: `Student ${normalizedUsn} does not have an allocated round for Level ${currentLevel}.`,
      });
    }

    if (existingRound.status === 'evaluated') {
      return res.status(409).json({
        success: false,
        code: 'ROUND_ALREADY_EVALUATED',
        message: `Round for Level ${currentLevel} has already been evaluated.`,
      });
    }

    // 4. Sync inProgress deadline state so expired rounds accurately record before evaluation
    let targetRound = existingRound;
    if (existingRound.status === 'inProgress') {
      const timerSync = await syncRoundDeadlineState(existingRound);
      if (timerSync.error) {
        return res.status(timerSync.error.status).json({
          success: false,
          code: timerSync.error.code,
          message: timerSync.error.message,
        });
      }
      targetRound = timerSync.round;
    }

    // 5. Enforce eligibility: only 'inProgress' or 'timeExpired' rounds may be evaluated
    if (!['inProgress', 'timeExpired'].includes(targetRound.status)) {
      return res.status(409).json({
        success: false,
        code: targetRound.status === 'evaluated' ? 'ROUND_ALREADY_EVALUATED' : 'INVALID_ROUND_STATUS',
        message:
          targetRound.status === 'evaluated'
            ? `Round for Level ${currentLevel} has already been evaluated.`
            : `Cannot evaluate round with status '${targetRound.status}'. Only 'inProgress' or 'timeExpired' rounds may be evaluated.`,
      });
    }

    // 6. Guard against existing Evaluation document for this round
    const existingEvaluation = await Evaluation.findOne({ roundId: targetRound._id });
    if (existingEvaluation) {
      return res.status(409).json({
        success: false,
        code: 'ROUND_ALREADY_EVALUATED',
        message: `Round for Level ${currentLevel} has already been evaluated.`,
      });
    }

    // 7. Atomically transition Round status from inProgress/timeExpired -> evaluated
    const evaluatedAt = new Date();
    const preEvaluationStatus = targetRound.status;

    const evaluatedRound = await Round.findOneAndUpdate(
      {
        _id: targetRound._id,
        status: { $in: ['inProgress', 'timeExpired'] },
      },
      {
        $set: {
          status: 'evaluated',
          completedAt: evaluatedAt,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!evaluatedRound) {
      const latestRound = await Round.findById(targetRound._id);
      const latestStatus = latestRound ? latestRound.status : 'unknown';
      return res.status(409).json({
        success: false,
        code: latestStatus === 'evaluated' ? 'ROUND_ALREADY_EVALUATED' : 'INVALID_ROUND_STATUS',
        message:
          latestStatus === 'evaluated'
            ? `Round for Level ${currentLevel} has already been evaluated.`
            : `Cannot evaluate round with current status '${latestStatus}'.`,
      });
    }

    // 8. Persist authoritative Evaluation document (unique index on roundId prevents duplicates)
    const evaluationDoc = new Evaluation({
      roundId: evaluatedRound._id,
      studentId: student._id,
      questionId: evaluatedRound.questionId,
      levelNumber: currentLevel,
      status: normalizedResult,
      evaluatedBy: req.volunteer._id,
      evaluatedAt,
      programmingLanguage: normalizedLanguage,
      volunteerNotes: normalizedRemarks,
    });

    let savedEvaluation;
    try {
      savedEvaluation = await evaluationDoc.save();
    } catch (saveError) {
      if (saveError.code === 11000 || (saveError.message && saveError.message.includes('E11000'))) {
        return res.status(409).json({
          success: false,
          code: 'ROUND_ALREADY_EVALUATED',
          message: `Round for Level ${currentLevel} has already been evaluated.`,
        });
      }

      // Compensating rollback if Evaluation persistence fails for a non-duplicate database error
      await Round.findOneAndUpdate(
        { _id: evaluatedRound._id, status: 'evaluated' },
        { $set: { status: preEvaluationStatus, completedAt: null } }
      );
      throw saveError;
    }

    // 9. Return sanitized evaluation summary (no hiddenTestCases, passwordHash, or googleSubjectId)
    return res.status(200).json({
      success: true,
      message: `Round evaluated as ${normalizedResult}.`,
      evaluation: formatEvaluationResponse(savedEvaluation),
      student: formatStudentVolunteerResponse(student, evaluatedRound),
      round: {
        ...formatRoundStudentResponse(evaluatedRound),
        startedBy: evaluatedRound.startedBy ? evaluatedRound.startedBy.toString() : null,
      },
      evaluatedBy: {
        id: req.volunteer._id.toString(),
        name: req.volunteer.name,
        username: req.volunteer.username,
        assignedLab: req.volunteer.assignedLab || '',
      },
    });
  } catch (error) {
    console.error('Error evaluating student round:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to evaluate student round.',
    });
  }
};

/**
 * Helper to create a structured HTTP error that cleanly aborts MongoDB transactions.
 */
const createSettlementHttpError = (status, code, message) => {
  const err = new Error(message);
  err.isSettlementHttpError = true;
  err.status = status;
  err.code = code;
  return err;
};

/**
 * Derive authoritative immutable Transaction type from evaluation status,
 * balance delta, and Level safe-zone flag (never inferred from entryRiskAmount).
 */
const resolveSettlementTransactionType = (evaluationStatus, deltaAmount, levelConfig) => {
  if (evaluationStatus === 'PASS') {
    return 'REWARD_CREDIT';
  }
  if (deltaAmount < 0) {
    return 'STAKE_DEBIT';
  }
  if (levelConfig.isSafeZone === true) {
    return 'SAFE_ZONE_PAYOUT';
  }
  return 'ROUND_SETTLEMENT';
};

/**
 * Format immutable Transaction document for API response.
 */
const formatTransactionResponse = (transaction) => ({
  id: (transaction._id || '').toString(),
  studentId: (transaction.studentId || '').toString(),
  type: transaction.type,
  amount: transaction.amount,
  balanceAfter: transaction.balanceAfter,
  levelNumber: transaction.levelNumber,
  roundId: transaction.roundId ? transaction.roundId.toString() : null,
  settlementKey: transaction.settlementKey || null,
  description: transaction.description,
  performedBy: transaction.performedBy ? transaction.performedBy.toString() : null,
  timestamp: transaction.timestamp,
});

/**
 * Helper to fetch and cross-verify authoritative Student, current-level Round,
 * and active Level configuration inside a MongoDB transaction session.
 */
const loadTxStudentRoundAndLevel = async ({
  session,
  studentId,
  normalizedUsn,
  detectAlreadyProgressedOnAdvance = false,
  actionLabel = 'settle',
}) => {
  const sessionStudent = await Student.findById(studentId).session(session);
  if (!sessionStudent) {
    throw createSettlementHttpError(404, 'STUDENT_NOT_FOUND', `Student ${normalizedUsn} no longer exists.`);
  }

  const sessionCurrentLevel = sessionStudent.currentLevel;
  if (!sessionCurrentLevel || sessionCurrentLevel < 1 || sessionCurrentLevel > 6) {
    throw createSettlementHttpError(400, 'INVALID_STUDENT_LEVEL', 'Student current level is invalid.');
  }

  const sessionRound = await Round.findOne({
    studentId: sessionStudent._id,
    levelNumber: sessionCurrentLevel,
  }).session(session);

  if (!sessionRound) {
    if (detectAlreadyProgressedOnAdvance && sessionCurrentLevel > 1) {
      const previousRound = await Round.findOne({
        studentId: sessionStudent._id,
        levelNumber: sessionCurrentLevel - 1,
      }).session(session);

      if (previousRound && previousRound.status === 'evaluated') {
        const previousEvaluation = await Evaluation.findOne({ roundId: previousRound._id }).session(session);
        if (previousEvaluation && previousEvaluation.isProgressed) {
          throw createSettlementHttpError(
            409,
            'ROUND_ALREADY_PROGRESSED',
            `Round for Level ${sessionCurrentLevel - 1} has already been progressed (student is now at Level ${sessionCurrentLevel}).`
          );
        }
      }
    }

    if (detectAlreadyProgressedOnAdvance && sessionStudent.competitionStatus === 'eliminated') {
      throw createSettlementHttpError(
        409,
        'STUDENT_ELIMINATED',
        'Student has already been eliminated and cannot progress further.'
      );
    }

    if (detectAlreadyProgressedOnAdvance && sessionStudent.competitionStatus === 'completed') {
      throw createSettlementHttpError(
        409,
        'COMPETITION_COMPLETED',
        'Student has already completed all competition levels.'
      );
    }

    throw createSettlementHttpError(
      404,
      'ROUND_NOT_ALLOCATED',
      `Round for Level ${sessionCurrentLevel} no longer exists.`
    );
  }

  if (!sessionRound.studentId || sessionRound.studentId.toString() !== sessionStudent._id.toString()) {
    throw createSettlementHttpError(
      409,
      'ROUND_STUDENT_MISMATCH',
      'Round ownership mismatch against authenticated student record.'
    );
  }

  if (sessionRound.levelNumber !== sessionCurrentLevel) {
    throw createSettlementHttpError(
      409,
      'ROUND_LEVEL_MISMATCH',
      `Round level (${sessionRound.levelNumber}) does not match student currentLevel (${sessionCurrentLevel}).`
    );
  }

  if (sessionRound.status !== 'evaluated') {
    throw createSettlementHttpError(
      409,
      'ROUND_NOT_EVALUATED',
      `Cannot ${actionLabel} round with status '${sessionRound.status}'.`
    );
  }

  const levelConfig = await Level.findOne({
    number: sessionCurrentLevel,
    isActive: true,
  }).session(session);

  if (!levelConfig || levelConfig.number !== sessionCurrentLevel) {
    throw createSettlementHttpError(
      404,
      'LEVEL_NOT_FOUND',
      `Active level configuration for Level ${sessionCurrentLevel} was not found.`
    );
  }

  return { sessionStudent, sessionCurrentLevel, sessionRound, levelConfig };
};

/**
 * Helper to verify Evaluation ownership, level, round link, and terminal grading status.
 */
const verifyEvaluationLinks = (claimedEvaluation, sessionRound, sessionStudent) => {
  if (!claimedEvaluation.roundId || claimedEvaluation.roundId.toString() !== sessionRound._id.toString()) {
    throw createSettlementHttpError(
      409,
      'EVALUATION_ROUND_MISMATCH',
      'Evaluation round reference does not match current round.'
    );
  }

  if (!claimedEvaluation.studentId || claimedEvaluation.studentId.toString() !== sessionStudent._id.toString()) {
    throw createSettlementHttpError(
      409,
      'EVALUATION_STUDENT_MISMATCH',
      'Evaluation student reference does not match current student.'
    );
  }

  if (claimedEvaluation.levelNumber !== sessionRound.levelNumber) {
    throw createSettlementHttpError(
      409,
      'EVALUATION_LEVEL_MISMATCH',
      `Evaluation level (${claimedEvaluation.levelNumber}) does not match round level (${sessionRound.levelNumber}).`
    );
  }

  if (!['PASS', 'FAIL'].includes(claimedEvaluation.status)) {
    throw createSettlementHttpError(
      409,
      'EVALUATION_PENDING',
      `Cannot settle evaluation with status '${claimedEvaluation.status}'.`
    );
  }
};

/**
 * Execute Task 7 wallet settlement, immutable Transaction insert, and Evaluation linkage
 * inside an active MongoDB transaction session.
 */
const applyRoundSettlementInTx = async ({
  session,
  volunteerId,
  settledAt,
  sessionStudent,
  sessionCurrentLevel,
  sessionRound,
  levelConfig,
  claimedEvaluation,
  updateStudentWallet = true,
}) => {
  const previousWalletBalance = sessionStudent.walletBalance ?? 0;
  const targetBalance =
    claimedEvaluation.status === 'PASS'
      ? levelConfig.winningPayout
      : levelConfig.losingPayout;

  if (typeof targetBalance !== 'number' || !Number.isFinite(targetBalance) || targetBalance < 0) {
    throw createSettlementHttpError(
      500,
      'INVALID_LEVEL_PAYOUT',
      `Authoritative payout configuration for Level ${sessionCurrentLevel} is invalid.`
    );
  }

  const deltaAmount = targetBalance - previousWalletBalance;
  const transactionAmount = Math.abs(deltaAmount);
  const transactionType = resolveSettlementTransactionType(
    claimedEvaluation.status,
    deltaAmount,
    levelConfig
  );
  const settlementKey = `round_settlement:${sessionRound._id.toString()}`;
  const description = `Level ${sessionCurrentLevel} ${claimedEvaluation.status} settlement (${previousWalletBalance} -> ${targetBalance})`;

  let updatedStudent = sessionStudent;
  if (updateStudentWallet) {
    updatedStudent = await Student.findByIdAndUpdate(
      sessionStudent._id,
      {
        $set: {
          walletBalance: targetBalance,
        },
      },
      {
        session,
        new: true,
        runValidators: true,
      }
    );

    if (!updatedStudent) {
      throw createSettlementHttpError(404, 'STUDENT_NOT_FOUND', 'Student update failed during settlement.');
    }
  }

  const transactionDoc = new Transaction({
    studentId: sessionStudent._id,
    type: transactionType,
    amount: transactionAmount,
    balanceAfter: targetBalance,
    levelNumber: sessionCurrentLevel,
    roundId: sessionRound._id,
    settlementKey,
    description,
    performedBy: volunteerId,
    timestamp: settledAt,
  });

  const savedTransaction = await transactionDoc.save({ session });

  const finalizedEvaluation = await Evaluation.findByIdAndUpdate(
    claimedEvaluation._id,
    {
      $set: {
        settlementTransactionId: savedTransaction._id,
      },
    },
    {
      session,
      new: true,
      runValidators: true,
    }
  );

  return {
    previousWalletBalance,
    targetBalance,
    deltaAmount,
    updatedStudent,
    finalizedEvaluation: finalizedEvaluation || claimedEvaluation,
    savedTransaction,
  };
};

/**
 * Retrieve and verify an existing settlement Transaction when progression reuses prior settlement.
 */
const resolveExistingSettlementInTx = async ({
  session,
  claimedEvaluation,
  sessionStudent,
  sessionRound,
  sessionCurrentLevel,
  levelConfig,
}) => {
  const settlementKey = `round_settlement:${sessionRound._id.toString()}`;
  let existingTransaction = null;

  if (claimedEvaluation.settlementTransactionId) {
    existingTransaction = await Transaction.findById(claimedEvaluation.settlementTransactionId).session(session);
  }
  if (!existingTransaction) {
    existingTransaction = await Transaction.findOne({ settlementKey }).session(session);
  }

  if (!existingTransaction) {
    throw createSettlementHttpError(
      500,
      'INCONSISTENT_SETTLEMENT_STATE',
      'Evaluation is marked settled, but its immutable settlement transaction could not be found.'
    );
  }

  if (
    !existingTransaction.studentId ||
    existingTransaction.studentId.toString() !== sessionStudent._id.toString() ||
    !existingTransaction.roundId ||
    existingTransaction.roundId.toString() !== sessionRound._id.toString()
  ) {
    throw createSettlementHttpError(
      409,
      'INCONSISTENT_SETTLEMENT_STATE',
      'Settlement transaction ownership mismatch detected.'
    );
  }

  const targetBalance =
    claimedEvaluation.status === 'PASS'
      ? levelConfig.winningPayout
      : levelConfig.losingPayout;

  if (typeof targetBalance !== 'number' || !Number.isFinite(targetBalance) || targetBalance < 0) {
    throw createSettlementHttpError(
      500,
      'INVALID_LEVEL_PAYOUT',
      `Authoritative payout configuration for Level ${sessionCurrentLevel} is invalid.`
    );
  }

  if (
    existingTransaction.balanceAfter !== targetBalance ||
    (sessionStudent.walletBalance ?? 0) !== targetBalance
  ) {
    throw createSettlementHttpError(
      409,
      'INCONSISTENT_SETTLEMENT_STATE',
      'Existing settlement balance does not match authoritative level payout rules.'
    );
  }

  const previousWalletBalance =
    existingTransaction.type === 'STAKE_DEBIT'
      ? existingTransaction.balanceAfter + existingTransaction.amount
      : existingTransaction.balanceAfter - existingTransaction.amount;

  return {
    previousWalletBalance,
    targetBalance,
    deltaAmount: targetBalance - previousWalletBalance,
    existingTransaction,
  };
};

/**
 * Shared error responder for transactional settlement and progression controllers.
 */
const handleTxErrorResponse = (res, error, {
  logPrefix,
  duplicateKeyCode,
  duplicateKeyMessage,
  conflictCode,
  conflictMessage,
  fallbackMessage,
}) => {
  if (error && error.isSettlementHttpError) {
    return res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }

  if (error && (error.code === 11000 || (error.message && error.message.includes('E11000')))) {
    return res.status(409).json({
      success: false,
      code: duplicateKeyCode,
      message: duplicateKeyMessage,
    });
  }

  if (
    error &&
    (error.code === 112 ||
      (typeof error.hasErrorLabel === 'function' && error.hasErrorLabel('TransientTransactionError')))
  ) {
    return res.status(409).json({
      success: false,
      code: conflictCode,
      message: conflictMessage,
    });
  }

  console.error(`${logPrefix}:`, error.message);
  return res.status(500).json({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    message: fallbackMessage,
  });
};

/**
 * Atomically settle a student's wallet balance based on their already-recorded PASS/FAIL evaluation
 * Endpoint: POST /api/volunteer/students/:usn/round/settle
 * Access: Protected (Volunteer only)
 *
 * Scope: Updates ONLY student.walletBalance and creates ONE immutable Transaction ledger entry
 * inside a MongoDB ACID transaction, preserving Evaluation status and leaving progression
 * fields (currentLevel, levelsCleared, competitionStatus, safeZoneAmount, totals) unchanged.
 */
const settleStudentRoundByUsn = async (req, res) => {
  // 1. Reject any client-supplied wallet amounts, evaluation results, or level overrides
  const bodyKeys = Object.keys(req.body || {});
  if (bodyKeys.length > 0) {
    return res.status(400).json({
      success: false,
      code: 'UNSUPPORTED_FIELDS',
      message: `Settlement requests do not accept request body fields: ${bodyKeys.join(', ')}.`,
    });
  }

  // 2. Validate USN, locate registered student, verify registrationComplete and currentLevel
  const resolved = await resolveRegisteredStudent(req.params.usn);
  if (resolved.error) {
    return res.status(resolved.error.status).json({
      success: false,
      code: resolved.error.code,
      message: resolved.error.message,
    });
  }

  const { student, normalizedUsn } = resolved;
  const currentLevel = student.currentLevel;

  // 3. Locate student's round for their current level
  const existingRound = await Round.findOne({
    studentId: student._id,
    levelNumber: currentLevel,
  });

  if (!existingRound) {
    return res.status(404).json({
      success: false,
      code: 'ROUND_NOT_ALLOCATED',
      message: `Student ${normalizedUsn} does not have an allocated round for Level ${currentLevel}.`,
    });
  }

  if (existingRound.status !== 'evaluated') {
    return res.status(409).json({
      success: false,
      code: 'ROUND_NOT_EVALUATED',
      message: `Cannot settle round with status '${existingRound.status}'. Round must be evaluated before settlement.`,
    });
  }

  // 4. Execute atomic MongoDB transaction covering Evaluation claim, Student wallet update, and Transaction insert
  const session = await mongoose.startSession();
  let settlementOutput = null;

  try {
    await session.withTransaction(async () => {
      const { sessionStudent, sessionCurrentLevel, sessionRound, levelConfig } =
        await loadTxStudentRoundAndLevel({
          session,
          studentId: student._id,
          normalizedUsn,
          detectAlreadyProgressedOnAdvance: false,
        });

      const settledAt = new Date();
      const claimedEvaluation = await Evaluation.findOneAndUpdate(
        {
          roundId: sessionRound._id,
          $or: [{ isSettled: false }, { isSettled: { $exists: false } }],
        },
        {
          $set: {
            isSettled: true,
            settledAt,
            settledBy: req.volunteer._id,
          },
        },
        {
          session,
          new: true,
          runValidators: true,
        }
      );

      if (!claimedEvaluation) {
        const existingEval = await Evaluation.findOne({ roundId: sessionRound._id }).session(session);
        if (!existingEval) {
          throw createSettlementHttpError(
            404,
            'EVALUATION_NOT_FOUND',
            `No evaluation record found for Level ${sessionCurrentLevel} round.`
          );
        }
        throw createSettlementHttpError(
          409,
          'ROUND_ALREADY_SETTLED',
          `Round for Level ${sessionCurrentLevel} has already been settled.`
        );
      }

      verifyEvaluationLinks(claimedEvaluation, sessionRound, sessionStudent);

      const settlementResult = await applyRoundSettlementInTx({
        session,
        volunteerId: req.volunteer._id,
        settledAt,
        sessionStudent,
        sessionCurrentLevel,
        sessionRound,
        levelConfig,
        claimedEvaluation,
        updateStudentWallet: true,
      });

      settlementOutput = {
        previousWalletBalance: settlementResult.previousWalletBalance,
        targetBalance: settlementResult.targetBalance,
        deltaAmount: settlementResult.deltaAmount,
        isSafeZone: Boolean(levelConfig.isSafeZone),
        student: settlementResult.updatedStudent,
        round: sessionRound,
        evaluation: settlementResult.finalizedEvaluation,
        transaction: settlementResult.savedTransaction,
      };
    });

    return res.status(200).json({
      success: true,
      message: `Round wallet settled successfully (${settlementOutput.evaluation.status}).`,
      settlement: {
        previousWalletBalance: settlementOutput.previousWalletBalance,
        targetBalance: settlementOutput.targetBalance,
        deltaAmount: settlementOutput.deltaAmount,
        evaluationResult: settlementOutput.evaluation.status,
        isSafeZone: settlementOutput.isSafeZone,
      },
      student: formatStudentVolunteerResponse(settlementOutput.student, settlementOutput.round),
      evaluation: formatEvaluationResponse(settlementOutput.evaluation),
      transaction: formatTransactionResponse(settlementOutput.transaction),
      round: {
        ...formatRoundStudentResponse(settlementOutput.round),
        startedBy: settlementOutput.round.startedBy ? settlementOutput.round.startedBy.toString() : null,
      },
      settledBy: {
        id: req.volunteer._id.toString(),
        name: req.volunteer.name,
        username: req.volunteer.username,
        assignedLab: req.volunteer.assignedLab || '',
      },
    });
  } catch (error) {
    return handleTxErrorResponse(res, error, {
      logPrefix: 'Error settling student round wallet',
      duplicateKeyCode: 'ROUND_ALREADY_SETTLED',
      duplicateKeyMessage: `Round for Level ${currentLevel} has already been settled.`,
      conflictCode: 'SETTLEMENT_CONFLICT',
      conflictMessage: 'Concurrent settlement conflict occurred. Please verify round status before retrying.',
      fallbackMessage: 'Failed to settle student round wallet.',
    });
  } finally {
    await session.endSession();
  }
};

/**
 * Atomically progress a student after round evaluation, automatically performing wallet
 * settlement first inside the same transaction if not yet settled (reusing existing settlement
 * without creating duplicate transactions when already settled).
 * Endpoint: POST /api/volunteer/students/:usn/round/progress
 * Access: Protected (Volunteer only)
 */
const progressStudentRoundByUsn = async (req, res) => {
  // 1. Reject any client-supplied progression, balance, level, or verdict parameters
  const bodyKeys = Object.keys(req.body || {});
  if (bodyKeys.length > 0) {
    return res.status(400).json({
      success: false,
      code: 'UNSUPPORTED_FIELDS',
      message: `Progression requests do not accept request body fields: ${bodyKeys.join(', ')}.`,
    });
  }

  // 2. Validate USN, locate registered student, verify registrationComplete and currentLevel
  const resolved = await resolveRegisteredStudent(req.params.usn);
  if (resolved.error) {
    return res.status(resolved.error.status).json({
      success: false,
      code: resolved.error.code,
      message: resolved.error.message,
    });
  }

  const { student, normalizedUsn } = resolved;
  const session = await mongoose.startSession();
  let progressionOutput = null;

  try {
    await session.withTransaction(async () => {
      // 3. Load Student, current-level Round (detecting already-progressed prior level), and active Level inside tx
      const { sessionStudent, sessionCurrentLevel, sessionRound, levelConfig } =
        await loadTxStudentRoundAndLevel({
          session,
          studentId: student._id,
          normalizedUsn,
          detectAlreadyProgressedOnAdvance: true,
          actionLabel: 'progress',
        });

      // 4. Atomically claim progression on Evaluation so each evaluated round progresses at most once
      const progressedAt = new Date();
      const claimedProgressionEval = await Evaluation.findOneAndUpdate(
        {
          roundId: sessionRound._id,
          $or: [{ isProgressed: false }, { isProgressed: { $exists: false } }],
        },
        {
          $set: {
            isProgressed: true,
            progressedAt,
            progressedBy: req.volunteer._id,
          },
        },
        {
          session,
          new: true,
          runValidators: true,
        }
      );

      if (!claimedProgressionEval) {
        const existingEval = await Evaluation.findOne({ roundId: sessionRound._id }).session(session);
        if (!existingEval) {
          throw createSettlementHttpError(
            404,
            'EVALUATION_NOT_FOUND',
            `No evaluation record found for Level ${sessionCurrentLevel} round.`
          );
        }
        throw createSettlementHttpError(
          409,
          'ROUND_ALREADY_PROGRESSED',
          `Round for Level ${sessionCurrentLevel} has already been progressed.`
        );
      }

      verifyEvaluationLinks(claimedProgressionEval, sessionRound, sessionStudent);

      if (sessionStudent.competitionStatus === 'eliminated') {
        throw createSettlementHttpError(
          409,
          'STUDENT_ELIMINATED',
          'Student has already been eliminated and cannot progress further.'
        );
      }

      if (sessionStudent.competitionStatus === 'completed') {
        throw createSettlementHttpError(
          409,
          'COMPETITION_COMPLETED',
          'Student has already completed all competition levels.'
        );
      }

      // 5. Ensure settlement exists once: reuse if already settled, else settle atomically in same tx
      let didSettleNow = false;
      let previousWalletBalance;
      let targetBalance;
      let deltaAmount;
      let finalizedEvaluation = claimedProgressionEval;
      let settlementTransaction;

      if (claimedProgressionEval.isSettled) {
        const existingSettlement = await resolveExistingSettlementInTx({
          session,
          claimedEvaluation: claimedProgressionEval,
          sessionStudent,
          sessionRound,
          sessionCurrentLevel,
          levelConfig,
        });
        previousWalletBalance = existingSettlement.previousWalletBalance;
        targetBalance = existingSettlement.targetBalance;
        deltaAmount = existingSettlement.deltaAmount;
        settlementTransaction = existingSettlement.existingTransaction;
      } else {
        const claimedSettlementEval = await Evaluation.findOneAndUpdate(
          {
            _id: claimedProgressionEval._id,
            $or: [{ isSettled: false }, { isSettled: { $exists: false } }],
          },
          {
            $set: {
              isSettled: true,
              settledAt: progressedAt,
              settledBy: req.volunteer._id,
            },
          },
          {
            session,
            new: true,
            runValidators: true,
          }
        );

        if (!claimedSettlementEval) {
          throw createSettlementHttpError(
            409,
            'SETTLEMENT_CONFLICT',
            'Concurrent settlement state change detected during progression. Please retry.'
          );
        }

        const settlementResult = await applyRoundSettlementInTx({
          session,
          volunteerId: req.volunteer._id,
          settledAt: progressedAt,
          sessionStudent,
          sessionCurrentLevel,
          sessionRound,
          levelConfig,
          claimedEvaluation: claimedSettlementEval,
          updateStudentWallet: false,
        });

        didSettleNow = true;
        previousWalletBalance = settlementResult.previousWalletBalance;
        targetBalance = settlementResult.targetBalance;
        deltaAmount = settlementResult.deltaAmount;
        finalizedEvaluation = settlementResult.finalizedEvaluation;
        settlementTransaction = settlementResult.savedTransaction;
      }

      // 6. Compute progression, safe-zone protection (strictly L1 & L4 on PASS), and cumulative statistics
      const isPass = finalizedEvaluation.status === 'PASS';
      const isFinalLevel = Boolean(levelConfig.isFinal) || sessionCurrentLevel === 6;
      const isSafeZoneCheckpoint =
        isPass && Boolean(levelConfig.isSafeZone) && Number(levelConfig.safeZoneAmount) > 0;

      const prevLevelsCleared = sessionStudent.levelsCleared ?? 0;
      const prevHighestLevel = sessionStudent.highestLevelReached ?? 1;
      const prevSafeZoneAmount = sessionStudent.safeZoneAmount ?? 0;
      const prevTotalEarned = sessionStudent.totalEarned ?? 0;
      const prevTotalRisked = sessionStudent.totalRisked ?? 0;

      const entryRiskAmount =
        typeof levelConfig.entryRiskAmount === 'number' &&
        Number.isFinite(levelConfig.entryRiskAmount) &&
        levelConfig.entryRiskAmount >= 0
          ? levelConfig.entryRiskAmount
          : 0;

      // Positive incremental PASS reward only (L1 FAIL safe-zone payout never increments totalEarned)
      const earnedIncrement = isPass ? Math.max(0, deltaAmount) : 0;
      const riskedIncrement = entryRiskAmount;
      const nextTotalEarned = prevTotalEarned + earnedIncrement;
      const nextTotalRisked = prevTotalRisked + riskedIncrement;

      let nextCurrentLevel = sessionCurrentLevel;
      let nextLevelsCleared = prevLevelsCleared;
      let nextHighestLevel = Math.max(prevHighestLevel, sessionCurrentLevel);
      let nextCompetitionStatus;
      let nextRoundAvailability;
      let nextSafeZoneAmount = prevSafeZoneAmount;

      if (isPass) {
        nextLevelsCleared = Math.max(prevLevelsCleared, sessionCurrentLevel);
        if (isSafeZoneCheckpoint) {
          nextSafeZoneAmount = Math.max(prevSafeZoneAmount, levelConfig.safeZoneAmount);
        }

        if (isFinalLevel) {
          nextCurrentLevel = 6;
          nextHighestLevel = 6;
          nextCompetitionStatus = 'completed';
          nextRoundAvailability = 'completed';
        } else {
          nextCurrentLevel = sessionCurrentLevel + 1;
          nextHighestLevel = Math.max(prevHighestLevel, nextCurrentLevel);
          nextCompetitionStatus = 'inProgress';
          nextRoundAvailability = 'ready';
        }
      } else {
        // FAIL at any level immediately eliminates the participant; L1 FAIL leaves safeZoneAmount unchanged (0)
        nextCompetitionStatus = 'eliminated';
        nextRoundAvailability = 'eliminated';
      }

      if (targetBalance < nextSafeZoneAmount) {
        throw createSettlementHttpError(
          500,
          'SAFE_ZONE_CONSISTENCY_ERROR',
          `Wallet balance (${targetBalance}) cannot fall below protected safe-zone amount (${nextSafeZoneAmount}).`
        );
      }

      const studentUpdateSet = {
        currentLevel: nextCurrentLevel,
        highestLevelReached: nextHighestLevel,
        levelsCleared: nextLevelsCleared,
        competitionStatus: nextCompetitionStatus,
        roundAvailability: nextRoundAvailability,
        safeZoneAmount: nextSafeZoneAmount,
        totalEarned: nextTotalEarned,
        totalRisked: nextTotalRisked,
      };
      if (didSettleNow) {
        studentUpdateSet.walletBalance = targetBalance;
      }

      const updatedStudent = await Student.findByIdAndUpdate(
        sessionStudent._id,
        { $set: studentUpdateSet },
        {
          session,
          new: true,
          runValidators: true,
        }
      );

      if (!updatedStudent) {
        throw createSettlementHttpError(404, 'STUDENT_NOT_FOUND', 'Student update failed during progression.');
      }

      progressionOutput = {
        didSettleNow,
        previousWalletBalance,
        targetBalance,
        deltaAmount,
        isLevelSafeZone: Boolean(levelConfig.isSafeZone),
        isSafeZoneCheckpoint,
        isPass,
        isFinalLevel,
        previousLevel: sessionCurrentLevel,
        newLevel: nextCurrentLevel,
        earnedIncrement,
        riskedIncrement,
        student: updatedStudent,
        round: sessionRound,
        evaluation: finalizedEvaluation,
        transaction: settlementTransaction,
      };
    });

    // For L1-L5 PASS, student advanced to nextCurrentLevel where no Round is allocated yet (availability: 'ready')
    const studentViewRound =
      progressionOutput.isPass && !progressionOutput.isFinalLevel ? null : progressionOutput.round;

    return res.status(200).json({
      success: true,
      message: progressionOutput.isPass
        ? progressionOutput.isFinalLevel
          ? 'Final level cleared. Competition completed successfully.'
          : `Level ${progressionOutput.previousLevel} cleared. Student advanced to Level ${progressionOutput.newLevel}.`
        : `Round failed at Level ${progressionOutput.previousLevel}. Student has been eliminated.`,
      settlement: {
        didSettleNow: progressionOutput.didSettleNow,
        previousWalletBalance: progressionOutput.previousWalletBalance,
        targetBalance: progressionOutput.targetBalance,
        deltaAmount: progressionOutput.deltaAmount,
        evaluationResult: progressionOutput.evaluation.status,
        isSafeZone: progressionOutput.isLevelSafeZone,
      },
      progression: {
        evaluatedLevel: progressionOutput.previousLevel,
        evaluationResult: progressionOutput.evaluation.status,
        advancedToLevel:
          progressionOutput.isPass && !progressionOutput.isFinalLevel
            ? progressionOutput.newLevel
            : null,
        isCompleted: progressionOutput.student.competitionStatus === 'completed',
        isEliminated: progressionOutput.student.competitionStatus === 'eliminated',
        isSafeZoneCleared: progressionOutput.isSafeZoneCheckpoint,
        previousLevel: progressionOutput.previousLevel,
        newLevel: progressionOutput.newLevel,
        levelsCleared: progressionOutput.student.levelsCleared,
        highestLevelReached: progressionOutput.student.highestLevelReached,
        competitionStatus: progressionOutput.student.competitionStatus,
        roundAvailability: progressionOutput.student.roundAvailability,
        safeZoneAmount: progressionOutput.student.safeZoneAmount,
        earnedIncrement: progressionOutput.earnedIncrement,
        totalEarned: progressionOutput.student.totalEarned,
        riskedIncrement: progressionOutput.riskedIncrement,
        totalRisked: progressionOutput.student.totalRisked,
      },
      student: formatStudentVolunteerResponse(progressionOutput.student, studentViewRound),
      evaluation: formatEvaluationResponse(progressionOutput.evaluation),
      transaction: formatTransactionResponse(progressionOutput.transaction),
      round: {
        ...formatRoundStudentResponse(progressionOutput.round),
        startedBy: progressionOutput.round.startedBy ? progressionOutput.round.startedBy.toString() : null,
      },
      progressedBy: {
        id: req.volunteer._id.toString(),
        name: req.volunteer.name,
        username: req.volunteer.username,
        assignedLab: req.volunteer.assignedLab || '',
      },
    });
  } catch (error) {
    return handleTxErrorResponse(res, error, {
      logPrefix: 'Error progressing student round',
      duplicateKeyCode: 'ROUND_ALREADY_SETTLED',
      duplicateKeyMessage: 'Round settlement already exists for this round.',
      conflictCode: 'PROGRESSION_CONFLICT',
      conflictMessage: 'Concurrent progression conflict occurred. Please verify round status before retrying.',
      fallbackMessage: 'Failed to progress student round.',
    });
  } finally {
    await session.endSession();
  }
};

module.exports = {
  volunteerLogin,
  getVolunteerMe,
  getStudentActiveRoundByUsn,
  startStudentRoundByUsn,
  extendStudentRoundByUsn,
  evaluateStudentRoundByUsn,
  settleStudentRoundByUsn,
  progressStudentRoundByUsn,
};
