const crypto = require('crypto');
const net = require('net');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const DEFAULT_DEV_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const DEFAULT_JSON_BODY_LIMIT = '256kb';
const MIN_JSON_BODY_BYTES = 1024; // 1kb
const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024; // 5mb ceiling
const MIN_PROD_JWT_SECRET_LENGTH = 32;

const DEFAULT_API_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_API_MAX = 2000;
const DEFAULT_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LOGIN_MAX = 10;
const DEFAULT_LOGIN_IP_MAX = 60;
const DEFAULT_GOOGLE_AUTH_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_GOOGLE_AUTH_MAX = 300;

const SAFE_TRUST_PROXY_PRESETS = new Set(['loopback', 'linklocal', 'uniquelocal']);
const API_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const API_ALLOWED_HEADERS = ['Content-Type', 'Authorization'];

const isProductionEnv = () =>
  String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

/**
 * Parse a positive integer env setting safely.
 */
const parsePositiveInt = (rawValue, fallback, fieldName) => {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return { value: fallback };
  }

  const trimmed = String(rawValue).trim();
  if (!/^\d+$/.test(trimmed)) {
    return { error: `${fieldName} must be a positive integer.` };
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return { error: `${fieldName} must be a positive integer greater than zero.` };
  }

  return { value: parsed };
};

/**
 * Parse and validate bounded JSON body size limits (e.g., 100kb, 256kb, 1mb).
 */
const parseJsonBodyLimit = (rawValue = process.env.JSON_BODY_LIMIT) => {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return { value: DEFAULT_JSON_BODY_LIMIT };
  }

  const trimmed = String(rawValue).trim().toLowerCase();
  const match = trimmed.match(/^(\d+)(b|kb|mb)?$/);
  if (!match) {
    return {
      error: 'JSON_BODY_LIMIT must be a bounded byte size such as 100kb, 256kb, or 1mb.',
    };
  }

  const amount = Number(match[1]);
  const unit = match[2] || 'b';
  const multiplier = unit === 'mb' ? 1024 * 1024 : unit === 'kb' ? 1024 : 1;
  const totalBytes = amount * multiplier;

  if (totalBytes < MIN_JSON_BODY_BYTES || totalBytes > MAX_JSON_BODY_BYTES) {
    return {
      error: 'JSON_BODY_LIMIT must be between 1kb and 5mb.',
    };
  }

  return { value: `${amount}${unit}` };
};

/**
 * Parse and validate CORS_ORIGINS comma-separated allowlist.
 */
const parseCorsOrigins = (rawValue = process.env.CORS_ORIGINS) => {
  const production = isProductionEnv();

  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    if (production) {
      return {
        origins: [],
        error: 'CORS_ORIGINS must be configured with one or more allowed origins in production.',
      };
    }
    return { origins: [...DEFAULT_DEV_CORS_ORIGINS] };
  }

  const entries = String(rawValue)
    .split(',')
    .map((entry) => entry.trim());

  if (entries.some((entry) => entry === '')) {
    return {
      origins: [],
      error: 'CORS_ORIGINS contains an empty origin entry.',
    };
  }

  const normalizedOrigins = new Set();

  for (const entry of entries) {
    if (entry === '*') {
      return {
        origins: [],
        error: 'CORS_ORIGINS cannot include wildcard (*) origin access.',
      };
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(entry);
    } catch (_) {
      return {
        origins: [],
        error: `CORS_ORIGINS contains an invalid URL origin: "${entry}".`,
      };
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        origins: [],
        error: `CORS_ORIGINS only permits http/https origins: "${entry}".`,
      };
    }

    const withoutTrailingSlash = entry.replace(/\/+$/, '');
    if (
      parsedUrl.origin !== withoutTrailingSlash ||
      parsedUrl.pathname !== '/' ||
      parsedUrl.search !== '' ||
      parsedUrl.hash !== ''
    ) {
      return {
        origins: [],
        error: `CORS_ORIGINS entries must be pure origins without paths or query strings: "${entry}".`,
      };
    }

    normalizedOrigins.add(parsedUrl.origin);
  }

  return { origins: Array.from(normalizedOrigins) };
};

const isValidIpOrCidr = (value) => {
  const slashIndex = value.indexOf('/');
  if (slashIndex === -1) {
    return net.isIP(value) !== 0;
  }

  const ipPart = value.slice(0, slashIndex);
  const prefixPart = value.slice(slashIndex + 1);
  const ipVersion = net.isIP(ipPart);
  if (ipVersion === 0 || !/^\d+$/.test(prefixPart)) {
    return false;
  }

  const prefix = Number(prefixPart);
  const maxPrefix = ipVersion === 4 ? 32 : 128;
  return prefix >= 0 && prefix <= maxPrefix;
};

/**
 * Validate and resolve Express `trust proxy` configuration from TRUST_PROXY.
 * Defaults strictly to false (disabled) and rejects permissive `true`.
 */
const resolveTrustProxySetting = (rawValue = process.env.TRUST_PROXY) => {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return { value: false };
  }

  const trimmed = String(rawValue).trim();
  const lowered = trimmed.toLowerCase();

  if (lowered === 'false' || lowered === '0') {
    return { value: false };
  }

  if (lowered === 'true') {
    return {
      error:
        "TRUST_PROXY cannot be set to 'true' because permissive proxy trust enables IP rate-limit spoofing. Specify a hop count (e.g., '1'), preset ('loopback'), or trusted proxy IP list.",
    };
  }

  if (/^\d+$/.test(trimmed)) {
    const hops = Number(trimmed);
    if (!Number.isSafeInteger(hops) || hops < 1 || hops > 10) {
      return {
        error: 'TRUST_PROXY numeric hop count must be an integer between 1 and 10.',
      };
    }
    return { value: hops };
  }

  if (SAFE_TRUST_PROXY_PRESETS.has(lowered)) {
    return { value: lowered };
  }

  const parts = trimmed.split(',').map((item) => item.trim());
  if (parts.length > 0 && parts.every((item) => item !== '' && isValidIpOrCidr(item))) {
    return { value: parts.join(',') };
  }

  return {
    error:
      "TRUST_PROXY must be 'false', a hop count (1-10), a safe preset ('loopback', 'linklocal', 'uniquelocal'), or comma-separated proxy IPs/CIDRs.",
  };
};

/**
 * Validate required runtime configuration before starting HTTP listener / DB connection.
 * Intentionally NOT invoked at module import time so automated tests importing `app` are unaffected.
 */
const validateStartupEnv = () => {
  const errors = [];
  const production = isProductionEnv();

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri || typeof mongoUri !== 'string' || mongoUri.trim() === '') {
    errors.push('MONGO_URI is required.');
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || typeof jwtSecret !== 'string' || jwtSecret.trim() === '') {
    errors.push('JWT_SECRET is required.');
  } else if (production && jwtSecret.trim().length < MIN_PROD_JWT_SECRET_LENGTH) {
    errors.push(
      `JWT_SECRET must be at least ${MIN_PROD_JWT_SECRET_LENGTH} characters in production.`
    );
  }

  if (process.env.PORT !== undefined && String(process.env.PORT).trim() !== '') {
    const portStr = String(process.env.PORT).trim();
    const portNum = Number(portStr);
    if (!/^\d+$/.test(portStr) || !Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      errors.push('PORT must be a valid TCP port between 1 and 65535.');
    }
  }

  const trustProxyCheck = resolveTrustProxySetting(process.env.TRUST_PROXY);
  if (trustProxyCheck.error) {
    errors.push(trustProxyCheck.error);
  }

  const corsCheck = parseCorsOrigins(process.env.CORS_ORIGINS);
  if (corsCheck.error) {
    errors.push(corsCheck.error);
  }

  const jsonLimitCheck = parseJsonBodyLimit(process.env.JSON_BODY_LIMIT);
  if (jsonLimitCheck.error) {
    errors.push(jsonLimitCheck.error);
  }

  const numericChecks = [
    parsePositiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, DEFAULT_API_WINDOW_MS, 'API_RATE_LIMIT_WINDOW_MS'),
    parsePositiveInt(process.env.API_RATE_LIMIT_MAX, DEFAULT_API_MAX, 'API_RATE_LIMIT_MAX'),
    parsePositiveInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, DEFAULT_LOGIN_WINDOW_MS, 'LOGIN_RATE_LIMIT_WINDOW_MS'),
    parsePositiveInt(process.env.LOGIN_RATE_LIMIT_MAX, DEFAULT_LOGIN_MAX, 'LOGIN_RATE_LIMIT_MAX'),
    parsePositiveInt(process.env.LOGIN_IP_RATE_LIMIT_MAX, DEFAULT_LOGIN_IP_MAX, 'LOGIN_IP_RATE_LIMIT_MAX'),
    parsePositiveInt(
      process.env.GOOGLE_AUTH_RATE_LIMIT_WINDOW_MS,
      DEFAULT_GOOGLE_AUTH_WINDOW_MS,
      'GOOGLE_AUTH_RATE_LIMIT_WINDOW_MS'
    ),
    parsePositiveInt(
      process.env.GOOGLE_AUTH_RATE_LIMIT_MAX,
      DEFAULT_GOOGLE_AUTH_MAX,
      'GOOGLE_AUTH_RATE_LIMIT_MAX'
    ),
  ];

  for (const check of numericChecks) {
    if (check.error) {
      errors.push(check.error);
    }
  }

  // Conditional Google OAuth check: do not block startup when Google login is intentionally omitted,
  // but reject explicitly blank string assignments and warn cleanly when absent.
  if (process.env.GOOGLE_CLIENT_ID === undefined) {
    console.warn(
      'Startup configuration notice: GOOGLE_CLIENT_ID is not set; Google OAuth sign-in (/api/auth/google) will return CONFIGURATION_ERROR until configured.'
    );
  } else if (typeof process.env.GOOGLE_CLIENT_ID !== 'string' || process.env.GOOGLE_CLIENT_ID.trim() === '') {
    console.warn(
      'Startup configuration notice: GOOGLE_CLIENT_ID is empty; Google OAuth sign-in (/api/auth/google) will remain unavailable.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Helmet middleware configured for a standalone Express JSON API supporting
 * a cross-origin React frontend using Google Identity Services and Google Fonts.
 */
const createHelmetMiddleware = () => {
  const production = isProductionEnv();

  return helmet({
    hidePoweredBy: true,
    noSniff: true,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: production
      ? {
          maxAge: 15552000, // 180 days
          includeSubDomains: true,
        }
      : false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", 'https://accounts.google.com'],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://accounts.google.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        frameSrc: ["'self'", 'https://accounts.google.com'],
        connectSrc: ["'self'", 'https://accounts.google.com'],
        imgSrc: ["'self'", 'data:', 'https://*.googleusercontent.com'],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
  });
};

/**
 * Environment-driven CORS allowlist middleware.
 * Rejects unapproved browser origins with a structured 403 CORS_ORIGIN_NOT_ALLOWED error
 * while permitting requests without an Origin header (CLI, server-to-server, tests).
 */
const createCorsMiddleware = () => {
  const { origins } = parseCorsOrigins(process.env.CORS_ORIGINS);
  const allowedOriginSet = new Set(origins);

  return cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOriginSet.has(origin)) {
        return callback(null, true);
      }

      const corsError = new Error('Origin is not allowed by CORS policy.');
      corsError.statusCode = 403;
      corsError.code = 'CORS_ORIGIN_NOT_ALLOWED';
      corsError.isCorsError = true;
      return callback(corsError);
    },
    methods: API_ALLOWED_METHODS,
    allowedHeaders: API_ALLOWED_HEADERS,
    credentials: false,
    optionsSuccessStatus: 204,
  });
};

/**
 * Normalize client IP safely for both live sockets and PassThrough test sockets.
 * Explicitly calls express-rate-limit's `ipKeyGenerator` for IPv6 subnet normalization.
 */
const normalizeClientIpKey = (req) => {
  const rawIp = typeof req.ip === 'string' && req.ip.trim() !== '' ? req.ip.trim() : '';
  if (!rawIp) {
    return 'unknown-client';
  }
  const cleanIp = rawIp.includes(':') && !net.isIPv6(rawIp) ? rawIp.split(':')[0] : rawIp;
  return net.isIP(cleanIp) ? ipKeyGenerator(cleanIp) : cleanIp;
};

const hashIdentifier = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex');

const createRateLimitResponseHandler = (message) => (_req, res) => {
  return res.status(429).json({
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message,
  });
};

let activeStores = [];
let cachedRateLimiters = null;

const createCredentialLimiterPair = ({ bucket, windowMs, accountMax, ipMax }) => {
  const accountLimiter = rateLimit({
    windowMs,
    limit: accountMax,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    requestPropertyName: 'rateLimit',
    keyGenerator: (req) => {
      const ipKey = req.ip ? normalizeClientIpKey(req) : 'unknown-client';
      const rawUsername = req.body && typeof req.body.username === 'string' ? req.body.username.trim().toLowerCase() : '';
      const accountHash = rawUsername ? hashIdentifier(rawUsername) : 'missing-username';
      // Also call ipKeyGenerator directly when req.ip is present to satisfy ERL IPv6 static validation
      const resolvedIp = typeof req.ip === 'string' && net.isIP(req.ip) ? ipKeyGenerator(req.ip) : ipKey;
      return `login-acct:${bucket}:${resolvedIp}:${accountHash}`;
    },
    handler: createRateLimitResponseHandler(
      'Too many failed login attempts for this account. Please wait and try again later.'
    ),
  });

  const ipBurstLimiter = rateLimit({
    windowMs,
    limit: ipMax,
    skipSuccessfulRequests: true,
    standardHeaders: false,
    legacyHeaders: false,
    requestPropertyName: 'rateLimitIp',
    keyGenerator: (req) => {
      const resolvedIp = typeof req.ip === 'string' && net.isIP(req.ip) ? ipKeyGenerator(req.ip) : normalizeClientIpKey(req);
      return `login-ip:${bucket}:${resolvedIp}`;
    },
    handler: createRateLimitResponseHandler(
      'Too many failed login attempts from this network. Please wait and try again later.'
    ),
  });

  if (accountLimiter.store) activeStores.push(accountLimiter.store);
  if (ipBurstLimiter.store) activeStores.push(ipBurstLimiter.store);

  return [accountLimiter, ipBurstLimiter];
};

/**
 * Build (or return cached) rate limiters configured from environment variables.
 */
const getRateLimiters = () => {
  if (cachedRateLimiters) {
    return cachedRateLimiters;
  }

  activeStores = [];

  const apiWindowMs = parsePositiveInt(
    process.env.API_RATE_LIMIT_WINDOW_MS,
    DEFAULT_API_WINDOW_MS,
    'API_RATE_LIMIT_WINDOW_MS'
  ).value || DEFAULT_API_WINDOW_MS;

  const apiMax = parsePositiveInt(
    process.env.API_RATE_LIMIT_MAX,
    DEFAULT_API_MAX,
    'API_RATE_LIMIT_MAX'
  ).value || DEFAULT_API_MAX;

  const loginWindowMs = parsePositiveInt(
    process.env.LOGIN_RATE_LIMIT_WINDOW_MS,
    DEFAULT_LOGIN_WINDOW_MS,
    'LOGIN_RATE_LIMIT_WINDOW_MS'
  ).value || DEFAULT_LOGIN_WINDOW_MS;

  const loginMax = parsePositiveInt(
    process.env.LOGIN_RATE_LIMIT_MAX,
    DEFAULT_LOGIN_MAX,
    'LOGIN_RATE_LIMIT_MAX'
  ).value || DEFAULT_LOGIN_MAX;

  const loginIpMax = parsePositiveInt(
    process.env.LOGIN_IP_RATE_LIMIT_MAX,
    DEFAULT_LOGIN_IP_MAX,
    'LOGIN_IP_RATE_LIMIT_MAX'
  ).value || DEFAULT_LOGIN_IP_MAX;

  const googleWindowMs = parsePositiveInt(
    process.env.GOOGLE_AUTH_RATE_LIMIT_WINDOW_MS,
    DEFAULT_GOOGLE_AUTH_WINDOW_MS,
    'GOOGLE_AUTH_RATE_LIMIT_WINDOW_MS'
  ).value || DEFAULT_GOOGLE_AUTH_WINDOW_MS;

  const googleMax = parsePositiveInt(
    process.env.GOOGLE_AUTH_RATE_LIMIT_MAX,
    DEFAULT_GOOGLE_AUTH_MAX,
    'GOOGLE_AUTH_RATE_LIMIT_MAX'
  ).value || DEFAULT_GOOGLE_AUTH_MAX;

  const generalApiLimiter = rateLimit({
    windowMs: apiWindowMs,
    limit: apiMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.path === '/health' || req.originalUrl === '/api/health',
    keyGenerator: (req) => {
      const resolvedIp = typeof req.ip === 'string' && net.isIP(req.ip) ? ipKeyGenerator(req.ip) : normalizeClientIpKey(req);
      return `api:${resolvedIp}`;
    },
    handler: createRateLimitResponseHandler(
      'Too many requests from this network. Please wait briefly before retrying.'
    ),
  });

  if (generalApiLimiter.store) activeStores.push(generalApiLimiter.store);

  const adminLoginLimiters = createCredentialLimiterPair({
    bucket: 'admin',
    windowMs: loginWindowMs,
    accountMax: loginMax,
    ipMax: loginIpMax,
  });

  const volunteerLoginLimiters = createCredentialLimiterPair({
    bucket: 'volunteer',
    windowMs: loginWindowMs,
    accountMax: loginMax,
    ipMax: loginIpMax,
  });

  const googleAuthLimiter = rateLimit({
    windowMs: googleWindowMs,
    limit: googleMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const resolvedIp = typeof req.ip === 'string' && net.isIP(req.ip) ? ipKeyGenerator(req.ip) : normalizeClientIpKey(req);
      return `google-auth:${resolvedIp}`;
    },
    handler: createRateLimitResponseHandler(
      'Too many Google sign-in requests from this network. Please wait and try again shortly.'
    ),
  });

  if (googleAuthLimiter.store) activeStores.push(googleAuthLimiter.store);

  cachedRateLimiters = {
    generalApiLimiter,
    adminLoginLimiters,
    volunteerLoginLimiters,
    googleAuthLimiter,
  };

  return cachedRateLimiters;
};

/**
 * Reset in-memory rate-limit counters cleanly (used for isolated automated testing).
 */
const resetRateLimiters = async () => {
  for (const store of activeStores) {
    if (store && typeof store.resetAll === 'function') {
      await store.resetAll();
    }
  }
};

module.exports = {
  isProductionEnv,
  parsePositiveInt,
  parseJsonBodyLimit,
  parseCorsOrigins,
  resolveTrustProxySetting,
  validateStartupEnv,
  createHelmetMiddleware,
  createCorsMiddleware,
  getRateLimiters,
  resetRateLimiters,
};

