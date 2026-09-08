/** In-memory stand-in for the users table. */
let users = [
  { id: 'US-2001', name: 'Ishara Bandara', email: 'visaltheekshana555@gmail.com', phone: '0781311850', roleSlug: 'main_admin', role: 'Main Admin', agency: null, status: 'active', lastLogin: '2026-09-07 09:12', passwordHash: null },
  { id: 'US-2002', name: 'Nadia Perera', email: 'nadia@skyline.lk', phone: '+94719982210', roleSlug: 'agency_owner', role: 'Agency Owner', agency: 'Skyline Marketing', status: 'active', lastLogin: '2026-09-06 17:45', passwordHash: null },
  { id: 'US-2003', name: 'Rehan Silva', email: 'rehan@bluewave.lk', phone: '+94764451188', roleSlug: 'agency_owner', role: 'Agency Owner', agency: 'BlueWave Media', status: 'pending', lastLogin: null, passwordHash: null },
  { id: 'US-2004', name: 'Ayesha Fernando', email: 'ayesha@northstar.lk', phone: '+94702207781', roleSlug: 'agency_manager', role: 'Agency Manager', agency: 'Northstar Travels', status: 'active', lastLogin: '2026-09-07 08:02', passwordHash: null },
  { id: 'US-2005', name: 'Dilan Jayasuriya', email: 'dilan@orchid.lk', phone: '+94776643320', roleSlug: 'agent', role: 'Agent', agency: 'Orchid Recruiters', status: 'deactivated', lastLogin: '2026-05-30 11:20', passwordHash: null },
];

let sequence = 2005;

const publicView = ({ passwordHash, ...rest }) => rest;

module.exports = {
  findAll({ role = 'all', status = 'all', search = '' } = {}) {
    const term = search.trim().toLowerCase();
    return users
      .filter((u) => role === 'all' || u.role === role || u.roleSlug === role)
      .filter((u) => status === 'all' || u.status === status)
      .filter((u) => !term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term))
      .map(publicView);
  },

  findById: (id) => {
    const found = users.find((u) => u.id === id);
    return found ? publicView(found) : null;
  },

  findByUsernameOrEmail: (value) =>
    users.find((u) => u.email === value || u.name.toLowerCase() === String(value).toLowerCase()) || null,

  countByRole: (roleSlug) => users.filter((u) => u.roleSlug === roleSlug).length,

  insert(record) {
    sequence += 1;
    const withId = { id: 'US-' + sequence, ...record };
    users = [withId, ...users];
    return publicView(withId);
  },

  update(id, patch) {
    let updated = null;
    users = users.map((u) => {
      if (u.id !== id) return u;
      updated = { ...u, ...patch };
      return updated;
    });
    return updated ? publicView(updated) : null;
  },

  remove(id) {
    const before = users.length;
    users = users.filter((u) => u.id !== id);
    return users.length < before;
  },

  total: () => users.length,
};
