const express = require('express');
const router = express.Router();

const {
  adminLogin,
  getAdminMe,
  createVolunteer,
  listVolunteers,
  getVolunteerById,
  updateVolunteer,
  resetVolunteerPassword,
  deactivateVolunteer,
  reactivateVolunteer,
} = require('../controllers/adminController');

const {
  getAdminDashboard,
  listParticipants,
  getParticipantDetails,
  listRounds,
  getParticipantRounds,
  listTransactions,
  getParticipantTransactions,
} = require('../controllers/adminMonitoringController');

const {
  listLevels,
  updateLevel,
  activateLevel,
  deactivateLevel,
} = require('../controllers/adminLevelController');

const { recoverAbandonedRound } = require('../controllers/adminRoundController');

const {
  protectAdmin,
  authorizeAdmin,
} = require('../middleware/authMiddleware');
const { getRateLimiters } = require('../middleware/securityMiddleware');

const { adminLoginLimiters } = getRateLimiters();

/**
 * @route   POST /api/admin/login
 * @desc    Admin credential login (username + password)
 * @access  Public
 */
router.post('/login', ...adminLoginLimiters, adminLogin);

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
 * @desc    List volunteer accounts with optional isActive, search, and pagination filters
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
 * @route   PUT /api/admin/volunteers/:id
 * @desc    Update permitted volunteer name and/or assignedLab
 * @access  Protected (Admin only)
 */
router.put('/volunteers/:id', protectAdmin, authorizeAdmin, updateVolunteer);

/**
 * @route   PATCH /api/admin/volunteers/:id
 * @desc    Update permitted volunteer name and/or assignedLab
 * @access  Protected (Admin only)
 */
router.patch('/volunteers/:id', protectAdmin, authorizeAdmin, updateVolunteer);

/**
 * @route   PATCH /api/admin/volunteers/:id/reset-password
 * @desc    Reset a volunteer account password securely
 * @access  Protected (Admin only)
 */
router.patch('/volunteers/:id/reset-password', protectAdmin, authorizeAdmin, resetVolunteerPassword);

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

/**
 * @route   GET /api/admin/dashboard
 * @desc    Retrieve live competition-wide aggregate statistics for Admin Dashboard
 * @access  Protected (Admin only)
 */
router.get('/dashboard', protectAdmin, authorizeAdmin, getAdminDashboard);

/**
 * @route   GET /api/admin/participants
 * @desc    List registered and participating students with search, filters, and pagination
 * @access  Protected (Admin only)
 */
router.get('/participants', protectAdmin, authorizeAdmin, listParticipants);

/**
 * @route   GET /api/admin/participants/:identifier/rounds
 * @desc    View chronological round history for a specific participant
 * @access  Protected (Admin only)
 */
router.get('/participants/:identifier/rounds', protectAdmin, authorizeAdmin, getParticipantRounds);

/**
 * @route   GET /api/admin/participants/:identifier/transactions
 * @desc    View chronological transaction history for a specific participant
 * @access  Protected (Admin only)
 */
router.get(
  '/participants/:identifier/transactions',
  protectAdmin,
  authorizeAdmin,
  getParticipantTransactions
);

/**
 * @route   GET /api/admin/participants/:identifier
 * @desc    View single participant profile, progress, wallet, and activity summary
 * @access  Protected (Admin only)
 */
router.get('/participants/:identifier', protectAdmin, authorizeAdmin, getParticipantDetails);

/**
 * @route   GET /api/admin/rounds
 * @desc    List competition-wide rounds and sanitized evaluation summaries
 * @access  Protected (Admin only)
 */
router.get('/rounds', protectAdmin, authorizeAdmin, listRounds);

/**
 * @route   POST /api/admin/rounds/:roundId/recover
 * @desc    Safely recover an eligible abandoned round in place back to ready state
 * @access  Protected (Admin only)
 */
router.post('/rounds/:roundId/recover', protectAdmin, authorizeAdmin, recoverAbandonedRound);

/**
 * @route   GET /api/admin/transactions
 * @desc    List competition-wide transaction ledger
 * @access  Protected (Admin only)
 */
router.get('/transactions', protectAdmin, authorizeAdmin, listTransactions);

/**
 * @route   GET /api/admin/levels
 * @desc    List all six competition levels ordered L1-L6 with usage and open-round flags
 * @access  Protected (Admin only)
 */
router.get('/levels', protectAdmin, authorizeAdmin, listLevels);

/**
 * @route   PATCH /api/admin/levels/:number/activate
 * @desc    Activate a competition level configuration
 * @access  Protected (Admin only)
 */
router.patch('/levels/:number/activate', protectAdmin, authorizeAdmin, activateLevel);

/**
 * @route   PATCH /api/admin/levels/:number/deactivate
 * @desc    Deactivate a competition level configuration when safe
 * @access  Protected (Admin only)
 */
router.patch('/levels/:number/deactivate', protectAdmin, authorizeAdmin, deactivateLevel);

/**
 * @route   PUT /api/admin/levels/:number
 * @desc    Update level configuration (locking financial/structural fields once used)
 * @access  Protected (Admin only)
 */
router.put('/levels/:number', protectAdmin, authorizeAdmin, updateLevel);

module.exports = router;