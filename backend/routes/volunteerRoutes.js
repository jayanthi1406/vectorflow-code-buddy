const express = require('express');
const router = express.Router();

const {
  volunteerLogin,
  getVolunteerMe,
  getStudentActiveRoundByUsn,
  startStudentRoundByUsn,
  extendStudentRoundByUsn,
  evaluateStudentRoundByUsn,
  settleStudentRoundByUsn,
  progressStudentRoundByUsn,
} = require('../controllers/volunteerController');

const {
  protectVolunteer,
  authorizeVolunteer,
} = require('../middleware/authMiddleware');

/**
 * @route   POST /api/volunteer/login
 * @desc    Volunteer credential login (username + password)
 * @access  Public
 */
router.post('/login', volunteerLogin);

/**
 * @route   GET /api/volunteer/me
 * @desc    Get authenticated Volunteer profile
 * @access  Protected (Volunteer only)
 */
router.get('/me', protectVolunteer, authorizeVolunteer, getVolunteerMe);

/**
 * @route   GET /api/volunteer/students/:usn/round
 * @desc    Lookup a registered student by USN and retrieve their allocated active round
 * @access  Protected (Volunteer only)
 */
router.get('/students/:usn/round', protectVolunteer, authorizeVolunteer, getStudentActiveRoundByUsn);

/**
 * @route   POST /api/volunteer/students/:usn/round/start
 * @desc    Start a student's allocated ready round and activate its timer
 * @access  Protected (Volunteer only)
 */
router.post('/students/:usn/round/start', protectVolunteer, authorizeVolunteer, startStudentRoundByUsn);

/**
 * @route   POST /api/volunteer/students/:usn/round/extend
 * @desc    Extend the deadline of an inProgress round and log the extension
 * @access  Protected (Volunteer only)
 */
router.post('/students/:usn/round/extend', protectVolunteer, authorizeVolunteer, extendStudentRoundByUsn);

/**
 * @route   POST /api/volunteer/students/:usn/round/evaluate
 * @desc    Manually record PASS/FAIL evaluation decision for a student's active or expired round
 * @access  Protected (Volunteer only)
 */
router.post('/students/:usn/round/evaluate', protectVolunteer, authorizeVolunteer, evaluateStudentRoundByUsn);

/**
 * @route   POST /api/volunteer/students/:usn/round/settle
 * @desc    Atomically settle wallet balance and record immutable ledger transaction from evaluation
 * @access  Protected (Volunteer only)
 */
router.post('/students/:usn/round/settle', protectVolunteer, authorizeVolunteer, settleStudentRoundByUsn);

/**
 * @route   POST /api/volunteer/students/:usn/round/progress
 * @desc    Atomically settle if needed and apply student level progression, safe-zone, and statistics
 * @access  Protected (Volunteer only)
 */
router.post('/students/:usn/round/progress', protectVolunteer, authorizeVolunteer, progressStudentRoundByUsn);

module.exports = router;
