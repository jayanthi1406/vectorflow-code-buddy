const { Volunteer } = require('../models');
const { signVolunteerToken } = require('../middleware/authMiddleware');
const { formatVolunteerResponse } = require('./adminController');

/**
 * Volunteer Login Controller
 * Endpoint: POST /api/volunteer/login (also mounted at /api/auth/volunteer/login)
 * Access: Public
 */
const volunteerLogin = async (req, res) => {
  try {
    const { username, password } = req.body || {};

    // 1. Missing credentials validation
    if (!username || typeof username !== 'string' || username.trim() === '' ||
      !password || typeof password !== 'string' || password === '') {
      return res.status(400).json({
        success: false,
        code: 'MISSING_CREDENTIALS',
        message: 'Username and password are required.',
      });
    }

    const normalizedUsername = username.trim().toLowerCase();

    // 2. Query volunteer user in database using Volunteer discriminator model
    const volunteer = await Volunteer.findOne({
      username: normalizedUsername,
    });

    // 3. Generic authentication failure to prevent username enumeration
    if (!volunteer) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password.',
      });
    }

    // 4. Check active account status: deactivated volunteers cannot log in
    if (!volunteer.isActive) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Volunteer account has been deactivated. Please contact an administrator.',
      });
    }

    // 5. Verify password hash using bcrypt
    const isMatch = await volunteer.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password.',
      });
    }

    // 6. Generate signed HS256 JWT
    const token = signVolunteerToken(volunteer._id);

    return res.status(200).json({
      success: true,
      message: 'Volunteer authenticated successfully.',
      token,
      volunteer: formatVolunteerResponse(volunteer),
    });
  } catch (error) {
    console.error('Volunteer login error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An internal error occurred during volunteer login.',
    });
  }
};

/**
 * Get current authenticated Volunteer profile
 * Endpoint: GET /api/volunteer/me
 * Access: Protected (Volunteer only)
 */
const getVolunteerMe = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      volunteer: formatVolunteerResponse(req.volunteer),
    });
  } catch (error) {
    console.error('getVolunteerMe error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Failed to retrieve volunteer profile.',
    });
  }
};

module.exports = {
  volunteerLogin,
  getVolunteerMe,
};