const express = require('express');
const router = express.Router();

const { getCompetitionConfig } = require('../controllers/studentController');
const { getCompetitionRecords } = require('../controllers/leaderboardController');
const { protectStudent, protectRoles } = require('../middleware/authMiddleware');

/**
 * @route   GET /api/competition/config
 * @desc    Retrieve authoritative six-level competition configuration for authenticated students
 * @access  Protected (Student only)
 */
router.get('/config', protectStudent, getCompetitionConfig);

/**
 * @route   GET /api/competition/records
 * @desc    Retrieve competition-wide milestone highlights and completion statistics (compatibility alias)
 * @access  Protected (STUDENT, VOLUNTEER, ADMIN)
 */
router.get('/records', protectRoles('STUDENT', 'VOLUNTEER', 'ADMIN'), getCompetitionRecords);

module.exports = router;

