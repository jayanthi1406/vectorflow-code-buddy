const express = require('express');
const router = express.Router();

const {
  createQuestion,
  listQuestions,
  getQuestionById,
  updateQuestion,
  deactivateQuestion,
  reactivateQuestion,
} = require('../controllers/questionController');

const {
  protectAdmin,
  authorizeAdmin,
} = require('../middleware/authMiddleware');

// All question management routes strictly require an authenticated and authorized Admin
router.use(protectAdmin, authorizeAdmin);

/**
 * @route   POST /api/admin/questions
 * @desc    Create a new question in the bank
 * @access  Protected (Admin only)
 */
router.post('/', createQuestion);

/**
 * @route   GET /api/admin/questions
 * @desc    List questions with optional filters (levelNumber, difficulty, isActive)
 * @access  Protected (Admin only)
 */
router.get('/', listQuestions);

/**
 * @route   GET /api/admin/questions/:id
 * @desc    Get question details by ID (includes hiddenTestCases for Admin)
 * @access  Protected (Admin only)
 */
router.get('/:id', getQuestionById);

/**
 * @route   PUT /api/admin/questions/:id
 * @desc    Update question details (protects levelNumber/difficulty if assigned)
 * @access  Protected (Admin only)
 */
router.put('/:id', updateQuestion);

/**
 * @route   PATCH /api/admin/questions/:id/deactivate
 * @desc    Deactivate a question
 * @access  Protected (Admin only)
 */
router.patch('/:id/deactivate', deactivateQuestion);

/**
 * @route   PATCH /api/admin/questions/:id/reactivate
 * @desc    Reactivate a question
 * @access  Protected (Admin only)
 */
router.patch('/:id/reactivate', reactivateQuestion);

module.exports = router;
