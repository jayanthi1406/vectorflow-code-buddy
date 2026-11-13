const mongoose = require('mongoose');
const { Staff, Admin, Volunteer } = require('../models');
const { signAdminToken } = require('../middleware/authMiddleware');
const { parsePaginationQuery, buildPaginationMeta } = require('./studentController');

/**
 * Escape regex metacharacters to safely match search terms without ReDoS risk.
 */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    const query = req.query || {};
    const filter = {};
    let searchRegex = null;

    if (query.isActive !== undefined) {
      if (typeof query.isActive !== 'string') {
        return res.status(400).json({
          success: false,
          code: 'INVALID_ACTIVE_FILTER',
          message: "isActive query filter must be either 'true' or 'false'.",
        });
      }
      const activeStr = query.isActive.trim().toLowerCase();
      if (activeStr !== 'true' && activeStr !== 'false') {
        return res.status(400).json({
          success: false,
          code: 'INVALID_ACTIVE_FILTER',
          message: "isActive query filter must be either 'true' or 'false'.",
        });
      }
      filter.isActive = activeStr === 'true';
    }

    if (query.search !== undefined) {
      if (typeof query.search !== 'string') {
        return res.status(400).json({
          success: false,
          code: 'INVALID_SEARCH_QUERY',
          message: 'Search query must be a string.',
        });
      }
      const trimmedSearch = query.search.trim();
      if (trimmedSearch.length > 100) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_SEARCH_QUERY',
          message: 'Search query must not exceed 100 characters.',
        });
      }
      if (trimmedSearch !== '') {
        searchRegex = new RegExp(escapeRegex(trimmedSearch), 'i');
        filter.$or = [
          { name: searchRegex },
          { username: searchRegex },
          { assignedLab: searchRegex },
        ];
      }
    }

    const hasPagination = query.page !== undefined || query.limit !== undefined;
    let paginationInput = null;
    if (hasPagination) {
      paginationInput = parsePaginationQuery(query);
      if (paginationInput.error) {
        return res.status(paginationInput.error.status).json({
          success: false,
          code: paginationInput.error.code,
          message: paginationInput.error.message,
        });
      }
    }

    const rawVolunteers = await Volunteer.find(filter).sort({ createdAt: -1 });
    const filteredVolunteers = (Array.isArray(rawVolunteers) ? rawVolunteers : []).filter((vol) => {
      if (vol.role && vol.role.toUpperCase() !== 'VOLUNTEER') return false;
      if (filter.isActive !== undefined && Boolean(vol.isActive) !== filter.isActive) return false;
      if (searchRegex) {
        const matches =
          searchRegex.test(vol.name || '') ||
          searchRegex.test(vol.username || '') ||
          searchRegex.test(vol.assignedLab || '');
        if (!matches) return false;
      }
      return true;
    });

    if (hasPagination) {
      const { page, limit, skip } = paginationInput;
      const pagedVolunteers = filteredVolunteers.slice(skip, skip + limit);
      return res.status(200).json({
        success: true,
        count: pagedVolunteers.length,
        pagination: buildPaginationMeta(page, limit, filteredVolunteers.length),
        volunteers: pagedVolunteers.map(formatVolunteerResponse),
      });
    }

    return res.status(200).json({
      success: true,
      count: filteredVolunteers.length,
      volunteers: filteredVolunteers.map(formatVolunteerResponse),
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

/**
 * Shared validation and target lookup for Admin volunteer mutation handlers.
 * Ensures valid ObjectId, JSON object body, allowed fields only, and VOLUNTEER discriminator match.
 */
const resolveVolunteerMutationTarget = async (req, allowedFields) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return {
      error: {
        status: 400,
        code: 'INVALID_ID',
        message: 'Invalid volunteer ID format.',
      },
    };
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      error: {
        status: 400,
        code: 'INVALID_PAYLOAD',
        message: 'Request body must be a JSON object.',
      },
    };
  }

  const bodyKeys = Object.keys(body);
  const extraFields = bodyKeys.filter((key) => !allowedFields.includes(key));
  if (extraFields.length > 0) {
    return {
      error: {
        status: 400,
        code: 'UNSUPPORTED_FIELDS',
        message: `Request contains unsupported fields: ${extraFields.join(', ')}.`,
      },
    };
  }

  const volunteer = await Volunteer.findById(id);
  if (!volunteer || volunteer.role?.toUpperCase() !== 'VOLUNTEER') {
    return {
      error: {
        status: 404,
        code: 'VOLUNTEER_NOT_FOUND',
        message: 'Volunteer account not found.',
      },
    };
  }

  return { volunteer, body, bodyKeys };
};

/**
 * Update Permitted Volunteer Information (name and/or assignedLab)
 * Endpoints: PUT /api/admin/volunteers/:id, PATCH /api/admin/volunteers/:id
 * Access: Protected (Admin only)
 */
const updateVolunteer = async (req, res) => {
  try {
    const resolved = await resolveVolunteerMutationTarget(req, ['name', 'assignedLab']);
    if (resolved.error) {
      return res.status(resolved.error.status).json({
        success: false,
        code: resolved.error.code,
        message: resolved.error.message,
      });
    }

    const { volunteer, body, bodyKeys } = resolved;

    if (bodyKeys.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'NO_UPDATE_FIELDS',
        message: "Provide at least one field to update: 'name' or 'assignedLab'.",
      });
    }

    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length < 2)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_NAME',
        message: 'Volunteer name must be at least 2 characters long.',
      });
    }

    if (
      body.assignedLab !== undefined &&
      (typeof body.assignedLab !== 'string' || body.assignedLab.trim().length > 100)
    ) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ASSIGNED_LAB',
        message: 'Assigned lab must be a string up to 100 characters long.',
      });
    }

    if (body.name !== undefined) {
      volunteer.name = body.name.trim();
    }
    if (body.assignedLab !== undefined) {
      volunteer.assignedLab = body.assignedLab.trim();
    }

    await volunteer.save();

    return res.status(200).json({
      success: true,
      message: 'Volunteer details updated successfully.',
      volunteer: formatVolunteerResponse(volunteer),
    });
  } catch (error) {
    console.error('Update volunteer error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to update volunteer details.',
    });
  }
};

/**
 * Reset Volunteer Password Securely
 * Endpoint: PATCH /api/admin/volunteers/:id/reset-password
 * Access: Protected (Admin only)
 */
const resetVolunteerPassword = async (req, res) => {
  try {
    const resolved = await resolveVolunteerMutationTarget(req, ['newPassword', 'password']);
    if (resolved.error) {
      return res.status(resolved.error.status).json({
        success: false,
        code: resolved.error.code,
        message: resolved.error.message,
      });
    }

    const { volunteer, body } = resolved;

    if (body.newPassword !== undefined && body.password !== undefined) {
      return res.status(400).json({
        success: false,
        code: 'AMBIGUOUS_PASSWORD_FIELDS',
        message: "Provide either 'newPassword' or 'password', not both.",
      });
    }

    const candidatePassword = body.newPassword !== undefined ? body.newPassword : body.password;
    if (!candidatePassword || typeof candidatePassword !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'MISSING_PASSWORD',
        message: 'New password is required.',
      });
    }

    if (candidatePassword.length < 8 || candidatePassword.trim() === '') {
      return res.status(400).json({
        success: false,
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 8 characters long.',
      });
    }

    volunteer.passwordHash = await Staff.hashPassword(candidatePassword);
    await volunteer.save();

    return res.status(200).json({
      success: true,
      message: 'Volunteer password reset successfully.',
      volunteer: formatVolunteerResponse(volunteer),
    });
  } catch (error) {
    console.error('Reset volunteer password error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to reset volunteer password.',
    });
  }
};

module.exports = {
  adminLogin,
  getAdminMe,
  createVolunteer,
  listVolunteers,
  getVolunteerById,
  updateVolunteer,
  resetVolunteerPassword,
  deactivateVolunteer,
  reactivateVolunteer,
  formatAdminResponse,
  formatVolunteerResponse,
  escapeRegex,
};