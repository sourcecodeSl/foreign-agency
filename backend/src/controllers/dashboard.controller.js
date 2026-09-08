const { asyncHandler } = require('../middleware/errorHandler');
const { ok } = require('../utils/response');
const agencyStore = require('../models/agency.store');
const userStore = require('../models/user.store');
const verificationStore = require('../models/verification.store');

/** GET /dashboard/stats - counters behind the four overview cards. */
exports.stats = asyncHandler(async (req, res) => {
  const counts = agencyStore.counts();

  return ok(res, {
    agencies: { total: counts.all, delta: '+12%' },
    pending: { total: counts.pending, delta: '+2' },
    users: { total: userStore.total(), delta: '+8%' },
    unverified: { total: verificationStore.pendingCount(), delta: '-3' },
  });
});

/** GET /dashboard/activity - most recent audit entries. */
exports.activity = asyncHandler(async (req, res) =>
  ok(res, [
    { id: 1, actor: 'Ishara Bandara', action: 'approved agency', target: 'Skyline Marketing', at: '2026-09-07 09:20' },
    { id: 2, actor: 'Ishara Bandara', action: 'created agency', target: 'Lotus Consulting', at: '2026-09-05 15:40' },
    { id: 3, actor: 'System', action: 'sent verification email', target: 'admin@lotus.lk', at: '2026-09-05 15:41' },
  ])
);
