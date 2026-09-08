const crypto = require('crypto');

/** Email confirmation requests. */
let records = [
  { id: 'EV-501', name: 'Rehan Silva', email: 'hello@bluewave.lk', agency: 'BlueWave Media', status: 'unverified', requestedAt: '2026-09-01 10:22', attempts: 2, token: 'seed-501' },
  { id: 'EV-502', name: 'Nadia Perera', email: 'ops@skyline.lk', agency: 'Skyline Marketing', status: 'verified', requestedAt: '2026-08-12 09:04', attempts: 1, token: 'seed-502' },
  { id: 'EV-503', name: 'Saman Weerasinghe', email: 'admin@lotus.lk', agency: 'Lotus Consulting', status: 'unverified', requestedAt: '2026-09-05 15:41', attempts: 1, token: 'seed-503' },
  { id: 'EV-504', name: 'Meera Anand', email: 'book@coral.lk', agency: 'Coral Tours', status: 'bounced', requestedAt: '2026-04-22 12:10', attempts: 4, token: 'seed-504' },
];

let sequence = 504;

const publicView = ({ token, ...rest }) => rest;

module.exports = {
  newToken: () => crypto.randomBytes(24).toString('hex'),

  findAll({ status = 'all', search = '' } = {}) {
    const term = search.trim().toLowerCase();
    return records
      .filter((r) => status === 'all' || r.status === status)
      .filter((r) => !term || r.email.toLowerCase().includes(term) || r.name.toLowerCase().includes(term))
      .map(publicView);
  },

  findById: (id) => records.find((r) => r.id === id) || null,
  findByToken: (token) => records.find((r) => r.token === token) || null,

  insert(record) {
    sequence += 1;
    const withId = { id: 'EV-' + sequence, attempts: 1, status: 'unverified', ...record };
    records = [withId, ...records];
    return publicView(withId);
  },

  update(id, patch) {
    let updated = null;
    records = records.map((r) => {
      if (r.id !== id) return r;
      updated = { ...r, ...patch };
      return updated;
    });
    return updated ? publicView(updated) : null;
  },

  pendingCount: () => records.filter((r) => r.status !== 'verified').length,
};
