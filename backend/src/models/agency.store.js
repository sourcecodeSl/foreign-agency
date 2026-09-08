/**
 * In-memory stand-in for the agencies table.
 * Replace each method body with a real query (Mongoose / Prisma / Knex) -
 * the controller signatures stay the same.
 */
let sequence = 1047;

let agencies = [
  { id: 'AG-1041', name: 'Skyline Marketing', code: 'SKY-1041', address: '221B Baker Street, Colombo 03', username: 'skyline.admin', passwordHash: null, contact: 'Nadia Perera', email: 'ops@skyline.lk', users: 14, status: 'active', createdAt: '2026-08-12' },
  { id: 'AG-1042', name: 'BlueWave Media', code: 'BLW-1042', address: '17 Marine Drive, Galle', username: 'bluewave.admin', passwordHash: null, contact: 'Rehan Silva', email: 'hello@bluewave.lk', users: 8, status: 'pending', createdAt: '2026-09-01' },
  { id: 'AG-1043', name: 'Northstar Travels', code: 'NST-1043', address: '5 Hill Street, Kandy', username: 'northstar.admin', passwordHash: null, contact: 'Ayesha Fernando', email: 'desk@northstar.lk', users: 22, status: 'active', createdAt: '2026-07-28' },
  { id: 'AG-1044', name: 'Orchid Recruiters', code: 'ORC-1044', address: '90 Union Place, Colombo 02', username: 'orchid.admin', passwordHash: null, contact: 'Dilan Jayasuriya', email: 'info@orchid.lk', users: 3, status: 'deactivated', createdAt: '2026-05-19' },
];

/** Never leak the password hash to the client. */
const publicView = ({ passwordHash, ...rest }) => rest;

module.exports = {
  nextSequence: () => (sequence += 1),

  findAll({ status = 'all', search = '' } = {}) {
    const term = search.trim().toLowerCase();
    return agencies
      .filter((a) => status === 'all' || a.status === status)
      .filter(
        (a) =>
          !term ||
          a.name.toLowerCase().includes(term) ||
          a.username.toLowerCase().includes(term) ||
          a.code.toLowerCase().includes(term)
      )
      .map(publicView);
  },

  findById: (id) => {
    const found = agencies.find((a) => a.id === id);
    return found ? publicView(found) : null;
  },

  findByUsername: (username) => agencies.find((a) => a.username === username) || null,

  counts: () => ({
    all: agencies.length,
    pending: agencies.filter((a) => a.status === 'pending').length,
    active: agencies.filter((a) => a.status === 'active').length,
    deactivated: agencies.filter((a) => a.status === 'deactivated').length,
  }),

  insert(record) {
    agencies = [record, ...agencies];
    return publicView(record);
  },

  update(id, patch) {
    let updated = null;
    agencies = agencies.map((a) => {
      if (a.id !== id) return a;
      updated = { ...a, ...patch };
      return updated;
    });
    return updated ? publicView(updated) : null;
  },

  remove(id) {
    const before = agencies.length;
    agencies = agencies.filter((a) => a.id !== id);
    return agencies.length < before;
  },
};
