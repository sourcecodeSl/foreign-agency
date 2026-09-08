const jwt = require('jsonwebtoken');
const { ApiError } = require('./errorHandler');

/**
 * Reads the bearer token, verifies it and attaches the admin to req.user.
 * Downstream handlers can then rely on req.user.roleSlug / req.user.permissions.
 */
module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.token;

  if (!token) {
    return next(new ApiError(401, 'Authentication required.'));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.user = payload;
    return next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Session expired. Sign in again.' : 'Invalid session token.';
    return next(new ApiError(401, message));
  }
};
