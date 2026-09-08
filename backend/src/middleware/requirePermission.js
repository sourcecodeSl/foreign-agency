const { ApiError } = require('./errorHandler');
const roleStore = require('../models/role.store');

/**
 * Route guard for the permission matrix.
 *
 *   router.post('/', requirePermission('agencies', 'create'), handler)
 *
 * Main Admin always passes; every other role is checked against the saved
 * matrix for its slug.
 */
module.exports = function requirePermission(moduleKey, action) {
  return function (req, res, next) {
    const roleSlug = req.user?.roleSlug;

    if (!roleSlug) return next(new ApiError(401, 'Authentication required.'));
    if (roleSlug === 'main_admin') return next();

    const matrix = roleStore.getPermissions(roleSlug) || {};
    const allowed = matrix[moduleKey] && matrix[moduleKey][action];

    if (!allowed) {
      return next(new ApiError(403, 'You do not have permission to ' + action + ' ' + moduleKey + '.'));
    }
    return next();
  };
};
