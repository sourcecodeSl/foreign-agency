// Seed data used by the mock API adapter (src/lib/api.js) so the UI runs
// before the Express backend is wired up.

export const MOCK_AGENCIES = [
  { id: 'AG-1041', name: 'Skyline Marketing', code: 'SKY-1041', address: '221B Baker Street, Colombo 03', username: 'skyline.admin', contact: 'Nadia Perera', email: 'ops@skyline.lk', users: 14, status: 'active', createdAt: '2026-08-12' },
  { id: 'AG-1042', name: 'BlueWave Media', code: 'BLW-1042', address: '17 Marine Drive, Galle', username: 'bluewave.admin', contact: 'Rehan Silva', email: 'hello@bluewave.lk', users: 8, status: 'pending', createdAt: '2026-09-01' },
  { id: 'AG-1043', name: 'Northstar Travels', code: 'NST-1043', address: '5 Hill Street, Kandy', username: 'northstar.admin', contact: 'Ayesha Fernando', email: 'desk@northstar.lk', users: 22, status: 'active', createdAt: '2026-07-28' },
  { id: 'AG-1044', name: 'Orchid Recruiters', code: 'ORC-1044', address: '90 Union Place, Colombo 02', username: 'orchid.admin', contact: 'Dilan Jayasuriya', email: 'info@orchid.lk', users: 3, status: 'deactivated', createdAt: '2026-05-19' },
  { id: 'AG-1045', name: 'Vertex Logistics', code: 'VTX-1045', address: '12 Port Access Road, Colombo 15', username: 'vertex.admin', contact: 'Priya Kumar', email: 'ops@vertex.lk', users: 31, status: 'active', createdAt: '2026-06-04' },
  { id: 'AG-1046', name: 'Lotus Consulting', code: 'LTS-1046', address: '34 Temple Road, Negombo', username: 'lotus.admin', contact: 'Saman Weerasinghe', email: 'admin@lotus.lk', users: 0, status: 'pending', createdAt: '2026-09-05' },
  { id: 'AG-1047', name: 'Coral Tours', code: 'CRL-1047', address: '8 Beach Road, Trincomalee', username: 'coral.admin', contact: 'Meera Anand', email: 'book@coral.lk', users: 6, status: 'deactivated', createdAt: '2026-04-22' },
];

export const MOCK_ROLES = [
  { id: 'RL-01', name: 'Main Admin', slug: 'main_admin', description: 'Full system control including agency creation and permissions.', users: 2, system: true },
  { id: 'RL-02', name: 'Agency Owner', slug: 'agency_owner', description: 'Manages a single agency, its staff and its data.', users: 18, system: false },
  { id: 'RL-03', name: 'Agency Manager', slug: 'agency_manager', description: 'Day-to-day operations inside an agency, no billing access.', users: 46, system: false },
  { id: 'RL-04', name: 'Agent', slug: 'agent', description: 'Handles assigned records only.', users: 213, system: false },
  { id: 'RL-05', name: 'Auditor', slug: 'auditor', description: 'Read-only access across all agencies for compliance review.', users: 4, system: false },
];

export const MOCK_USERS = [
  { id: 'US-2001', name: 'Ishara Bandara', email: 'admin@example.com', phone: '078 131 1850', role: 'Main Admin', agency: '—', status: 'active', lastLogin: '2026-09-07 09:12' },
  { id: 'US-2002', name: 'Nadia Perera', email: 'nadia@skyline.lk', phone: '+94 71 998 2210', role: 'Agency Owner', agency: 'Skyline Marketing', status: 'active', lastLogin: '2026-09-06 17:45' },
  { id: 'US-2003', name: 'Rehan Silva', email: 'rehan@bluewave.lk', phone: '+94 76 445 1188', role: 'Agency Owner', agency: 'BlueWave Media', status: 'pending', lastLogin: '—' },
  { id: 'US-2004', name: 'Ayesha Fernando', email: 'ayesha@northstar.lk', phone: '+94 70 220 7781', role: 'Agency Manager', agency: 'Northstar Travels', status: 'active', lastLogin: '2026-09-07 08:02' },
  { id: 'US-2005', name: 'Dilan Jayasuriya', email: 'dilan@orchid.lk', phone: '+94 77 664 3320', role: 'Agent', agency: 'Orchid Recruiters', status: 'deactivated', lastLogin: '2026-05-30 11:20' },
  { id: 'US-2006', name: 'Priya Kumar', email: 'priya@vertex.lk', phone: '+94 75 331 9087', role: 'Agency Manager', agency: 'Vertex Logistics', status: 'active', lastLogin: '2026-09-05 14:33' },
  { id: 'US-2007', name: 'Kasun Ratnayake', email: 'kasun@audit.gov', phone: '+94 78 887 1200', role: 'Auditor', agency: 'All agencies', status: 'active', lastLogin: '2026-09-04 10:05' },
];

// Permission matrix: modules x actions, assigned per role.
export const PERMISSION_MODULES = [
  { key: 'agencies', label: 'Agency Management', description: 'Create, approve and deactivate agencies' },
  // Must stay in step with Role::MODULES on the backend. A module missing here
  // is not rendered, so it is absent from what Save sends - and the API rebuilds
  // the whole matrix from that payload, which would silently revoke it.
  { key: 'candidates', label: 'Candidates', description: 'Register candidates and attach their documents' },
  { key: 'users', label: 'User Management', description: 'Manage user accounts across the system' },
  { key: 'roles', label: 'Roles & Permissions', description: 'Define user types and access rights' },
  { key: 'reports', label: 'Reports & Analytics', description: 'View and export system reports' },
  { key: 'billing', label: 'Billing', description: 'Invoices, plans and payment records' },
  { key: 'settings', label: 'System Settings', description: 'Global configuration and integrations' },
];

export const PERMISSION_ACTIONS = [
  { key: 'view', label: 'View' },
  { key: 'create', label: 'Create' },
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
];

const allow = (view, create, edit, del) => ({ view, create, edit, delete: del });

export const MOCK_PERMISSIONS = {
  main_admin: {
    agencies: allow(true, true, true, true),
    candidates: allow(true, true, true, true),
    users: allow(true, true, true, true),
    roles: allow(true, true, true, true),
    reports: allow(true, true, true, true),
    billing: allow(true, true, true, true),
    settings: allow(true, true, true, true),
  },
  agency_owner: {
    agencies: allow(true, false, true, false),
    candidates: allow(true, true, true, true),
    users: allow(true, true, true, false),
    roles: allow(true, false, false, false),
    reports: allow(true, false, false, false),
    billing: allow(true, false, true, false),
    settings: allow(true, false, false, false),
  },
  agency_manager: {
    agencies: allow(true, false, false, false),
    candidates: allow(true, true, true, true),
    users: allow(true, true, false, false),
    roles: allow(false, false, false, false),
    reports: allow(true, false, false, false),
    billing: allow(false, false, false, false),
    settings: allow(false, false, false, false),
  },
  agent: {
    agencies: allow(false, false, false, false),
    candidates: allow(true, true, true, false),
    users: allow(false, false, false, false),
    roles: allow(false, false, false, false),
    reports: allow(true, false, false, false),
    billing: allow(false, false, false, false),
    settings: allow(false, false, false, false),
  },
  auditor: {
    agencies: allow(true, false, false, false),
    candidates: allow(true, false, false, false),
    users: allow(true, false, false, false),
    roles: allow(true, false, false, false),
    reports: allow(true, false, false, false),
    billing: allow(true, false, false, false),
    settings: allow(false, false, false, false),
  },
};

export const MOCK_EMAIL_VERIFICATIONS = [
  { id: 'EV-501', name: 'Rehan Silva', email: 'hello@bluewave.lk', agency: 'BlueWave Media', status: 'unverified', requestedAt: '2026-09-01 10:22', attempts: 2 },
  { id: 'EV-502', name: 'Nadia Perera', email: 'ops@skyline.lk', agency: 'Skyline Marketing', status: 'verified', requestedAt: '2026-08-12 09:04', attempts: 1 },
  { id: 'EV-503', name: 'Saman Weerasinghe', email: 'admin@lotus.lk', agency: 'Lotus Consulting', status: 'unverified', requestedAt: '2026-09-05 15:41', attempts: 1 },
  { id: 'EV-504', name: 'Meera Anand', email: 'book@coral.lk', agency: 'Coral Tours', status: 'bounced', requestedAt: '2026-04-22 12:10', attempts: 4 },
  { id: 'EV-505', name: 'Priya Kumar', email: 'ops@vertex.lk', agency: 'Vertex Logistics', status: 'verified', requestedAt: '2026-06-04 08:55', attempts: 1 },
];
