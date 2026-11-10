const express = require('express');
const router = express.Router();

const { getCompetitionConfig } = require('../controllers/studentController');
const { protectStudent } = require('../middleware/authMiddleware');

/**
 * @route   GET /api/competition/config
 * @desc    Retrieve authoritative six-level competition configuration for authenticated students
 * @access  Protected (Student only)
 */
router.get('/config', protectStudent, getCompetitionConfig);

module.exports = router;

