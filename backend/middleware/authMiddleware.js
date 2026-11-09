const jwt = require('jsonwebtoken');
const { Student, Staff, Admin, Volunteer } = require('../models');

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

    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      const error = new Error('Session has expired. Please sign in again.');
      error.code = 'TOKEN_EXPIRED';
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
};