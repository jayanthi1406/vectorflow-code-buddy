/**
 * Centralized 404 and Error-Handling Middleware
 *
 * Enforces consistent JSON API error contracts across the Express 5 pipeline
 * without leaking stack traces, secrets, credentials, or internal DB details.
 */

const buildErrorResponse = (code, message) => ({
  success: false,
  code,
  message,
});

/**
 * Catch-all 404 middleware for unmatched API and non-API routes.
 * Must be registered after all application and health routes.
 */
const notFoundHandler = (req, res) => {
  return res.status(404).json(
    buildErrorResponse('ROUTE_NOT_FOUND', 'The requested route was not found.')
  );
};

/**
 * Centralized Express 5 four-argument error-handling middleware.
 * Must be registered as the final middleware in backend/server.js.
 */
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (!err || typeof err !== 'object') {
    console.error(`[ErrorHandler] ${req.method} ${req.originalUrl} -> Non-object error thrown`);
    return res.status(500).json(
      buildErrorResponse('INTERNAL_SERVER_ERROR', 'An unexpected internal error occurred.')
    );
  }

  // 1. Disallowed CORS browser origin
  if (err.code === 'CORS_ORIGIN_NOT_ALLOWED' || err.isCorsError) {
    return res.status(403).json(
      buildErrorResponse('CORS_ORIGIN_NOT_ALLOWED', 'Origin is not allowed by CORS policy.')
    );
  }

  // 2. Request body exceeds configured size limit (Express/raw-body PayloadTooLargeError)
  if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
    return res.status(413).json(
      buildErrorResponse('PAYLOAD_TOO_LARGE', 'Request payload exceeds the maximum allowed size limit.')
    );
  }

  // 3. Malformed JSON request body (Express body-parser SyntaxError)
  if (
    err.type === 'entity.parse.failed' ||
    (err instanceof SyntaxError && (err.status === 400 || err.statusCode === 400) && 'body' in err)
  ) {
    return res.status(400).json(
      buildErrorResponse('INVALID_JSON_BODY', 'Malformed JSON request body.')
    );
  }

  // 4. Explicit operational 4xx errors forwarded via next(err)
  const explicitStatus = Number.isInteger(err.statusCode) ? err.statusCode : err.status;
  if (Number.isInteger(explicitStatus) && explicitStatus >= 400 && explicitStatus < 500) {
    const code =
      typeof err.code === 'string' && err.code.trim() !== ''
        ? err.code.trim()
        : 'BAD_REQUEST';
    const message =
      typeof err.message === 'string' && err.message.trim() !== ''
        ? err.message
        : 'Request could not be processed.';
    return res.status(explicitStatus).json(buildErrorResponse(code, message));
  }

  // 5. Mongoose schema ValidationError -> 400 VALIDATION_ERROR
  if (err.name === 'ValidationError' && err.errors && typeof err.errors === 'object') {
    const fieldMessages = Object.values(err.errors)
      .map((item) => (item && typeof item.message === 'string' ? item.message : null))
      .filter(Boolean);
    const summary =
      fieldMessages.length > 0
        ? fieldMessages.join(' ')
        : 'Request data failed validation.';
    return res.status(400).json(buildErrorResponse('VALIDATION_ERROR', summary));
  }

  // 6. Context-aware Mongoose CastError handling
  if (err.name === 'CastError') {
    if (explicitStatus >= 500 || err.isInternalError) {
      console.error(`[ErrorHandler] ${req.method} ${req.originalUrl} -> Internal CastError (${err.path || 'unknown'})`);
      return res.status(500).json(
        buildErrorResponse('INTERNAL_SERVER_ERROR', 'An unexpected internal error occurred.')
      );
    }

    if (err.kind === 'ObjectId' || err.path === '_id') {
      return res.status(400).json(
        buildErrorResponse('INVALID_ID', 'Invalid identifier format.')
      );
    }

    return res.status(400).json(
      buildErrorResponse('INVALID_FIELD_FORMAT', 'Invalid value format provided for request field.')
    );
  }

  // 7. MongoDB duplicate key error (E11000) -> 409 Conflict
  if (err.code === 11000 || (typeof err.message === 'string' && err.message.includes('E11000'))) {
    return res.status(409).json(
      buildErrorResponse('DUPLICATE_RESOURCE', 'A record with the provided unique value already exists.')
    );
  }

  // 8. Unexpected / unhandled server errors (never leak stack traces or secrets)
  console.error(
    `[ErrorHandler] ${req.method} ${req.originalUrl} -> ${err.name || 'Error'}: ${err.message || 'Unhandled server error'}`
  );

  return res.status(500).json(
    buildErrorResponse('INTERNAL_SERVER_ERROR', 'An unexpected internal error occurred.')
  );
};

module.exports = {
  notFoundHandler,
  errorHandler,
};

