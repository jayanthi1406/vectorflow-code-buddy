const express = require('express');
const router = express.Router();

const {
  volunteerLogin,
  getVolunteerMe,
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

module.exports = router;