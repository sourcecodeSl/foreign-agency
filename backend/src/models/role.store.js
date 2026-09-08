/**
 * Roles (user types) and the permission matrix that drives requirePermission().
 * Matrix shape: { [moduleKey]: { view, create, edit, delete } }
 */
const MODULES = ['agencies', 'users', 'roles', 'reports', 'billing', 'settings'];
const ACTIONS = ['view', 'create', 'edit', 'delete'];

let roles = [
  { id: 'RL-01', name: 'Main Admin', slug: 'main_admin', description: 'Full system control including agency creation and permissions.', system: true },
  { id: 'RL-02', name: 'Agency Owner', slug: 'agency_owner', description: 'Manages a single agency, its staff and its data.', system: false },
  { id: 'RL-03', name: 'Agency Manager', slug: 'agency_manager', description: 'Day-to-day operations inside an agency, no billing access.', system: false },
  { id: 'RL-04', name: 'Agent', slug: 'agent', description: 'Handles assigned records only.', system: false },
  { id: 'RL-05', name: 'Auditor', slug: 'auditor', description: 'Read-only access across all agencies for compliance review.', system: false },
];

const grid = (view, create, edit, del) => ({ view, create, edit, delete: del });
const emptyMatrix = () => Object.fromEntries(MODULES.map((m) => [m, grid(false, false, false, false)]));

let permissions = {
  main_admin: Object.fromEntries(MODULES.map((m) => [m, grid(true, true, true, true)])),
  agency_owner: {
    agencies: grid(true, false, true, false),
    users: grid(true, true, true, false),
    roles: grid(true, false, false, false),
    reports: grid(true, false, false, false),
    billing: grid(true, false, true, false),
    settings: grid(true, false, false, false),
  },
  agency_manager: {
    agencies: grid(true, false, false, false),
    users: grid(true, true, false, false),
    roles: grid(false, false, false, false),
    reports: grid(true, false, false, false),
    billing: grid(false, false, false, false),
    settings: grid(false, false, false, false),
  },
  agent: {
    ...emptyMatrix(),
    reports: grid(true, false, false, false),
  },
  auditor: Object.fromEntries(MODULES.map((m) => [m, grid(m !== 'settings', false, false, false)])),
};

let sequence = 5;

module.exports = {
  MODULES,
  ACTIONS,
  emptyMatrix,

  findAll: () => roles,
  findById: (id) => roles.find((r) => r.id === id) || null,
  findBySlug: (slug) => roles.find((r) => r.slug === slug) || null,

  insert(record) {
    sequence += 1;
    const withId = { id: 'RL-' + String(sequence).padStart(2, '0'), system: false, ...record };
    roles = [...roles, withId];
    permissions = { ...permissions, [withId.slug]: emptyMatrix() };
    return withId;
  },

  update(id, patch) {
    let updated = null;
    roles = roles.map((r) => {
      if (r.id !== id) return r;
      updated = { ...r, ...patch };
      return updated;
    });
    return updated;
  },

  remove(id) {
    const role = roles.find((r) => r.id === id);
    if (!role || role.system) return false;
    roles = roles.filter((r) => r.id !== id);
    delete permissions[role.slug];
    return true;
  },

  getPermissions: (slug) => permissions[slug] || null,

  /** Normalises the incoming matrix so unknown keys can never widen access. */
  savePermissions(slug, incoming) {
    const clean = Object.fromEntries(
      MODULES.map((m) => [
        m,
        Object.fromEntries(ACTIONS.map((a) => [a, Boolean(incoming?.[m]?.[a])])),
      ])
    );
    permissions = { ...permissions, [slug]: clean };
    return clean;
  },
};
