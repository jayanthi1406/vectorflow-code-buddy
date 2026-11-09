const { OAuth2Client } = require('google-auth-library');
const { Student } = require('../models');
const { signStudentToken } = require('../middleware/authMiddleware');

// Lazily initialize OAuth2Client to ensure process.env.GOOGLE_CLIENT_ID is read at runtime
let googleClient = null;
const getGoogleClient = () => {
  if (!googleClient) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error('GOOGLE_CLIENT_ID must be configured in environment variables.');
    }
    googleClient = new OAuth2Client(clientId);
  }
  return googleClient;
};

/**
 * Helper to normalize and format student profile data for client responses
 */
const formatStudentResponse = (student) => ({
  id: student._id.toString(),
  name: student.name,
  email: student.email,
  role: student.role,
  registrationComplete: student.registrationComplete,
  usn: student.usn || null,
  year: student.year || null,
  currentLevel: student.currentLevel,
  highestLevelReached: student.highestLevelReached ?? 1,
  levelsCleared: student.levelsCleared ?? 0,
  competitionStatus: student.competitionStatus,
  roundAvailability: student.roundAvailability,
  walletBalance: student.walletBalance ?? 0,
  totalEarned: student.totalEarned ?? 0,
  totalRisked: student.totalRisked ?? 0,
  safeZoneAmount: student.safeZoneAmount ?? 0,
});

/**
 * Controller: verifyGoogleAuth
 * Endpoint: POST /api/auth/google
 *
 * Responsibilities:
 * 1. Receives and validates the Google ID token.
 * 2. Cryptographically verifies the token with Google using OAuth2Client.
 * 3. Enforces token audience (GOOGLE_CLIENT_ID) and issuer (accounts.google.com).
 * 4. Enforces email_verified === true.
 * 5. Strictly enforces the @vvce.ac.in email domain.
 * 6. Finds an existing student or provisions a new Student document.
 * 7. Generates an HS256 JWT session token with student._id as subject.
 * 8. Returns structured authentication response with registration status.
 */
const verifyGoogleAuth = async (req, res) => {
  try {
    // 1. Extract and validate Google ID token presence (never trust identity in body/query)
    const idToken = req.body?.idToken || req.body?.credential;

    if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
      return res.status(400).json({
        success: false,
        code: 'MISSING_GOOGLE_TOKEN',
        message: 'Google ID token is required.',
      });
    }

    // 2. Validate server-side Google Client ID configuration
    let client;
    try {
      client = getGoogleClient();
    } catch (configErr) {
      console.error('Google Auth configuration error:', configErr.message);
      return res.status(500).json({
        success: false,
        code: 'CONFIGURATION_ERROR',
        message: 'Google authentication service is temporarily misconfigured.',
      });
    }

    // 3. Cryptographically verify the Google ID token
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: idToken.trim(),
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (verifyErr) {
      console.error('Google token verification failed:', verifyErr.message);
      const isExpired = verifyErr.message && verifyErr.message.toLowerCase().includes('expired');
      return res.status(401).json({
        success: false,
        code: isExpired ? 'EXPIRED_GOOGLE_TOKEN' : 'INVALID_GOOGLE_TOKEN',
        message: isExpired
          ? 'Google ID token has expired. Please sign in again.'
          : 'Google ID token is invalid or verification failed.',
      });
    }

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_GOOGLE_TOKEN',
        message: 'Invalid Google token payload.',
      });
    }

    const {
      sub: googleSubjectId,
      email,
      email_verified: emailVerified,
      name,
      iss,
    } = payload;

    // 4. Verify token issuer
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!iss || !validIssuers.includes(iss)) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_ISSUER',
        message: 'Google token issuer is invalid.',
      });
    }

    // 5. Verify email_verified status
    if (emailVerified !== true) {
      return res.status(403).json({
        success: false,
        code: 'UNVERIFIED_EMAIL',
        message: 'Your Google email address must be verified before signing in.',
      });
    }

    // 6. Strictly enforce @vvce.ac.in domain
    const vvceDomainRegex = /^[^\s@]+@vvce\.ac\.in$/i;
    if (!email || typeof email !== 'string' || !vvceDomainRegex.test(email)) {
      return res.status(403).json({
        success: false,
        code: 'INVALID_DOMAIN',
        message: 'Only verified Google accounts with the @vvce.ac.in domain are permitted.',
      });
    }

    // 7. Verify required profile information
    if (!googleSubjectId || !name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        success: false,
        code: 'INCOMPLETE_GOOGLE_PROFILE',
        message: 'Google profile is missing required identity information.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 8. Find existing student or check conflict or create a new student record
    let student;
    try {
      // Step A: Search exclusively by Google subject ID
      student = await Student.findOne({ googleSubjectId });

      if (student) {
        // Existing verified Google student: refresh verification flag and name if necessary
        student.emailVerified = true;
        if (!student.name && name) {
          student.name = name.trim();
        }
        await student.save();
      } else {
        // Step B: No matching Google subject exists; check whether the normalized email already belongs to another student
        const emailConflict = await Student.findOne({ email: normalizedEmail });
        if (emailConflict) {
          return res.status(409).json({
            success: false,
            code: 'ACCOUNT_CONFLICT',
            message: 'An account associated with this email already exists under a different identity.',
          });
        }

        // Step C: Neither exists, provision new Student record
        student = new Student({
          googleSubjectId,
          name: name.trim(),
          email: normalizedEmail,
          emailVerified: true,
          role: 'STUDENT',
          registrationComplete: false,
          currentLevel: 1,
          competitionStatus: 'registered',
          roundAvailability: 'ready',
        });
        await student.save();
      }
    } catch (dbErr) {
      console.error('Database error in verifyGoogleAuth:', dbErr.message);
      if (dbErr.code === 11000) {
        return res.status(409).json({
          success: false,
          code: 'ACCOUNT_CONFLICT',
          message: 'An account associated with this email or identity already exists.',
        });
      }
      return res.status(500).json({
        success: false,
        code: 'DATABASE_ERROR',
        message: 'A database error occurred while processing student authentication.',
      });
    }

    // 9. Generate secure HS256 JWT session token
    let token;
    try {
      token = signStudentToken(student._id);
    } catch (jwtErr) {
      console.error('JWT generation error:', jwtErr.message);
      return res.status(500).json({
        success: false,
        code: 'TOKEN_GENERATION_FAILED',
        message: 'Failed to generate authentication session token.',
      });
    }

    // 10. Return structured response
    return res.status(200).json({
      success: true,
      token,
      registrationComplete: student.registrationComplete,
      student: formatStudentResponse(student),
    });
  } catch (error) {
    console.error('Unhandled verifyGoogleAuth error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred.',
    });
  }
};

/**
 * Controller: completeRegistration
 * Endpoint: POST /api/auth/register
 * Access: Protected (Student only, via protectStudent)
 *
 * Responsibilities:
 * 1. Uses req.student._id as the sole, authoritative source of student identity.
 * 2. Strict payload validation: Rejects any unsupported fields (e.g., name, role, email, walletBalance).
 * 3. Validates USN format (/^[A-Z0-9]{8,15}$/i) and normalizes via trim() and toUpperCase().
 * 4. Validates Academic Year against schema enum ('1st Year', '2nd Year', '3rd Year', '4th Year').
 * 5. Pre-checks for USN collision across other student accounts.
 * 6. Executes an atomic conditional update:
 *    - Updates only usn, year, and registrationComplete.
 *    - Only matches if registrationComplete is false.
 *    - Never resets or modifies competition fields or student name.
 * 7. If conditional update does not match, inspects latest student record:
 *    - If registration is already complete with identical USN and Year: returns idempotent 200 OK.
 *    - Otherwise rejects modification attempts with 400 REGISTRATION_ALREADY_COMPLETED.
 * 8. Catches MongoDB E11000 duplicate key errors on the unique USN index.
 */
const completeRegistration = async (req, res) => {
  try {
    const studentId = req.student._id;
    const body = req.body || {};

    // 1. Reject any unsupported fields in request body
    const allowedFields = ['usn', 'year'];
    const extraFields = Object.keys(body).filter((key) => !allowedFields.includes(key));
    if (extraFields.length > 0) {
      return res.status(400).json({
        success: false,
        code: 'UNSUPPORTED_FIELDS',
        message: `Registration request contains unsupported fields: ${extraFields.join(', ')}. Only 'usn' and 'year' are permitted.`,
      });
    }

    const { usn, year } = body;

    // 2. Validate presence and types
    if (!usn || typeof usn !== 'string' || usn.trim() === '') {
      return res.status(400).json({
        success: false,
        code: 'MISSING_USN',
        message: 'University Seat Number (USN) is required.',
      });
    }

    if (!year || typeof year !== 'string' || year.trim() === '') {
      return res.status(400).json({
        success: false,
        code: 'MISSING_YEAR',
        message: 'Academic year of study is required.',
      });
    }

    // 3. Normalize USN (trim and uppercase)
    const normalizedUsn = usn.trim().toUpperCase();
    const normalizedYear = year.trim();

    // 4. Validate USN format (/^[A-Z0-9]{8,15}$/i)
    const usnRegex = /^[A-Z0-9]{8,15}$/i;
    if (!usnRegex.test(normalizedUsn)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_USN_FORMAT',
        message: 'Enter a valid USN (8–15 letters or numbers).',
      });
    }

    // 5. Validate academic year against the four schema enum values
    const allowedYears = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
    if (!allowedYears.includes(normalizedYear)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_YEAR',
        message: 'Choose your year of study (1st Year, 2nd Year, 3rd Year, or 4th Year).',
      });
    }

    // 6. Pre-check for duplicate USN across other accounts
    const existingWithUsn = await Student.findOne({
      usn: normalizedUsn,
      _id: { $ne: studentId },
    });

    if (existingWithUsn) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_USN',
        message: 'That USN is already registered. Check the number or contact competition support.',
      });
    }

    // 7. Atomic conditional update: only succeeds if registrationComplete is still false
    let updatedStudent;
    try {
      updatedStudent = await Student.findOneAndUpdate(
        {
          _id: studentId,
          registrationComplete: false,
        },
        {
          $set: {
            usn: normalizedUsn,
            year: normalizedYear,
            registrationComplete: true,
          },
        },
        {
          new: true,
          runValidators: true,
        }
      );
    } catch (dbErr) {
      console.error('Error during atomic student registration:', dbErr.message);
      if (dbErr.code === 11000) {
        return res.status(409).json({
          success: false,
          code: 'DUPLICATE_USN',
          message: 'That USN is already registered. Check the number or contact competition support.',
        });
      }
      return res.status(500).json({
        success: false,
        code: 'DATABASE_ERROR',
        message: 'A database error occurred while completing registration.',
      });
    }

    // 8. If conditional update did not match, check latest record for idempotency or immutability violation
    if (!updatedStudent) {
      const latestStudent = await Student.findById(studentId);
      if (!latestStudent) {
        return res.status(401).json({
          success: false,
          code: 'USER_NOT_FOUND',
          message: 'Student account no longer exists.',
        });
      }

      // Idempotency: same USN and academic year resubmitted
      if (
        latestStudent.registrationComplete &&
        latestStudent.usn === normalizedUsn &&
        latestStudent.year === normalizedYear
      ) {
        return res.status(200).json({
          success: true,
          message: 'Student registration is already complete.',
          student: formatStudentResponse(latestStudent),
        });
      }

      // Immutability: reject any attempt to modify USN or academic year
      return res.status(400).json({
        success: false,
        code: 'REGISTRATION_ALREADY_COMPLETED',
        message: 'Registration is already complete. Your USN and academic year cannot be modified.',
      });
    }

    // 9. Return structured success response
    return res.status(200).json({
      success: true,
      message: 'Student registration completed successfully.',
      student: formatStudentResponse(updatedStudent),
    });
  } catch (error) {
    console.error('Unhandled completeRegistration error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred.',
    });
  }
};

/**
 * Controller: getMe
 * Endpoint: GET /api/auth/me
 *
 * Protected route returning the current authenticated student profile.
 * Student document is provided directly by protectStudent middleware from MongoDB.
 */
const getMe = async (req, res) => {
  try {
    const student = req.student;

    return res.status(200).json({
      success: true,
      student: formatStudentResponse(student),
    });
  } catch (error) {
    console.error('getMe controller error:', error.message);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Failed to retrieve student profile.',
    });
  }
};

module.exports = {
  verifyGoogleAuth,
  completeRegistration,
  getMe,
};