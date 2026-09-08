const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { ok, created } = require('../utils/response');
const { slugify } = require('../utils/credentials');
const roleStore = require('../models/role.store');
const userModel = require('../models/user.model');

/** GET /roles - user types, each with a live user count. */
exports.list = asyncHandler(async (req, res) => {
  const roles = await Promise.all(
    roleStore.findAll().map(async (role) => ({
      ...role,
      users: await userModel.countByRole(role.slug),
    }))
  );
  return ok(res, roles);
});

/** POST /roles */
exports.create = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const slug = slugify(name);

  if (roleStore.findBySlug(slug)) {
    throw new ApiError(409, 'A role with that name already exists.', { name: 'A role with that name already exists.' });
  }

  // New roles start with an empty matrix - permissions are granted explicitly.
  const role = roleStore.insert({ name, slug, description });
  return created(res, { ...role, users: 0 }, 'Role created.');
});

/** PUT /roles/:id */
exports.update = asyncHandler(async (req, res) => {
  const role = roleStore.findById(req.params.id);
  if (!role) throw new ApiError(404, 'Role not found.');
  if (role.system) throw new ApiError(400, 'System roles cannot be edited.');

  const updated = roleStore.update(req.params.id, {
    name: req.body.name ?? role.name,
    description: req.body.description ?? role.description,
  });
  return ok(res, updated, 'Role updated.');
});

/** DELETE /roles/:id - blocked for system roles and roles still in use. */
exports.remove = asyncHandler(async (req, res) => {
  const role = roleStore.findById(req.params.id);
  if (!role) throw new ApiError(404, 'Role not found.');
  if (role.system) throw new ApiError(400, 'System roles cannot be deleted.');

  const inUse = await userModel.countByRole(role.slug);
  if (inUse > 0) {
    throw new ApiError(409, 'Reassign the ' + inUse + ' user(s) on this role before deleting it.');
  }

  roleStore.remove(role.id);
  return ok(res, { id: role.id }, 'Role deleted.');
});

/** GET /roles/:slug/permissions - the matrix rendered by the toggles UI. */
exports.getPermissions = asyncHandler(async (req, res) => {
  const role = roleStore.findBySlug(req.params.slug);
  if (!role) throw new ApiError(404, 'Role not found.');

  return ok(res, roleStore.getPermissions(role.slug) || roleStore.emptyMatrix());
});

/** PUT /roles/:slug/permissions - saves the whole matrix in one request. */
exports.savePermissions = asyncHandler(async (req, res) => {
  const role = roleStore.findBySlug(req.params.slug);
  if (!role) throw new ApiError(404, 'Role not found.');
  if (role.slug === 'main_admin') {
    throw new ApiError(400, 'The Main Admin role always holds full access.');
  }

  const saved = roleStore.savePermissions(role.slug, req.body.permissions);
  return ok(res, saved, 'Permissions updated for ' + role.name + '.');
});
