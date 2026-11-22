const mongoose = require('mongoose');
const { Question, Round } = require('../models');

/**
 * Helper to validate level number strictly between 1 and 6
 */
const isValidLevelNumber = (num) => {
  return Number.isInteger(num) && num >= 1 && num <= 6;
};

/**
 * Helper to validate difficulty strictly EASY or HARD
 */
const isValidDifficulty = (diff) => {
  return typeof diff === 'string' && ['EASY', 'HARD'].includes(diff.trim().toUpperCase());
};

/**
 * Helper to format question response for admin inspection
 */
const formatQuestionAdminResponse = (q) => ({
  id: q._id.toString(),
  title: q.title,
  statement: q.statement,
  constraints: q.constraints || [],
  examples: q.examples || [],
  difficulty: q.difficulty,
  levelNumber: q.levelNumber,
  hiddenTestCases: q.hiddenTestCases || [],
  isActive: q.isActive,
  createdBy: q.createdBy ? q.createdBy.toString() : null,
  createdAt: q.createdAt,
  updatedAt: q.updatedAt,
});

/**
 * Create Question
 * Endpoint: POST /api/admin/questions
 * Access: Protected (Admin only)
 */
const createQuestion = async (req, res) => {
  try {
    const {
      title,
      statement,
      constraints = [],
      examples = [],
      difficulty,
      levelNumber,
      hiddenTestCases = [],
    } = req.body || {};

    // 1. Validate required text fields
    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_TITLE',
        message: 'Question title is required and must be at least 3 characters long.',
      });
    }

    if (!statement || typeof statement !== 'string' || statement.trim().length < 10) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_STATEMENT',
        message: 'Problem statement is required and must be at least 10 characters long.',
      });
    }

    // 2. Validate levelNumber (1 to 6)
    const parsedLevel = Number(levelNumber);
    if (!isValidLevelNumber(parsedLevel)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_LEVEL_NUMBER',
        message: 'Level number must be an integer between 1 and 6.',
      });
    }

    // 3. Validate difficulty (EASY or HARD)
    if (!isValidDifficulty(difficulty)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_DIFFICULTY',
        message: "Difficulty must be either 'EASY' or 'HARD'.",
      });
    }

    // 4. Validate constraints array
    if (!Array.isArray(constraints) || constraints.some((c) => typeof c !== 'string')) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_CONSTRAINTS',
        message: 'Constraints must be an array of strings.',
      });
    }

    // 5. Validate examples array
    if (!Array.isArray(examples)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EXAMPLES',
        message: 'Examples must be an array of sample test cases.',
      });
    }
    for (let i = 0; i < examples.length; i++) {
      const ex = examples[i];
      if (!ex || typeof ex.input !== 'string' || typeof ex.output !== 'string') {
        return res.status(400).json({
          success: false,
          code: 'INVALID_EXAMPLE_FORMAT',
          message: `Example at index ${i} must contain string 'input' and 'output'.`,
        });
      }
    }

    // 6. Validate hiddenTestCases array
    if (!Array.isArray(hiddenTestCases)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_HIDDEN_TEST_CASES',
        message: 'Hidden test cases must be an array of test cases.',
      });
    }
    for (let i = 0; i < hiddenTestCases.length; i++) {
      const tc = hiddenTestCases[i];
      if (!tc || typeof tc.input !== 'string' || typeof tc.expectedOutput !== 'string') {
        return res.status(400).json({
          success: false,
          code: 'INVALID_TEST_CASE_FORMAT',
          message: `Hidden test case at index ${i} must contain string 'input' and 'expectedOutput'.`,
        });
      }
    }

    // 7. Create Question document
    const question = new Question({
      title: title.trim(),
      statement: statement.trim(),
      constraints: constraints.map((c) => c.trim()),
      examples: examples.map((ex) => ({
        id: ex.id ? String(ex.id).trim() : '',
        title: ex.title ? String(ex.title).trim() : '',
        input: ex.input,
        output: ex.output,
        explanation: ex.explanation ? String(ex.explanation).trim() : '',
      })),
      difficulty: difficulty.trim().toUpperCase(),
      levelNumber: parsedLevel,
      hiddenTestCases: hiddenTestCases.map((tc) => ({
        input: tc.input,
        expectedOutput: tc.expectedOutput,
      })),
      isActive: true,
      createdBy: req.user?.id || null,
    });

    await question.save();

    return res.status(201).json({
      success: true,
      message: 'Question created successfully.',
      question: formatQuestionAdminResponse(question),
    });
  } catch (error) {
    console.error('createQuestion error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create question.',
    });
  }
};

/**
 * List Questions
 * Endpoint: GET /api/admin/questions
 * Access: Protected (Admin only)
 */
const listQuestions = async (req, res) => {
  try {
    const filter = {};

    // Optional level filter
    if (req.query.levelNumber !== undefined) {
      const level = Number(req.query.levelNumber);
      if (!isValidLevelNumber(level)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_FILTER_LEVEL',
          message: 'levelNumber query filter must be an integer between 1 and 6.',
        });
      }
      filter.levelNumber = level;
    }

    // Optional difficulty filter
    if (req.query.difficulty !== undefined) {
      if (!isValidDifficulty(req.query.difficulty)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_FILTER_DIFFICULTY',
          message: "difficulty query filter must be either 'EASY' or 'HARD'.",
        });
      }
      filter.difficulty = req.query.difficulty.trim().toUpperCase();
    }

    // Optional active status filter (strictly 'true' or 'false')
    if (req.query.isActive !== undefined) {
      const activeStr = String(req.query.isActive).trim().toLowerCase();
      if (activeStr !== 'true' && activeStr !== 'false') {
        return res.status(400).json({
          success: false,
          code: 'INVALID_ACTIVE_FILTER',
          message: "isActive query filter must be either 'true' or 'false'.",
        });
      }
      filter.isActive = activeStr === 'true';
    }

    const questions = await Question.find(filter).sort({
      levelNumber: 1,
      difficulty: 1,
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      count: questions.length,
      questions: questions.map(formatQuestionAdminResponse),
    });
  } catch (error) {
    console.error('listQuestions error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve questions list.',
    });
  }
};

/**
 * Get Question Details by ID
 * Endpoint: GET /api/admin/questions/:id
 * Access: Protected (Admin only)
 */
const getQuestionById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ID',
        message: 'Invalid question ID format.',
      });
    }

    const question = await Question.findById(id);
    if (!question) {
      return res.status(404).json({
        success: false,
        code: 'QUESTION_NOT_FOUND',
        message: 'Question not found.',
      });
    }

    // Check if question has been assigned in any competition rounds
    const isAssigned = await Round.exists({ questionId: id });

    return res.status(200).json({
      success: true,
      question: formatQuestionAdminResponse(question),
      isAssigned: Boolean(isAssigned),
    });
  } catch (error) {
    console.error('getQuestionById error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve question details.',
    });
  }
};

/**
 * Update Question
 * Endpoint: PUT /api/admin/questions/:id
 * Access: Protected (Admin only)
 *
 * Rules:
 * 1. Historical round protection: if the question has already been assigned
 *    in any round, levelNumber and difficulty cannot be changed.
 * 2. Question snapshots in existing rounds remain immutable.
 */
const updateQuestion = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ID',
        message: 'Invalid question ID format.',
      });
    }

    const question = await Question.findById(id);
    if (!question) {
      return res.status(404).json({
        success: false,
        code: 'QUESTION_NOT_FOUND',
        message: 'Question not found.',
      });
    }

    const body = req.body || {};

    // Check if this question is referenced in historical/active rounds
    const isAssigned = await Round.exists({ questionId: id });

    // Validate levelNumber change
    if (body.levelNumber !== undefined) {
      const newLevel = Number(body.levelNumber);
      if (!isValidLevelNumber(newLevel)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_LEVEL_NUMBER',
          message: 'Level number must be an integer between 1 and 6.',
        });
      }
      if (isAssigned && newLevel !== question.levelNumber) {
        return res.status(400).json({
          success: false,
          code: 'QUESTION_ALREADY_ASSIGNED',
          message: 'Cannot modify levelNumber because this question is already assigned in competition rounds.',
        });
      }
      question.levelNumber = newLevel;
    }

    // Validate difficulty change
    if (body.difficulty !== undefined) {
      if (!isValidDifficulty(body.difficulty)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_DIFFICULTY',
          message: "Difficulty must be either 'EASY' or 'HARD'.",
        });
      }
      const newDiff = body.difficulty.trim().toUpperCase();
      if (isAssigned && newDiff !== question.difficulty) {
        return res.status(400).json({
          success: false,
          code: 'QUESTION_ALREADY_ASSIGNED',
          message: 'Cannot modify difficulty because this question is already assigned in competition rounds.',
        });
      }
      question.difficulty = newDiff;
    }

    // Validate title update
    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim().length < 3) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_TITLE',
          message: 'Question title must be at least 3 characters long.',
        });
      }
      question.title = body.title.trim();
    }

    // Validate statement update
    if (body.statement !== undefined) {
      if (typeof body.statement !== 'string' || body.statement.trim().length < 10) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_STATEMENT',
          message: 'Problem statement must be at least 10 characters long.',
        });
      }
      question.statement = body.statement.trim();
    }

    // Validate constraints update
    if (body.constraints !== undefined) {
      if (!Array.isArray(body.constraints) || body.constraints.some((c) => typeof c !== 'string')) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_CONSTRAINTS',
          message: 'Constraints must be an array of strings.',
        });
      }
      question.constraints = body.constraints.map((c) => c.trim());
    }

    // Validate examples update
    if (body.examples !== undefined) {
      if (!Array.isArray(body.examples)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_EXAMPLES',
          message: 'Examples must be an array of sample test cases.',
        });
      }
      for (let i = 0; i < body.examples.length; i++) {
        const ex = body.examples[i];
        if (!ex || typeof ex.input !== 'string' || typeof ex.output !== 'string') {
          return res.status(400).json({
            success: false,
            code: 'INVALID_EXAMPLE_FORMAT',
            message: `Example at index ${i} must contain string 'input' and 'output'.`,
          });
        }
      }
      question.examples = body.examples.map((ex) => ({
        id: ex.id ? String(ex.id).trim() : '',
        title: ex.title ? String(ex.title).trim() : '',
        input: ex.input,
        output: ex.output,
        explanation: ex.explanation ? String(ex.explanation).trim() : '',
      }));
    }

    // Validate hiddenTestCases update
    if (body.hiddenTestCases !== undefined) {
      if (!Array.isArray(body.hiddenTestCases)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_HIDDEN_TEST_CASES',
          message: 'Hidden test cases must be an array.',
        });
      }
      for (let i = 0; i < body.hiddenTestCases.length; i++) {
        const tc = body.hiddenTestCases[i];
        if (!tc || typeof tc.input !== 'string' || typeof tc.expectedOutput !== 'string') {
          return res.status(400).json({
            success: false,
            code: 'INVALID_TEST_CASE_FORMAT',
            message: `Hidden test case at index ${i} must contain string 'input' and 'expectedOutput'.`,
          });
        }
      }
      question.hiddenTestCases = body.hiddenTestCases.map((tc) => ({
        input: tc.input,
        expectedOutput: tc.expectedOutput,
      }));
    }

    // Update active status if explicitly supplied
    if (body.isActive !== undefined && typeof body.isActive === 'boolean') {
      question.isActive = body.isActive;
    }

    await question.save();

    return res.status(200).json({
      success: true,
      message: 'Question updated successfully.',
      question: formatQuestionAdminResponse(question),
      isAssigned: Boolean(isAssigned),
    });
  } catch (error) {
    console.error('updateQuestion error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to update question.',
    });
  }
};

/**
 * Deactivate Question
 * Endpoint: PATCH /api/admin/questions/:id/deactivate
 * Access: Protected (Admin only)
 */
const deactivateQuestion = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ID',
        message: 'Invalid question ID format.',
      });
    }

    const question = await Question.findById(id);
    if (!question) {
      return res.status(404).json({
        success: false,
        code: 'QUESTION_NOT_FOUND',
        message: 'Question not found.',
      });
    }

    question.isActive = false;
    await question.save();

    return res.status(200).json({
      success: true,
      message: 'Question deactivated successfully.',
      question: formatQuestionAdminResponse(question),
    });
  } catch (error) {
    console.error('deactivateQuestion error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to deactivate question.',
    });
  }
};

/**
 * Reactivate Question
 * Endpoint: PATCH /api/admin/questions/:id/reactivate
 * Access: Protected (Admin only)
 */
const reactivateQuestion = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ID',
        message: 'Invalid question ID format.',
      });
    }

    const question = await Question.findById(id);
    if (!question) {
      return res.status(404).json({
        success: false,
        code: 'QUESTION_NOT_FOUND',
        message: 'Question not found.',
      });
    }

    question.isActive = true;
    await question.save();

    return res.status(200).json({
      success: true,
      message: 'Question reactivated successfully.',
      question: formatQuestionAdminResponse(question),
    });
  } catch (error) {
    console.error('reactivateQuestion error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to reactivate question.',
    });
  }
};

module.exports = {
  createQuestion,
  listQuestions,
  getQuestionById,
  updateQuestion,
  deactivateQuestion,
  reactivateQuestion,
  formatQuestionAdminResponse,
};
