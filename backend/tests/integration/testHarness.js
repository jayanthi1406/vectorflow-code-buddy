const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { OAuth2Client } = require('google-auth-library');
const request = require('supertest');

const ALLOWED_LOCAL_URI_REGEX = /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$|\?)/i;

/**
 * Safety guard rejecting any production, Atlas, SRV, or non-local test URI.
 */
function assertSafeTestMongoUri(uri, forbiddenProductionUri = null) {
  if (!uri || typeof uri !== 'string' || uri.trim() === '') {
    throw new Error('SAFETY_BLOCK: Refusing to initialize integration test DB without an isolated test URI.');
  }
  const trimmed = uri.trim();
  if (/^mongodb\+srv:\/\//i.test(trimmed) || /\.mongodb\.net/i.test(trimmed)) {
    throw new Error('SAFETY_BLOCK: Refusing to run integration tests against a remote/Atlas MongoDB URI.');
  }
  if (!ALLOWED_LOCAL_URI_REGEX.test(trimmed)) {
    throw new Error('SAFETY_BLOCK: Integration test URI must target loopback (127.0.0.1 or localhost) only.');
  }
  if (forbiddenProductionUri && trimmed === forbiddenProductionUri.trim()) {
    throw new Error('SAFETY_BLOCK: Test MongoDB URI must never match the configured MONGO_URI.');
  }
}

/**
 * Canonical six-level seed fixtures matching backend/scripts/seedLevels.js.
 */
function getCanonicalLevelsSeed() {
  return [
    {
      number: 1,
      name: 'Level 1',
      entryRiskAmount: 0,
      winningPayout: 50,
      losingPayout: 50,
      safeZoneAmount: 50,
      isSafeZone: true,
      isFinal: false,
      durationSeconds: 180,
      isActive: true,
    },
    {
      number: 2,
      name: 'Level 2',
      entryRiskAmount: 50,
      winningPayout: 100,
      losingPayout: 50,
      safeZoneAmount: 0,
      isSafeZone: false,
      isFinal: false,
      durationSeconds: 180,
      isActive: true,
    },
    {
      number: 3,
      name: 'Level 3',
      entryRiskAmount: 100,
      winningPayout: 150,
      losingPayout: 50,
      safeZoneAmount: 0,
      isSafeZone: false,
      isFinal: false,
      durationSeconds: 180,
      isActive: true,
    },
    {
      number: 4,
      name: 'Level 4',
      entryRiskAmount: 150,
      winningPayout: 250,
      losingPayout: 50,
      safeZoneAmount: 250,
      isSafeZone: true,
      isFinal: false,
      durationSeconds: 180,
      isActive: true,
    },
    {
      number: 5,
      name: 'Level 5',
      entryRiskAmount: 0,
      winningPayout: 350,
      losingPayout: 250,
      safeZoneAmount: 0,
      isSafeZone: false,
      isFinal: false,
      durationSeconds: 180,
      isActive: true,
    },
    {
      number: 6,
      name: 'Level 6',
      entryRiskAmount: 100,
      winningPayout: 500,
      losingPayout: 250,
      safeZoneAmount: 0,
      isSafeZone: false,
      isFinal: true,
      durationSeconds: 180,
      isActive: true,
    },
  ];
}

/**
 * Build an active question bank covering Levels 1-6 for both EASY and HARD difficulties.
 */
function buildQuestionBankSeed(adminId) {
  const questions = [];
  for (let levelNumber = 1; levelNumber <= 6; levelNumber += 1) {
    for (const difficulty of ['EASY', 'HARD']) {
      for (let variant = 1; variant <= 2; variant += 1) {
        questions.push({
          title: `L${levelNumber} ${difficulty} Problem ${variant}`,
          statement: `Solve integration test challenge ${variant} for Level ${levelNumber} (${difficulty}). Read standard input and print exact output.`,
          constraints: [`1 <= N <= ${levelNumber * 1000}`, 'Time Limit: 1s'],
          examples: [
            {
              id: `ex-${levelNumber}-${difficulty}-${variant}`,
              title: 'Sample 1',
              input: `${levelNumber}`,
              output: `${levelNumber * 2}`,
              explanation: 'Multiply input by two.',
            },
          ],
          difficulty,
          levelNumber,
          hiddenTestCases: [
            { input: `${levelNumber + 5}`, expectedOutput: `${(levelNumber + 5) * 2}` },
          ],
          isActive: true,
          createdBy: adminId,
        });
      }
    }
  }
  return questions;
}

class IntegrationTestEnvironment {
  constructor() {
    this.replSet = null;
    this.app = null;
    this.models = null;
    this.securityMiddleware = null;
    this.googleTokenMap = new Map();
    this.originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
    this.originalDotenvConfig = dotenv.config;
    this.savedEnv = { ...process.env };
    this.seededAdminCredentials = {
      username: 'intadmin',
      password: 'IntegrationAdminPass!2026',
      name: 'Integration Admin',
    };
    this.createdTracker = {
      staffIds: new Set(),
      studentIds: new Set(),
      levelIds: new Set(),
      questionIds: new Set(),
      roundIds: new Set(),
      evaluationIds: new Set(),
      transactionIds: new Set(),
    };
  }

  registerGoogleIdentity(idToken, payload) {
    this.googleTokenMap.set(idToken, payload);
  }

  trackStudentId(id) {
    if (id) this.createdTracker.studentIds.add(String(id));
  }

  trackStaffId(id) {
    if (id) this.createdTracker.staffIds.add(String(id));
  }

  async start(envOverrides = {}) {
    // Capture any pre-existing MONGO_URI strictly for negative safeguard comparison; NEVER connect to it.
    const preexistingEnvUri = process.env.MONGO_URI || null;

    // 1. Boot isolated single-node WiredTiger MongoDB Replica Set in memory (ACID tx capable)
    this.replSet = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        storageEngine: 'wiredTiger',
      },
      instanceOpts: [
        {
          bindIp: '127.0.0.1',
        },
      ],
    });

    const memUri = this.replSet.getUri();
    assertSafeTestMongoUri(memUri, preexistingEnvUri);

    // 2. Prevent server.js from reading production backend/.env, then inject isolated test config
    dotenv.config = () => ({ parsed: {} });
    process.env.NODE_ENV = envOverrides.NODE_ENV || 'production';
    process.env.MONGO_URI = memUri;
    process.env.JWT_SECRET =
      envOverrides.JWT_SECRET ||
      `integration-test-jwt-secret-${crypto.randomBytes(16).toString('hex')}`;
    process.env.JWT_EXPIRES_IN = envOverrides.JWT_EXPIRES_IN || '1h';
    process.env.GOOGLE_CLIENT_ID =
      envOverrides.GOOGLE_CLIENT_ID || 'test-google-oauth-client-id.apps.googleusercontent.com';
    process.env.CORS_ORIGINS =
      envOverrides.CORS_ORIGINS ||
      'https://codebuddy.vvce.ac.in,https://admin.codebuddy.vvce.ac.in';
    process.env.TRUST_PROXY = envOverrides.TRUST_PROXY || '1';
    process.env.JSON_BODY_LIMIT = envOverrides.JSON_BODY_LIMIT || '128kb';
    process.env.API_RATE_LIMIT_MAX = envOverrides.API_RATE_LIMIT_MAX || '2000';
    process.env.LOGIN_RATE_LIMIT_MAX = envOverrides.LOGIN_RATE_LIMIT_MAX || '50';
    process.env.LOGIN_IP_RATE_LIMIT_MAX = envOverrides.LOGIN_IP_RATE_LIMIT_MAX || '200';
    process.env.GOOGLE_AUTH_RATE_LIMIT_MAX = envOverrides.GOOGLE_AUTH_RATE_LIMIT_MAX || '500';

    // 3. Connect Mongoose strictly to the verified loopback in-memory replica set
    await mongoose.connect(memUri);

    const connHost = String(mongoose.connection.host || '').toLowerCase();
    if (
      !['127.0.0.1', 'localhost', '::1'].includes(connHost) ||
      connHost.includes('mongodb.net')
    ) {
      await mongoose.disconnect();
      throw new Error(`SAFETY_BLOCK: Connected host "${connHost}" is not an isolated local test instance.`);
    }

    // 4. Install Google OAuth ID-token cryptographic verification stub ONLY
    const tokenMap = this.googleTokenMap;
    OAuth2Client.prototype.verifyIdToken = async function ({ idToken }) {
      const entry = tokenMap.get(idToken);
      if (!entry) {
        throw new Error('Wrong number of segments in token or invalid synthetic Google token.');
      }
      if (entry.expired) {
        throw new Error('Token used too late (expired).');
      }
      return {
        getPayload: () => entry.payload,
      };
    };

    // 5. Load real Express app and models, then synchronize real MongoDB indexes
    this.app = require('../../server');
    this.models = require('../../models');
    this.securityMiddleware = require('../../middleware/securityMiddleware');

    const { Staff, Student, Level, Question, Round, Evaluation, Transaction } = this.models;
    await Promise.all([
      Staff.syncIndexes(),
      Student.syncIndexes(),
      Level.syncIndexes(),
      Question.syncIndexes(),
      Round.syncIndexes(),
      Evaluation.syncIndexes(),
      Transaction.syncIndexes(),
    ]);
  }

  async seedBaseData() {
    const { Staff, Admin, Level, Question } = this.models;

    const passwordHash = await Staff.hashPassword(this.seededAdminCredentials.password);
    const admin = await Admin.create({
      name: this.seededAdminCredentials.name,
      username: this.seededAdminCredentials.username,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    });
    this.trackStaffId(admin._id);

    const insertedLevels = await Level.insertMany(getCanonicalLevelsSeed());
    for (const lvl of insertedLevels) {
      this.createdTracker.levelIds.add(lvl._id.toString());
    }

    const insertedQuestions = await Question.insertMany(buildQuestionBankSeed(admin._id));
    for (const q of insertedQuestions) {
      this.createdTracker.questionIds.add(q._id.toString());
    }

    return { admin, levels: insertedLevels, questions: insertedQuestions };
  }

  /**
   * Reload server/rate-limit middleware with custom env (keeping existing DB connection intact)
   * for isolated security/rate-limit verification.
   */
  reloadAppWithEnv(envOverrides = {}) {
    const backendRoot = path.resolve(__dirname, '../..').toLowerCase();
    for (const cacheKey of Object.keys(require.cache)) {
      const normalized = cacheKey.toLowerCase();
      if (
        normalized.startsWith(backendRoot) &&
        !normalized.includes(`${path.sep}node_modules${path.sep}`) &&
        !normalized.includes(`${path.sep}models${path.sep}`) &&
        !normalized.includes(`${path.sep}tests${path.sep}`)
      ) {
        delete require.cache[cacheKey];
      }
    }
    for (const [k, v] of Object.entries(envOverrides)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = String(v);
    }
    const freshApp = require('../../server');
    const freshSecurity = require('../../middleware/securityMiddleware');
    return { app: freshApp, securityMiddleware: freshSecurity };
  }

  http() {
    return request(this.app);
  }

  async cleanupCreatedTestRecords() {
    if (!this.models || mongoose.connection.readyState !== 1) return;

    const { Staff, Student, Level, Question, Round, Evaluation, Transaction } = this.models;
    const studentIds = Array.from(this.createdTracker.studentIds);
    const staffIds = Array.from(this.createdTracker.staffIds);
    const levelIds = Array.from(this.createdTracker.levelIds);
    const questionIds = Array.from(this.createdTracker.questionIds);

    // Note: Transaction has pre('deleteMany') immutability hook by design, so ephemeral in-memory
    // replica set disposal handles final ledger teardown; we delete mutable test-created docs by tracked IDs only.
    if (studentIds.length > 0) {
      await Evaluation.deleteMany({ studentId: { $in: studentIds } });
      await Round.deleteMany({ studentId: { $in: studentIds } });
      await Student.deleteMany({ _id: { $in: studentIds } });
    }
    if (questionIds.length > 0) {
      await Question.deleteMany({ _id: { $in: questionIds } });
    }
    if (levelIds.length > 0) {
      await Level.deleteMany({ _id: { $in: levelIds } });
    }
    if (staffIds.length > 0) {
      await Staff.deleteMany({ _id: { $in: staffIds } });
    }
  }

  async stop() {
    OAuth2Client.prototype.verifyIdToken = this.originalVerifyIdToken;
    dotenv.config = this.originalDotenvConfig;

    try {
      await this.cleanupCreatedTestRecords();
    } finally {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      if (this.replSet) {
        await this.replSet.stop();
        this.replSet = null;
      }

      for (const key of Object.keys(process.env)) {
        if (!(key in this.savedEnv)) delete process.env[key];
      }
      Object.assign(process.env, this.savedEnv);
    }
  }
}

module.exports = {
  IntegrationTestEnvironment,
  assertSafeTestMongoUri,
  getCanonicalLevelsSeed,
};

