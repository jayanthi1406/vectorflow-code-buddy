const express = require('express');
const router = express.Router();

const {
  adminLogin,
  getAdminMe,
  createVolunteer,
  listVolunteers,
  getVolunteerById,
  deactivateVolunteer,
  reactivateVolunteer,
} = require('../controllers/adminController');

const {
  protectAdmin,
  authorizeAdmin,
} = require('../middleware/authMiddleware');

/**
 * @route   POST /api/admin/login
 * @desc    Admin credential login (username + password)
 * @access  Public
 */
router.post('/login', adminLogin);

/**
 * @route   GET /api/admin/me
 * @desc    Get authenticated Admin profile
 * @access  Protected (Admin only)
 */
router.get('/me', protectAdmin, authorizeAdmin, getAdminMe);

/**
 * @route   POST /api/admin/volunteers
 * @desc    Create a new volunteer account
 * @access  Protected (Admin only)
 */
router.post('/volunteers', protectAdmin, authorizeAdmin, createVolunteer);

/**
 * @route   GET /api/admin/volunteers
 * @desc    List all volunteer accounts
 * @access  Protected (Admin only)
 */
router.get('/volunteers', protectAdmin, authorizeAdmin, listVolunteers);

/**
 * @route   GET /api/admin/volunteers/:id
 * @desc    Get volunteer account details by ID
 * @access  Protected (Admin only)
 */
router.get('/volunteers/:id', protectAdmin, authorizeAdmin, getVolunteerById);

/**
 * @route   PATCH /api/admin/volunteers/:id/deactivate
 * @desc    Deactivate a volunteer account
 * @access  Protected (Admin only)
 */
router.patch('/volunteers/:id/deactivate', protectAdmin, authorizeAdmin, deactivateVolunteer);

/**
 * @route   PATCH /api/admin/volunteers/:id/reactivate
 * @desc    Reactivate a volunteer account
 * @access  Protected (Admin only)
 */
router.patch('/volunteers/:id/reactivate', protectAdmin, authorizeAdmin, reactivateVolunteer);

module.exports = router;