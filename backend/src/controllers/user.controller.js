const bcrypt = require('bcryptjs');

const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { ok, created } = require('../utils/response');
const { generatePassword } = require('../utils/credentials');
const userStore = require('../models/user.store');
const roleStore = require('../models/role.store');

/** GET /users?role=&status=&search= */
exports.list = asyncHandler(async (req, res) => {
  const { role = 'all', status = 'all', search = '' } = req.query;
  return ok(res, userStore.findAll({ role, status, search }));
});

/** GET /users/:id */
exports.getById = asyncHandler(async (req, res) => {
  const user = userStore.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found.');
  return ok(res, user);
});

/** POST /users */
exports.create = asyncHandler(async (req, res) => {
  const { name, email, phone, roleSlug, agency } = req.body;

  const role = roleStore.findBySlug(roleSlug);
  if (!role) throw new ApiError(422, 'Unknown user type.', { roleSlug: 'Unknown user type.' });

  if (userStore.findByUsernameOrEmail(email)) {
    throw new ApiError(409, 'That email is already registered.', { email: 'That email is already registered.' });
  }

  const tempPassword = generatePassword();
  const saved = userStore.insert({
    name,
    email,
    phone,
    roleSlug,
    role: role.name,
    agency: agency || null,
    status: 'pending',
    lastLogin: null,
    passwordHash: await bcrypt.hash(tempPassword, 10),
  });

  return created(res, { ...saved, credentials: { email, password: tempPassword } }, 'User created.');
});

/** PUT /users/:id */
exports.update = asyncHandler(async (req, res) => {
  const { name, email, phone, roleSlug, agency } = req.body;

  const patch = { name, email, phone, agency };
  if (roleSlug) {
    const role = roleStore.findBySlug(roleSlug);
    if (!role) throw new ApiError(422, 'Unknown user type.');
    patch.roleSlug = roleSlug;
    patch.role = role.name;
  }

  const updated = userStore.update(req.params.id, patch);
  if (!updated) throw new ApiError(404, 'User not found.');
  return ok(res, updated, 'User updated.');
});

/** PATCH /users/:id/status */
exports.updateStatus = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.sub) {
    throw new ApiError(400, 'You cannot change the status of your own account.');
  }
  const updated = userStore.update(req.params.id, { status: req.body.status });
  if (!updated) throw new ApiError(404, 'User not found.');
  return ok(res, updated, updated.name + ' is now ' + req.body.status + '.');
});

/** DELETE /users/:id */
exports.remove = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.sub) throw new ApiError(400, 'You cannot delete your own account.');
  if (!userStore.remove(req.params.id)) throw new ApiError(404, 'User not found.');
  return ok(res, { id: req.params.id }, 'User removed.');
});
