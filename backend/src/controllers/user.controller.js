const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { ok, created } = require('../utils/response');
const { generatePassword } = require('../utils/credentials');
const userModel = require('../models/user.model');
const roleStore = require('../models/role.store');

/** GET /users?role=&status=&search= */
exports.list = asyncHandler(async (req, res) => {
  const { role = 'all', status = 'all', search = '' } = req.query;
  return ok(res, await userModel.findAll({ role, status, search }));
});

/** GET /users/:id */
exports.getById = asyncHandler(async (req, res) => {
  const user = await userModel.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found.');
  return ok(res, user);
});

/** POST /users */
exports.create = asyncHandler(async (req, res) => {
  const { name, email, phone, roleSlug, agency } = req.body;

  const role = roleStore.findBySlug(roleSlug);
  if (!role) throw new ApiError(422, 'Unknown user type.', { roleSlug: 'Unknown user type.' });

  if (await userModel.emailExists(email)) {
    throw new ApiError(409, 'That email is already registered.', { email: 'That email is already registered.' });
  }

  const tempPassword = generatePassword();
  const saved = await userModel.create({
    name,
    email,
    phone,
    password: tempPassword,
    roleSlug,
    agency: agency || null,
    status: 'pending',
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

  const updated = await userModel.update(req.params.id, patch);
  if (!updated) throw new ApiError(404, 'User not found.');
  return ok(res, updated, 'User updated.');
});

/** PATCH /users/:id/status */
exports.updateStatus = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user.sub)) {
    throw new ApiError(400, 'You cannot change the status of your own account.');
  }
  const updated = await userModel.update(req.params.id, { status: req.body.status });
  if (!updated) throw new ApiError(404, 'User not found.');
  return ok(res, updated, updated.name + ' is now ' + req.body.status + '.');
});

/** DELETE /users/:id */
exports.remove = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user.sub)) {
    throw new ApiError(400, 'You cannot delete your own account.');
  }
  if (!(await userModel.remove(req.params.id))) throw new ApiError(404, 'User not found.');
  return ok(res, { id: req.params.id }, 'User removed.');
});
