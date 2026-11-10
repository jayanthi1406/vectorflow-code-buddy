const express = require('express');
const router = express.Router();

const {
  getLevelInfo,
  allocateQuestion,
  getActiveRoundStatus,
} = require('../controllers/roundController');
const { protectStudent } = require('../middleware/authMiddleware');

/**
 * @route   GET /api/rounds/level-info
 * @desc    Get financial, timer, and safe-zone configuration for the authenticated student's current level
 * @access  Protected (Student only)
 */
router.get('/level-info', protectStudent, getLevelInfo);

/**
 * @route   GET /api/rounds/active
 * @desc    Get status, timer details, and assigned question for the authenticated student's current round
 * @access  Protected (Student only)
 */
router.get('/active', protectStudent, getActiveRoundStatus);

/**
 * @route   POST /api/rounds/allocate
 * @desc    Allocate or retrieve the assigned question for the authenticated student's current level
 * @access  Protected (Student only)
 */
router.post('/allocate', protectStudent, allocateQuestion);

module.exports = router;
