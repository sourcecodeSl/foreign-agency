/** Error carrying an HTTP status, thrown from controllers and services. */
class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

/** Wraps an async handler so rejected promises reach the error handler. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function notFound(req, res, next) {
  next(new ApiError(404, 'Route ' + req.method + ' ' + req.originalUrl + ' does not exist.'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;

  if (status >= 500) console.error('[api] ' + req.method + ' ' + req.originalUrl, err);

  res.status(status).json({
    success: false,
    message: status >= 500 ? 'Something went wrong on our side.' : err.message,
    errors: err.errors,
  });
}

module.exports = { ApiError, asyncHandler, notFound, errorHandler };
