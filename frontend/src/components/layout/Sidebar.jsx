import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  IconDashboard,
  IconBuilding,
  IconUsers,
  IconShield,
  IconX,
  IconMail,
} from '../ui/Icons';

/**
 * Navigation is built from the signed-in role.
 *
 * An agency account exists to register candidates, so it never sees the admin
 * sections - the API refuses them anyway, and showing links that 403 is worse
 * than not showing them.
 */
const ADMIN_NAV = [
  {
    section: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: IconDashboard, end: true }],
  },
  {
    section: 'Agency Management',
    items: [
      { to: '/agencies/create', label: 'Create Agency', icon: IconBuilding },
      { to: '/agencies', label: 'Agency List', icon: IconBuilding, end: true },
    ],
  },
  {
    section: 'Candidates',
    // Read one agency at a time, so the label says so rather than promising
    // a single list of everybody.
    items: [{ to: '/candidates', label: 'Candidates by Agency', icon: IconUsers, end: true }],
  },
  {
    section: 'User Management',
    items: [
      { to: '/users', label: 'Users List', icon: IconUsers, end: true },
      { to: '/users/types', label: 'User Types / Roles', icon: IconShield },
      { to: '/users/permissions', label: 'User Permissions', icon: IconShield },
    ],
  },
  {
    section: 'Verification',
    items: [
      { to: '/verification/emails', label: 'Email Verification', icon: IconMail },
      { to: '/verification/email-delivery', label: 'Email Delivery', icon: IconShield },
    ],
  },
];

const AGENCY_NAV = [
  {
    section: 'Candidates',
    items: [
      { to: '/candidates', label: 'Candidates', icon: IconUsers, end: true },
      { to: '/candidates/register', label: 'Register Candidate', icon: IconUsers },
    ],
  },
];

// Only the owner edits the agency: its phone and email are the owner's sign-in.
const AGENCY_OWNER_NAV = [
  ...AGENCY_NAV,
  {
    section: 'Agency',
    items: [{ to: '/agency/profile', label: 'Agency Details', icon: IconBuilding }],
  },
];

function NavItem({ item, onNavigate }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ' +
        (isActive
          ? 'bg-primary-50 text-primary-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={'h-5 w-5 ' + (isActive ? 'text-primary-600' : 'text-gray-400')} />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ open, onClose }) {
  const { admin } = useAuth();

  const isAgency = admin?.roleSlug && admin.roleSlug !== 'main_admin' && admin.roleSlug !== 'auditor';
  const nav = !isAgency
    ? ADMIN_NAV
    : admin.roleSlug === 'agency_owner'
    ? AGENCY_OWNER_NAV
    : AGENCY_NAV;

  return (
    <>
      {/* Mobile scrim */}
      <div
        onClick={onClose}
        className={
          'fixed inset-0 z-30 bg-gray-900/40 backdrop-blur-sm transition-opacity lg:hidden ' +
          (open ? 'opacity-100' : 'pointer-events-none opacity-0')
        }
        aria-hidden="true"
      />

      <aside
        className={
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white ' +
          'transition-transform duration-200 lg:translate-x-0 ' +
          (open ? 'translate-x-0' : '-translate-x-full')
        }
      >
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white">
              AA
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-gray-900">
                {isAgency ? admin?.agency?.name || 'Agency' : 'Agency Admin'}
              </p>
              <p className="text-xs text-gray-500">
                {isAgency ? 'Candidate Portal' : 'Main Admin System'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden"
            aria-label="Close navigation"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {nav.map((group) => (
            <div key={group.section}>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {group.section}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavItem key={item.to} item={item} onNavigate={onClose} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer card */}
        <div className="border-t border-gray-200 p-3">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-900">Signed in as</p>
            <p className="mt-1 truncate text-xs text-gray-500">
              {admin?.role || 'User'}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
