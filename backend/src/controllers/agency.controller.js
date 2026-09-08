const bcrypt = require('bcryptjs');

const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { ok, created } = require('../utils/response');
const { generatePassword, generateAgencyCode } = require('../utils/credentials');
const agencyStore = require('../models/agency.store');

const loginUrl = () => (process.env.CLIENT_URL || 'http://localhost:5173') + '/agency/login';

/** GET /agencies?status=&search= */
exports.list = asyncHandler(async (req, res) => {
  const { status = 'all', search = '' } = req.query;
  return ok(res, agencyStore.findAll({ status, search }));
});

/** GET /agencies/counts - powers the Pending/Active/Deactivated tab badges. */
exports.counts = asyncHandler(async (req, res) => ok(res, agencyStore.counts()));

/** GET /agencies/:id */
exports.getById = asyncHandler(async (req, res) => {
  const agency = agencyStore.findById(req.params.id);
  if (!agency) throw new ApiError(404, 'Agency not found.');
  return ok(res, agency);
});

/**
 * POST /agencies
 * Creates the agency in `pending` status and returns the credentials once -
 * this is the payload the UI puts behind "Copy Details".
 */
exports.create = asyncHandler(async (req, res) => {
  const { name, address, username, password } = req.body;

  if (agencyStore.findByUsername(username)) {
    throw new ApiError(409, 'That username is already taken.', { username: 'That username is already taken.' });
  }

  const sequence = agencyStore.nextSequence();
  const plainPassword = password || generatePassword();

  const record = {
    id: 'AG-' + sequence,
    name,
    code: generateAgencyCode(name, sequence),
    address,
    username,
    passwordHash: await bcrypt.hash(plainPassword, 10),
    contact: req.body.contact || '-',
    email: req.body.email || '-',
    users: 0,
    status: 'pending',
    createdAt: new Date().toISOString().slice(0, 10),
    createdBy: req.user.sub,
  };

  const saved = agencyStore.insert(record);

  return created(
    res,
    {
      ...saved,
      // Shown to the admin exactly once; only the hash is persisted.
      credentials: { username, password: plainPassword, loginUrl: loginUrl() },
    },
    'Agency created successfully.'
  );
});

/** PUT /agencies/:id */
exports.update = asyncHandler(async (req, res) => {
  const { name, address, contact, email } = req.body;
  const updated = agencyStore.update(req.params.id, { name, address, contact, email });
  if (!updated) throw new ApiError(404, 'Agency not found.');
  return ok(res, updated, 'Agency updated.');
});

/** PATCH /agencies/:id/status - approve, deactivate or reactivate. */
exports.updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const updated = agencyStore.update(req.params.id, {
    status,
    statusChangedAt: new Date().toISOString(),
    statusChangedBy: req.user.sub,
  });
  if (!updated) throw new ApiError(404, 'Agency not found.');

  const verb = { active: 'activated', pending: 'moved back to pending', deactivated: 'deactivated' }[status];
  return ok(res, updated, updated.name + ' has been ' + verb + '.');
});

/** POST /agencies/:id/credentials/reset - issues a fresh password. */
exports.resetCredentials = asyncHandler(async (req, res) => {
  const agency = agencyStore.findById(req.params.id);
  if (!agency) throw new ApiError(404, 'Agency not found.');

  const plainPassword = generatePassword();
  agencyStore.update(agency.id, { passwordHash: await bcrypt.hash(plainPassword, 10) });

  return ok(
    res,
    { username: agency.username, password: plainPassword, loginUrl: loginUrl() },
    'New credentials generated.'
  );
});

/** DELETE /agencies/:id */
exports.remove = asyncHandler(async (req, res) => {
  if (!agencyStore.remove(req.params.id)) throw new ApiError(404, 'Agency not found.');
  return ok(res, { id: req.params.id }, 'Agency deleted.');
});
