const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Student, Staff, Admin, Volunteer } = require('../models');

const OBJECT_ID_HEX_REGEX = /^[a-fA-F0-9]{24}$/;

const isValidObjectIdSubject = (value) =>
  typeof value === 'string' &&
  OBJECT_ID_HEX_REGEX.test(value) &&
  mongoose.Types.ObjectId.isValid(value);

/**
 * Retrieve the JWT secret key from environment variables.
 * Strictly required across all environments; no fallback secret allowed.
 */
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim() === '') {
    throw new Error('JWT_SECRET must be configured in environment variables.');
  }
  return secret;
};

/**
 * Helper to generate a signed student session JWT using HS256.
 */
const signStudentToken = (studentId, expiresIn = process.env.JWT_EXPIRES_IN || '7d') => {
  return jwt.sign(
    {
      sub: String(studentId),
      role: 'STUDENT',
    },
    getJwtSecret(),
    {
      algorithm: 'HS256',
      expiresIn,
    }
  );
};

/**
 * Helper to generate a signed admin session JWT using HS256.
 */
const signAdminToken = (adminId, expiresIn = process.env.JWT_EXPIRES_IN || '7d') => {
  return jwt.sign(
    {
      sub: String(adminId),
      role: 'ADMIN',
    },
    getJwtSecret(),
    {
      algorithm: 'HS256',
      expiresIn,
    }
  );
};

/**
 * Helper to generate a signed volunteer session JWT using HS256.
 */
const signVolunteerToken = (volunteerId, expiresIn = process.env.JWT_EXPIRES_IN || '7d') => {
  return jwt.sign(
    {
      sub: String(volunteerId),
      role: 'VOLUNTEER',
    },
    getJwtSecret(),
    {
      algorithm: 'HS256',
      expiresIn,
    }
  );
};

/**
 * Internal helper to extract and cryptographically verify Bearer JWT from headers.
 * Throws structured errors for missing, expired, or invalid tokens.
 */
const extractAndVerifyToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    const error = new Error('Authentication required. No token provided.');
    error.code = 'NO_TOKEN';
    error.statusCode = 401;
    throw error;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    const error = new Error('Authentication required. No token provided.');
    error.code = 'NO_TOKEN';
    error.statusCode = 401;
    throw error;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
    });

    if (!decoded.sub || typeof decoded.sub !== 'string' || decoded.sub.trim() === '') {
      const error = new Error('Authentication token missing user identifier.');
      error.code = 'MALFORMED_TOKEN_PAYLOAD';
      error.statusCode = 401;
      throw error;
    }

    if (!isValidObjectIdSubject(decoded.sub.trim())) {
      const error = new Error('Authentication token contains an invalid user identifier.');
      error.code = 'INVALID_TOKEN';
      error.statusCode = 401;
      throw error;
    }

    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      const error = new Error('Session has expired. Please sign in again.');
      error.code = 'TOKEN_EXPIRED';
      error.statusCode = 401;
      throw error;
    }
    if (err.name === 'NotBeforeError') {
      const error = new Error('Authentication token is not active yet.');
      error.code = 'INVALID_TOKEN';
      error.statusCode = 401;
      throw error;
    }
    if (err.name === 'JsonWebTokenError') {
      const error = new Error('Invalid authentication token.');
      error.code = 'INVALID_TOKEN';
      error.statusCode = 401;
      throw error;
    }
    throw err;
  }
};

/**
 * Student Authentication Middleware (protectStudent)
 *
 * Enforces:
 * 1. Valid HS256 JWT with role === 'STUDENT'.
 * 2. Live Student record existence in MongoDB with role === 'STUDENT'.
 * 3. Injects req.student and req.user for downstream handlers.
 */
const protectStudent = async (req, res, next) => {
  try {
    let decoded;
    try {
      decoded = extractAndVerifyToken(req);
    } catch (tokenErr) {
      return res.status(tokenErr.statusCode || 401).json({
        success: false,
        code: tokenErr.code || 'AUTH_FAILED',
        message: tokenErr.message,
      });
    }

    // Role check on JWT payload
    if (decoded.role !== 'STUDENT') {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN_ROLE',
        message: 'Access denied. Student authorization required.',
      });
    }

    // Live MongoDB verification
    const student = await Student.findById(decoded.sub.trim());
    if (!student) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'Student account belonging to this token no longer exists.',
      });
    }

    if (student.role !== 'STUDENT') {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN_ROLE',
        message: 'Access denied. Account is not a registered student.',
      });
    }

    req.student = student;
    req.user = {
      id: student._id.toString(),
      role: 'STUDENT',
    };

    next();
  } catch (error) {
    console.error('Student auth middleware error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_AUTH_ERROR',
      message: 'Internal authentication error.',
    });
  }
};

/**
 * Admin Authentication Middleware (protectAdmin)
 *
 * Enforces:
 * 1. Valid HS256 JWT with role === 'ADMIN'.
 * 2. Live Staff record existence in MongoDB with role === 'ADMIN'.
 * 3. Verified active status (isActive === true).
 * 4. Injects req.admin and req.user for downstream handlers.
 */
const protectAdmin = async (req, res, next) => {
  try {
    let decoded;
    try {
      decoded = extractAndVerifyToken(req);
    } catch (tokenErr) {
      return res.status(tokenErr.statusCode || 401).json({
        success: false,
        code: tokenErr.code || 'AUTH_FAILED',
        message: tokenErr.message,
      });
    }

    // Role check on JWT payload
    if (decoded.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN_ROLE',
        message: 'Access denied. Admin authorization required.',
      });
    }

    // Live MongoDB verification
    const admin = await Admin.findById(decoded.sub.trim());
    if (!admin) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'Admin account belonging to this token no longer exists.',
      });
    }

    const normalizedRole = admin.role?.toUpperCase();
    if (normalizedRole !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN_ROLE',
        message: 'Access denied. Account does not have administrator privileges.',
      });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Admin account has been deactivated.',
      });
    }

    req.admin = admin;
    req.user = {
      id: admin._id.toString(),
      role: 'ADMIN',
    };

    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_AUTH_ERROR',
      message: 'Internal authentication error.',
    });
  }
};

/**
 * Admin Authorization Middleware (authorizeAdmin)
 *
 * Verifies that the authenticated user on req.user has role === 'ADMIN'.
 */
const authorizeAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      code: 'FORBIDDEN_ROLE',
      message: 'Access denied. Admin authorization required.',
    });
  }
  next();
};

/**
 * Volunteer Authentication Middleware (protectVolunteer)
 *
 * Enforces:
 * 1. Valid HS256 JWT with role === 'VOLUNTEER'.
 * 2. Live Staff record existence in MongoDB with role === 'VOLUNTEER'.
 * 3. Verified active status (isActive === true). Deactivated volunteers are blocked.
 * 4. Injects req.volunteer and req.user for downstream handlers.
 */
const protectVolunteer = async (req, res, next) => {
  try {
    let decoded;
    try {
      decoded = extractAndVerifyToken(req);
    } catch (tokenErr) {
      return res.status(tokenErr.statusCode || 401).json({
        success: false,
        code: tokenErr.code || 'AUTH_FAILED',
        message: tokenErr.message,
      });
    }

    // Role check on JWT payload
    if (decoded.role !== 'VOLUNTEER') {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN_ROLE',
        message: 'Access denied. Volunteer authorization required.',
      });
    }

    // Live MongoDB verification
    const volunteer = await Volunteer.findById(decoded.sub.trim());
    if (!volunteer) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'Volunteer account belonging to this token no longer exists.',
      });
    }

    const normalizedRole = volunteer.role?.toUpperCase();
    if (normalizedRole !== 'VOLUNTEER') {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN_ROLE',
        message: 'Access denied. Account does not have volunteer privileges.',
      });
    }

    if (!volunteer.isActive) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Volunteer account has been deactivated. Please contact an administrator.',
      });
    }

    req.volunteer = volunteer;
    req.user = {
      id: volunteer._id.toString(),
      role: 'VOLUNTEER',
    };

    next();
  } catch (error) {
    console.error('Volunteer auth middleware error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_AUTH_ERROR',
      message: 'Internal authentication error.',
    });
  }
};

/**
 * Volunteer Authorization Middleware (authorizeVolunteer)
 *
 * Verifies that the authenticated user on req.user has role === 'VOLUNTEER'.
 */
const authorizeVolunteer = (req, res, next) => {
  if (!req.user || req.user.role !== 'VOLUNTEER') {
    return res.status(403).json({
      success: false,
      code: 'FORBIDDEN_ROLE',
      message: 'Access denied. Volunteer authorization required.',
    });
  }
  next();
};

/**
 * Resolve and validate the live database account matching an authenticated JWT role.
 * Enforces account existence, role match, and active status for staff accounts.
 */
const resolveAuthenticatedAccount = async (req, role, subjectId) => {
  if (role === 'STUDENT') {
    const student = await Student.findById(subjectId);
    if (!student) {
      return {
        error: {
          status: 401,
          code: 'USER_NOT_FOUND',
          message: 'Student account belonging to this token no longer exists.',
        },
      };
    }
    if (student.role !== 'STUDENT') {
      return {
        error: {
          status: 403,
          code: 'FORBIDDEN_ROLE',
          message: 'Access denied. Account is not a registered student.',
        },
      };
    }
    req.student = student;
    req.user = {
      id: student._id.toString(),
      role: 'STUDENT',
    };
    return { account: student };
  }

  if (role === 'ADMIN') {
    const admin = await Admin.findById(subjectId);
    if (!admin) {
      return {
        error: {
          status: 401,
          code: 'USER_NOT_FOUND',
          message: 'Admin account belonging to this token no longer exists.',
        },
      };
    }
    if (admin.role?.toUpperCase() !== 'ADMIN') {
      return {
        error: {
          status: 403,
          code: 'FORBIDDEN_ROLE',
          message: 'Access denied. Account does not have administrator privileges.',
        },
      };
    }
    if (!admin.isActive) {
      return {
        error: {
          status: 403,
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Admin account has been deactivated.',
        },
      };
    }
    req.admin = admin;
    req.user = {
      id: admin._id.toString(),
      role: 'ADMIN',
    };
    return { account: admin };
  }

  if (role === 'VOLUNTEER') {
    const volunteer = await Volunteer.findById(subjectId);
    if (!volunteer) {
      return {
        error: {
          status: 401,
          code: 'USER_NOT_FOUND',
          message: 'Volunteer account belonging to this token no longer exists.',
        },
      };
    }
    if (volunteer.role?.toUpperCase() !== 'VOLUNTEER') {
      return {
        error: {
          status: 403,
          code: 'FORBIDDEN_ROLE',
          message: 'Access denied. Account does not have volunteer privileges.',
        },
      };
    }
    if (!volunteer.isActive) {
      return {
        error: {
          status: 403,
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Volunteer account has been deactivated. Please contact an administrator.',
        },
      };
    }
    req.volunteer = volunteer;
    req.user = {
      id: volunteer._id.toString(),
      role: 'VOLUNTEER',
    };
    return { account: volunteer };
  }

  return {
    error: {
      status: 403,
      code: 'FORBIDDEN_ROLE',
      message: 'Access denied. Insufficient role authorization.',
    },
  };
};

/**
 * Shared Multi-Role Authentication Middleware Factory (protectRoles)
 *
 * Allows access to requests bearing a valid JWT whose role is included in allowedRoles,
 * while enforcing live MongoDB account existence and active staff verification.
 */
const protectRoles = (...allowedRoles) => {
  const normalizedAllowedRoles = allowedRoles
    .flat()
    .map((role) => (typeof role === 'string' ? role.trim().toUpperCase() : ''))
    .filter(Boolean);

  return async (req, res, next) => {
    try {
      let decoded;
      try {
        decoded = extractAndVerifyToken(req);
      } catch (tokenErr) {
        return res.status(tokenErr.statusCode || 401).json({
          success: false,
          code: tokenErr.code || 'AUTH_FAILED',
          message: tokenErr.message,
        });
      }

      const tokenRole = typeof decoded.role === 'string' ? decoded.role.trim().toUpperCase() : '';
      if (!normalizedAllowedRoles.includes(tokenRole)) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_ROLE',
          message: 'Access denied. Insufficient role authorization.',
        });
      }

      const resolved = await resolveAuthenticatedAccount(req, tokenRole, decoded.sub.trim());
      if (resolved.error) {
        return res.status(resolved.error.status).json({
          success: false,
          code: resolved.error.code,
          message: resolved.error.message,
        });
      }

      next();
    } catch (error) {
      console.error('Multi-role auth middleware error:', error.message);
      return res.status(500).json({
        success: false,
        code: 'INTERNAL_AUTH_ERROR',
        message: 'Internal authentication error.',
      });
    }
  };
};

module.exports = {
  getJwtSecret,
  signStudentToken,
  signAdminToken,
  signVolunteerToken,
  protectStudent,
  protectAdmin,
  authorizeAdmin,
  protectVolunteer,
  authorizeVolunteer,
  protectRoles,
};