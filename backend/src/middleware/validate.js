const { validationResult } = require('express-validator');

/**
 * Turns express-validator failures into the shape the React forms expect:
 * { success: false, message, errors: { field: message } }
 */
module.exports = function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = {};
  for (const err of result.array()) {
    if (!errors[err.path]) errors[err.path] = err.msg;
  }

  return res.status(422).json({
    success: false,
    message: 'Please correct the highlighted fields.',
    errors,
  });
};
