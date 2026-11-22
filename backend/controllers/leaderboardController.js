const { Student, Evaluation, Transaction } = require('../models');
const { parsePaginationQuery, buildPaginationMeta } = require('./studentController');

const ALLOWED_COMPETITION_STATUSES = ['registered', 'inProgress', 'cleared', 'eliminated', 'completed'];
const ALLOWED_ACADEMIC_YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

/**
 * Safely parse optional competitionStatus and year query filters.
 */
const parseLeaderboardFilters = (query = {}) => {
  const filters = {};

  if (query.competitionStatus !== undefined) {
    if (typeof query.competitionStatus !== 'string') {
      return {
        error: {
          status: 400,
          code: 'INVALID_COMPETITION_STATUS',
          message: `Query parameter 'competitionStatus' must be one of: ${ALLOWED_COMPETITION_STATUSES.join(', ')}.`,
        },
      };
    }
    const normalizedStatus = query.competitionStatus.trim();
    if (!ALLOWED_COMPETITION_STATUSES.includes(normalizedStatus)) {
      return {
        error: {
          status: 400,
          code: 'INVALID_COMPETITION_STATUS',
          message: `Invalid competitionStatus filter '${normalizedStatus}'. Allowed values: ${ALLOWED_COMPETITION_STATUSES.join(', ')}.`,
        },
      };
    }
    filters.competitionStatus = normalizedStatus;
  }

  if (query.year !== undefined) {
    if (typeof query.year !== 'string') {
      return {
        error: {
          status: 400,
          code: 'INVALID_YEAR_FILTER',
          message: `Query parameter 'year' must be one of: ${ALLOWED_ACADEMIC_YEARS.join(', ')}.`,
        },
      };
    }
    const normalizedYear = query.year.trim();
    if (!ALLOWED_ACADEMIC_YEARS.includes(normalizedYear)) {
      return {
        error: {
          status: 400,
          code: 'INVALID_YEAR_FILTER',
          message: `Invalid year filter '${normalizedYear}'. Allowed values: ${ALLOWED_ACADEMIC_YEARS.join(', ')}.`,
        },
      };
    }
    filters.year = normalizedYear;
  }

  return { filters };
};

/**
 * Execute a Mongoose read query with optional .select() and .lean() compatibility
 * for both live Mongoose Query objects and lightweight unit-test mocks.
 */
const runReadQuery = (query, selectFields) => {
  let q = query;
  if (q && typeof q.select === 'function') {
    q = q.select(selectFields);
  }
  if (q && typeof q.lean === 'function') {
    q = q.lean();
  }
  return q;
};

/**
 * Fetch eligible participants, progressed evaluations, and REWARD_CREDIT transactions
 * in parallel using safe minimal projections. Never writes to the database.
 */
const fetchLeaderboardDataset = async () => {
  const [students, evaluations, rewardTransactions] = await Promise.all([
    runReadQuery(
      Student.find({ role: 'STUDENT', registrationComplete: true }),
      'name usn year role registrationComplete currentLevel highestLevelReached levelsCleared competitionStatus walletBalance totalEarned'
    ),
    runReadQuery(
      Evaluation.find({ isProgressed: true }),
      'studentId levelNumber status isProgressed progressedAt evaluatedAt createdAt'
    ),
    runReadQuery(
      Transaction.find({ type: 'REWARD_CREDIT' }),
      'studentId type amount timestamp'
    ),
  ]);

  return {
    students: Array.isArray(students) ? students : [],
    evaluations: Array.isArray(evaluations) ? evaluations : [],
    rewardTransactions: Array.isArray(rewardTransactions) ? rewardTransactions : [],
  };
};

/**
 * Validate and convert a Date-like value to a finite Date instance without allowing
 * null/boolean -> epoch 0 coercions.
 */
const extractValidDate = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  const dateObj = value instanceof Date ? value : new Date(value);
  return Number.isFinite(dateObj.getTime()) ? dateObj : null;
};

/**
 * Extract the authoritative progression timestamp for an Evaluation record:
 * progressedAt -> evaluatedAt -> createdAt.
 */
const extractEvaluationTimestamp = (evaluation) => {
  if (!evaluation) {
    return null;
  }
  return (
    extractValidDate(evaluation.progressedAt) ||
    extractValidDate(evaluation.evaluatedAt) ||
    extractValidDate(evaluation.createdAt) ||
    null
  );
};

/**
 * Group progressed Evaluation records by studentId for O(1) ranking lookups.
 */
const buildProgressedEvalMap = (evaluations = []) => {
  const map = new Map();

  for (const ev of evaluations) {
    if (!ev || !ev.isProgressed || !ev.studentId) {
      continue;
    }
    const key = ev.studentId.toString();
    const levelNum = Number(ev.levelNumber) || 0;
    const timestamp = extractEvaluationTimestamp(ev);

    let record = map.get(key);
    if (!record) {
      record = {
        highestPassLevel: 0,
        highestPassTimestamp: null,
        highestAnyLevel: 0,
        highestAnyTimestamp: null,
      };
      map.set(key, record);
    }

    if (ev.status === 'PASS') {
      if (levelNum > record.highestPassLevel) {
        record.highestPassLevel = levelNum;
        record.highestPassTimestamp = timestamp;
      } else if (levelNum === record.highestPassLevel && timestamp) {
        if (!record.highestPassTimestamp || timestamp.getTime() > record.highestPassTimestamp.getTime()) {
          record.highestPassTimestamp = timestamp;
        }
      }
    }

    if (levelNum > record.highestAnyLevel) {
      record.highestAnyLevel = levelNum;
      record.highestAnyTimestamp = timestamp;
    } else if (levelNum === record.highestAnyLevel && timestamp) {
      if (!record.highestAnyTimestamp || timestamp.getTime() > record.highestAnyTimestamp.getTime()) {
        record.highestAnyTimestamp = timestamp;
      }
    }
  }

  return map;
};

/**
 * Group positive REWARD_CREDIT Transaction timestamps by studentId, retaining
 * the latest valid timestamp when cumulative earnings were reached.
 */
const buildRewardTxTimestampMap = (rewardTransactions = []) => {
  const map = new Map();

  for (const tx of rewardTransactions) {
    if (!tx || tx.type !== 'REWARD_CREDIT' || !tx.studentId) {
      continue;
    }
    if (typeof tx.amount !== 'number' || !Number.isFinite(tx.amount) || tx.amount <= 0) {
      continue;
    }
    const ts = extractValidDate(tx.timestamp);
    if (!ts) {
      continue;
    }
    const key = tx.studentId.toString();
    const existing = map.get(key);
    if (!existing || ts.getTime() > existing.getTime()) {
      map.set(key, ts);
    }
  }

  return map;
};

/**
 * Resolve reliable progression achievement timestamp without touching Student.updatedAt.
 */
const calculateProgressionAchievedAt = (student, evalSummary) => {
  if (!evalSummary) {
    return null;
  }
  const levelsCleared = student.levelsCleared ?? 0;
  if (levelsCleared > 0) {
    return evalSummary.highestPassTimestamp || null;
  }
  return evalSummary.highestAnyTimestamp || null;
};

/**
 * Resolve reliable earnings achievement timestamp for positive totalEarned participants.
 */
const calculateEarningsAchievedAt = (student, latestRewardTimestamp, progressionAchievedAt) => {
  const totalEarned = student.totalEarned ?? 0;
  if (totalEarned <= 0) {
    return null;
  }
  return latestRewardTimestamp || progressionAchievedAt || null;
};

/**
 * Build internal leaderboard entries strictly from eligible registered Student cohorts.
 */
const buildLeaderboardEntries = ({ students = [], evaluations = [], rewardTransactions = [] }) => {
  const evalMap = buildProgressedEvalMap(evaluations);
  const rewardMap = buildRewardTxTimestampMap(rewardTransactions);
  const entries = [];

  for (const student of students) {
    if (!student || student.registrationComplete !== true) {
      continue;
    }
    if (student.role !== undefined && student.role !== 'STUDENT') {
      continue;
    }

    const internalId = student._id ? student._id.toString() : '';
    const evalSummary = internalId ? evalMap.get(internalId) || null : null;
    const latestRewardTs = internalId ? rewardMap.get(internalId) || null : null;

    const progressionAchievedAt = calculateProgressionAchievedAt(student, evalSummary);
    const earningsAchievedAt = calculateEarningsAchievedAt(student, latestRewardTs, progressionAchievedAt);
    const competitionStatus = student.competitionStatus || 'registered';

    entries.push({
      _internalId: internalId,
      name: student.name || '',
      usn: student.usn || null,
      year: student.year || null,
      currentLevel: student.currentLevel ?? 1,
      highestLevelReached: student.highestLevelReached ?? 1,
      levelsCleared: student.levelsCleared ?? 0,
      walletBalance: student.walletBalance ?? 0,
      totalEarned: student.totalEarned ?? 0,
      competitionStatus,
      isCompleted: competitionStatus === 'completed',
      achievedAt: progressionAchievedAt,
      earningsAchievedAt,
    });
  }

  return entries;
};

/**
 * Compare two nullable Dates in ascending order with null timestamps ordered last.
 */
const compareNullableDateAsc = (aDate, bDate) => {
  const aMs = aDate ? aDate.getTime() : null;
  const bMs = bDate ? bDate.getTime() : null;
  if (aMs === bMs) {
    return 0;
  }
  if (aMs === null) {
    return 1;
  }
  if (bMs === null) {
    return -1;
  }
  return aMs - bMs;
};

/**
 * Deterministic alphabetical name + internal ID tie-breaker (internal ID is never exposed).
 */
const compareNamesAndIdsAsc = (a, b) => {
  const aLower = (a.name || '').trim().toLowerCase();
  const bLower = (b.name || '').trim().toLowerCase();
  if (aLower < bLower) return -1;
  if (aLower > bLower) return 1;

  if ((a.name || '') < (b.name || '')) return -1;
  if ((a.name || '') > (b.name || '')) return 1;

  return a._internalId.localeCompare(b._internalId);
};

/**
 * Compare two participants using the approved leaderboard priority:
 * highestLevelReached DESC -> levelsCleared DESC -> walletBalance DESC -> progressionAchievedAt ASC (null last) -> name ASC.
 */
const compareParticipantsForLeaderboard = (a, b) => {
  if (b.highestLevelReached !== a.highestLevelReached) {
    return b.highestLevelReached - a.highestLevelReached;
  }
  if (b.levelsCleared !== a.levelsCleared) {
    return b.levelsCleared - a.levelsCleared;
  }
  if (b.walletBalance !== a.walletBalance) {
    return b.walletBalance - a.walletBalance;
  }

  const tsCmp = compareNullableDateAsc(a.achievedAt, b.achievedAt);
  if (tsCmp !== 0) {
    return tsCmp;
  }

  return compareNamesAndIdsAsc(a, b);
};

/**
 * Determine whether two participants share identical primary ranking criteria
 * and therefore receive identical standard competition rank (e.g. 1, 1, 3).
 */
const hasSameRankCriteria = (a, b) => {
  const aMs = a.achievedAt ? a.achievedAt.getTime() : null;
  const bMs = b.achievedAt ? b.achievedAt.getTime() : null;
  return (
    a.highestLevelReached === b.highestLevelReached &&
    a.levelsCleared === b.levelsCleared &&
    a.walletBalance === b.walletBalance &&
    aMs === bMs
  );
};

/**
 * Sort participants and assign standard competition ranks (1, 1, 3).
 */
const rankParticipants = (entries = []) => {
  const sorted = [...entries].sort(compareParticipantsForLeaderboard);
  let prevRank = 0;

  return sorted.map((entry, idx) => {
    const rank =
      idx === 0
        ? 1
        : hasSameRankCriteria(entry, sorted[idx - 1])
          ? prevRank
          : idx + 1;
    prevRank = rank;
    return {
      ...entry,
      rank,
    };
  });
};

/**
 * Format a ranked participant entry cleanly without internal DB or staff IDs.
 */
const formatPublicLeaderboardEntry = (entry, viewerStudentId = null) => ({
  rank: entry.rank,
  name: entry.name,
  usn: entry.usn,
  year: entry.year,
  currentLevel: entry.currentLevel,
  highestLevelReached: entry.highestLevelReached,
  levelsCleared: entry.levelsCleared,
  walletBalance: entry.walletBalance,
  totalEarned: entry.totalEarned,
  competitionStatus: entry.competitionStatus,
  isCompleted: entry.isCompleted,
  achievedAt: entry.achievedAt,
  isCurrentUser: Boolean(viewerStudentId && entry._internalId === viewerStudentId),
});

/**
 * Compute competition completion statistics across all registered participants.
 */
const buildCompletionSummary = (entries = []) => {
  const counts = {
    totalParticipants: entries.length,
    completedCount: 0,
    inProgressCount: 0,
    clearedCount: 0,
    eliminatedCount: 0,
    registeredCount: 0,
  };

  for (const entry of entries) {
    if (entry.competitionStatus === 'completed') counts.completedCount += 1;
    else if (entry.competitionStatus === 'inProgress') counts.inProgressCount += 1;
    else if (entry.competitionStatus === 'cleared') counts.clearedCount += 1;
    else if (entry.competitionStatus === 'eliminated') counts.eliminatedCount += 1;
    else if (entry.competitionStatus === 'registered') counts.registeredCount += 1;
  }

  return counts;
};

/**
 * Derive global milestone highlights independently of pagination or filters.
 */
const buildMilestoneRecords = (entries = []) => {
  let highestRoundReached = null;

  if (entries.length > 0) {
    const [topRound] = [...entries].sort((a, b) => {
      if (b.highestLevelReached !== a.highestLevelReached) {
        return b.highestLevelReached - a.highestLevelReached;
      }
      if (b.levelsCleared !== a.levelsCleared) {
        return b.levelsCleared - a.levelsCleared;
      }
      const tsCmp = compareNullableDateAsc(a.achievedAt, b.achievedAt);
      if (tsCmp !== 0) {
        return tsCmp;
      }
      return compareNamesAndIdsAsc(a, b);
    });

    highestRoundReached = {
      levelNumber: topRound.highestLevelReached,
      levelsCleared: topRound.levelsCleared,
      participantName: topRound.name,
      usn: topRound.usn,
      year: topRound.year,
      competitionStatus: topRound.competitionStatus,
      isCompleted: topRound.isCompleted,
      achievedAt: topRound.achievedAt,
    };
  }

  let highestCumulativeEarnings = null;
  const earners = entries.filter((entry) => entry.totalEarned > 0);
  if (earners.length > 0) {
    const [topEarner] = [...earners].sort((a, b) => {
      if (b.totalEarned !== a.totalEarned) {
        return b.totalEarned - a.totalEarned;
      }
      const tsCmp = compareNullableDateAsc(a.earningsAchievedAt, b.earningsAchievedAt);
      if (tsCmp !== 0) {
        return tsCmp;
      }
      return compareNamesAndIdsAsc(a, b);
    });

    highestCumulativeEarnings = {
      amount: topEarner.totalEarned,
      participantName: topEarner.name,
      usn: topEarner.usn,
      year: topEarner.year,
      achievedAt: topEarner.earningsAchievedAt,
    };
  }

  return {
    highestRoundReached,
    highestCumulativeEarnings,
  };
};

/**
 * Filter leaderboard entries by validated optional query criteria.
 */
const filterLeaderboardEntries = (entries, filters = {}) => {
  return entries.filter((entry) => {
    if (filters.competitionStatus && entry.competitionStatus !== filters.competitionStatus) {
      return false;
    }
    if (filters.year && entry.year !== filters.year) {
      return false;
    }
    return true;
  });
};

/**
 * Controller: getLeaderboard
 * Endpoint: GET /api/leaderboard
 * Access: Protected (STUDENT, VOLUNTEER, ADMIN via protectRoles)
 */
const getLeaderboard = async (req, res) => {
  try {
    const paginationInput = parsePaginationQuery(req.query);
    if (paginationInput.error) {
      return res.status(paginationInput.error.status).json({
        success: false,
        code: paginationInput.error.code,
        message: paginationInput.error.message,
      });
    }

    const filterInput = parseLeaderboardFilters(req.query);
    if (filterInput.error) {
      return res.status(filterInput.error.status).json({
        success: false,
        code: filterInput.error.code,
        message: filterInput.error.message,
      });
    }

    const { page, limit, skip } = paginationInput;
    const { filters } = filterInput;

    const dataset = await fetchLeaderboardDataset();
    const allEntries = buildLeaderboardEntries(dataset);

    const summary = buildCompletionSummary(allEntries);
    const records = buildMilestoneRecords(allEntries);

    const filteredEntries = filterLeaderboardEntries(allEntries, filters);
    const rankedCohort = rankParticipants(filteredEntries);

    const isStudent = req.user?.role === 'STUDENT' && Boolean(req.student);
    const viewerStudentId = isStudent && req.student.registrationComplete ? req.student._id.toString() : null;

    let myRank = null;
    if (viewerStudentId) {
      const myEntry = rankedCohort.find((entry) => entry._internalId === viewerStudentId);
      if (myEntry) {
        myRank = {
          ...formatPublicLeaderboardEntry(myEntry, viewerStudentId),
          totalParticipants: rankedCohort.length,
        };
      }
    }

    const pagedEntries = rankedCohort
      .slice(skip, skip + limit)
      .map((entry) => formatPublicLeaderboardEntry(entry, viewerStudentId));

    return res.status(200).json({
      success: true,
      message: 'Leaderboard retrieved successfully.',
      summary,
      records,
      myRank,
      count: pagedEntries.length,
      pagination: buildPaginationMeta(page, limit, rankedCohort.length),
      leaderboard: pagedEntries,
    });
  } catch (error) {
    console.error('Error retrieving leaderboard:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve leaderboard.',
    });
  }
};

/**
 * Controller: getCompetitionRecords
 * Endpoints: GET /api/leaderboard/records, GET /api/competition/records
 * Access: Protected (STUDENT, VOLUNTEER, ADMIN via protectRoles)
 */
const getCompetitionRecords = async (req, res) => {
  try {
    const dataset = await fetchLeaderboardDataset();
    const allEntries = buildLeaderboardEntries(dataset);
    const summary = buildCompletionSummary(allEntries);
    const { highestRoundReached, highestCumulativeEarnings } = buildMilestoneRecords(allEntries);

    return res.status(200).json({
      success: true,
      message: 'Competition records retrieved successfully.',
      summary,
      highestRoundReached,
      highestCumulativeEarnings,
    });
  } catch (error) {
    console.error('Error retrieving competition records:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve competition records.',
    });
  }
};

/**
 * Controller: getMyLeaderboardRank
 * Endpoint: GET /api/leaderboard/me
 * Access: Protected (STUDENT only via protectStudent)
 */
const getMyLeaderboardRank = async (req, res) => {
  try {
    const student = req.student;
    const dataset = await fetchLeaderboardDataset();
    const allEntries = buildLeaderboardEntries(dataset);
    const rankedEntries = rankParticipants(allEntries);
    const totalParticipants = rankedEntries.length;

    if (!student.registrationComplete) {
      return res.status(200).json({
        success: true,
        message: 'Participant rank retrieved successfully.',
        totalParticipants,
        participant: null,
      });
    }

    const studentIdStr = student._id.toString();
    const myEntry = rankedEntries.find((entry) => entry._internalId === studentIdStr);

    return res.status(200).json({
      success: true,
      message: 'Participant rank retrieved successfully.',
      totalParticipants,
      participant: myEntry ? formatPublicLeaderboardEntry(myEntry, studentIdStr) : null,
    });
  } catch (error) {
    console.error('Error retrieving participant rank:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve participant rank.',
    });
  }
};

module.exports = {
  getLeaderboard,
  getCompetitionRecords,
  getMyLeaderboardRank,
  parseLeaderboardFilters,
  buildProgressedEvalMap,
  buildRewardTxTimestampMap,
  calculateProgressionAchievedAt,
  calculateEarningsAchievedAt,
  buildLeaderboardEntries,
  rankParticipants,
  buildCompletionSummary,
  buildMilestoneRecords,
};

