const mongoose = require('mongoose');
const { Staff, Admin, Volunteer } = require('../models');
const { signAdminToken } = require('../middleware/authMiddleware');

/**
 * Format Admin document for API responses, ensuring passwordHash is excluded.
 */
const formatAdminResponse = (admin) => ({
  id: admin._id.toString(),
  name: admin.name,
  username: admin.username,
  role: 'ADMIN',
  isActive: admin.isActive,
  createdAt: admin.createdAt,
  updatedAt: admin.updatedAt,
});

/**
 * Format Volunteer document for API responses, ensuring passwordHash is excluded.
 */
const formatVolunteerResponse = (volunteer) => ({
  id: volunteer._id.toString(),
  name: volunteer.name,
  username: volunteer.username,
  role: 'VOLUNTEER',
  isActive: volunteer.isActive,
  assignedLab: volunteer.assignedLab || '',
  createdAt: volunteer.createdAt,
  updatedAt: volunteer.updatedAt,
});

/**
 * Admin Login Controller
 * Endpoint: POST /api/admin/login (also mounted at /api/auth/admin/login)
 * Access: Public
 */
const adminLogin = async (req, res) => {
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

    // 2. Query admin user in database using Admin discriminator model
    const admin = await Admin.findOne({
      username: normalizedUsername,
    });

    // 3. Generic authentication failure to prevent username enumeration
    if (!admin) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password.',
      });
    }

    // 4. Check active account status
    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Admin account has been deactivated.',
      });
    }

    // 5. Verify password hash using bcrypt
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password.',
      });
    }

    // 6. Generate signed HS256 JWT
    const token = signAdminToken(admin._id);

    return res.status(200).json({
      success: true,
      message: 'Admin authenticated successfully.',
      token,
      admin: formatAdminResponse(admin),
    });
  } catch (error) {
    console.error('Admin login error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An internal error occurred during admin login.',
    });
  }
};

/**
 * Get current authenticated Admin profile
 * Endpoint: GET /api/admin/me
 * Access: Protected (Admin only)
 */
const getAdminMe = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      admin: formatAdminResponse(req.admin),
    });
  } catch (error) {
    console.error('getAdminMe error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Failed to retrieve admin profile.',
    });
  }
};

/**
 * Create Volunteer Account
 * Endpoint: POST /api/admin/volunteers
 * Access: Protected (Admin only)
 */
const createVolunteer = async (req, res) => {
  try {
    const body = req.body || {};

    // 1. Strict payload validation: reject unsupported fields (e.g. client supplying role)
    const allowedFields = ['name', 'username', 'password', 'assignedLab'];
    const extraFields = Object.keys(body).filter((key) => !allowedFields.includes(key));
    if (extraFields.length > 0) {
      return res.status(400).json({
        success: false,
        code: 'UNSUPPORTED_FIELDS',
        message: `Request contains unsupported fields: ${extraFields.join(', ')}.`,
      });
    }

    const { name, username, password, assignedLab } = body;

    // 2. Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_NAME',
        message: 'Volunteer name must be at least 2 characters long.',
      });
    }

    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_USERNAME',
        message: 'Username must be at least 3 characters long.',
      });
    }

    const normalizedUsername = username.trim().toLowerCase();
    const usernameRegex = /^[a-z0-9_.-]+$/i;
    if (!usernameRegex.test(normalizedUsername)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_USERNAME_FORMAT',
        message: 'Username can only contain alphanumeric characters, underscores, dots, and hyphens.',
      });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        success: false,
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 8 characters long.',
      });
    }

    // 3. Check for duplicate username across all Staff
    const existingStaff = await Staff.findOne({ username: normalizedUsername });
    if (existingStaff) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_USERNAME',
        message: 'A staff account with this username already exists.',
      });
    }

    // 4. Securely hash password
    const passwordHash = await Staff.hashPassword(password);

    // 5. Create new Volunteer document
    const volunteer = new Volunteer({
      name: name.trim(),
      username: normalizedUsername,
      passwordHash,
      role: 'VOLUNTEER',
      isActive: true,
      assignedLab: assignedLab && typeof assignedLab === 'string' ? assignedLab.trim() : '',
    });

    await volunteer.save();

    return res.status(201).json({
      success: true,
      message: 'Volunteer account created successfully.',
      volunteer: formatVolunteerResponse(volunteer),
    });
  } catch (error) {
    console.error('Create volunteer error:', error.message);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_USERNAME',
        message: 'A staff account with this username already exists.',
      });
    }
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create volunteer account.',
    });
  }
};

/**
 * List Volunteer Accounts
 * Endpoint: GET /api/admin/volunteers
 * Access: Protected (Admin only)
 */
const listVolunteers = async (req, res) => {
  try {
    const volunteers = await Volunteer.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: volunteers.length,
      volunteers: volunteers.map(formatVolunteerResponse),
    });
  } catch (error) {
    console.error('List volunteers error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve volunteers list.',
    });
  }
};

/**
 * View Volunteer Details
 * Endpoint: GET /api/admin/volunteers/:id
 * Access: Protected (Admin only)
 */
const getVolunteerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ID',
        message: 'Invalid volunteer ID format.',
      });
    }

    const volunteer = await Volunteer.findById(id);

    if (!volunteer) {
      return res.status(404).json({
        success: false,
        code: 'VOLUNTEER_NOT_FOUND',
        message: 'Volunteer account not found.',
      });
    }

    return res.status(200).json({
      success: true,
      volunteer: formatVolunteerResponse(volunteer),
    });
  } catch (error) {
    console.error('Get volunteer by ID error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve volunteer details.',
    });
  }
};

/**
 * Deactivate Volunteer Account
 * Endpoint: PATCH /api/admin/volunteers/:id/deactivate
 * Access: Protected (Admin only)
 */
const deactivateVolunteer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ID',
        message: 'Invalid volunteer ID format.',
      });
    }

    const volunteer = await Volunteer.findById(id);

    if (!volunteer) {
      return res.status(404).json({
        success: false,
        code: 'VOLUNTEER_NOT_FOUND',
        message: 'Volunteer account not found.',
      });
    }

    volunteer.isActive = false;
    await volunteer.save();

    return res.status(200).json({
      success: true,
      message: 'Volunteer account deactivated successfully.',
      volunteer: formatVolunteerResponse(volunteer),
    });
  } catch (error) {
    console.error('Deactivate volunteer error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to deactivate volunteer account.',
    });
  }
};

/**
 * Reactivate Volunteer Account
 * Endpoint: PATCH /api/admin/volunteers/:id/reactivate
 * Access: Protected (Admin only)
 */
const reactivateVolunteer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ID',
        message: 'Invalid volunteer ID format.',
      });
    }

    const volunteer = await Volunteer.findById(id);

    if (!volunteer) {
      return res.status(404).json({
        success: false,
        code: 'VOLUNTEER_NOT_FOUND',
        message: 'Volunteer account not found.',
      });
    }

    volunteer.isActive = true;
    await volunteer.save();

    return res.status(200).json({
      success: true,
      message: 'Volunteer account reactivated successfully.',
      volunteer: formatVolunteerResponse(volunteer),
    });
  } catch (error) {
    console.error('Reactivate volunteer error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to reactivate volunteer account.',
    });
  }
};

module.exports = {
  adminLogin,
  getAdminMe,
  createVolunteer,
  listVolunteers,
  getVolunteerById,
  deactivateVolunteer,
  reactivateVolunteer,
  formatAdminResponse,
  formatVolunteerResponse,
};