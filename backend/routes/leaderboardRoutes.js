const express = require('express');
const router = express.Router();

const {
  getLeaderboard,
  getCompetitionRecords,
  getMyLeaderboardRank,
} = require('../controllers/leaderboardController');
const { protectStudent, protectRoles } = require('../middleware/authMiddleware');

/**
 * @route   GET /api/leaderboard
 * @desc    Retrieve paginated live competition leaderboard, summary, highlights, and caller rank
 * @access  Protected (STUDENT, VOLUNTEER, ADMIN)
 */
router.get('/', protectRoles('STUDENT', 'VOLUNTEER', 'ADMIN'), getLeaderboard);

/**
 * @route   GET /api/leaderboard/records
 * @desc    Retrieve competition-wide milestone highlights and completion statistics
 * @access  Protected (STUDENT, VOLUNTEER, ADMIN)
 */
router.get('/records', protectRoles('STUDENT', 'VOLUNTEER', 'ADMIN'), getCompetitionRecords);

/**
 * @route   GET /api/leaderboard/me
 * @desc    Retrieve authenticated student's live rank and leaderboard summary
 * @access  Protected (STUDENT only)
 */
router.get('/me', protectStudent, getMyLeaderboardRank);

module.exports = router;

