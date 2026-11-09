const express = require('express');
const router = express.Router();

const {
  verifyGoogleAuth,
  completeRegistration,
  getMe,
} = require('../controllers/authController');
const { adminLogin } = require('../controllers/adminController');
const { volunteerLogin } = require('../controllers/volunteerController');
const { protectStudent } = require('../middleware/authMiddleware');

/**
 * @route   POST /api/auth/google
 * @desc    Verify Google ID token, authenticate/provision student, issue JWT
 * @access  Public
 */
router.post('/google', verifyGoogleAuth);

/**
 * @route   POST /api/auth/register
 * @desc    Complete student USN and academic year registration
 * @access  Protected (Student only)
 */
router.post('/register', protectStudent, completeRegistration);

/**
 * @route   GET /api/auth/me
 * @desc    Get authenticated student profile and competition status
 * @access  Protected (Student only)
 */
router.get('/me', protectStudent, getMe);

/**
 * @route   POST /api/auth/admin/login
 * @desc    Admin credential login alias
 * @access  Public
 */
router.post('/admin/login', adminLogin);

/**
 * @route   POST /api/auth/volunteer/login
 * @desc    Volunteer credential login alias
 * @access  Public
 */
router.post('/volunteer/login', volunteerLogin);

module.exports = router;