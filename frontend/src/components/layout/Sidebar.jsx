import { NavLink, useLocation } from 'react-router-dom';
import { useAuth, isGlobalRole } from '../../context/AuthContext';
import { canOpen, roleLabel, COORDINATOR } from '../../lib/access';
import {
  IconDashboard,
  IconBuilding,
  IconUsers,
  IconShield,
  IconX,
  IconMail,
  IconDocument,
} from '../ui/Icons';

/**
 * Navigation is built from the signed-in role.
 *
 * An agency account exists to register candidates, so it never sees the admin
 * sections - the API refuses them anyway, and showing links that 403 is worse
 * than not showing them. A coordinator sees only the pages the Main Admin
 * opened to them, for the same reason: `page` names what an item needs, and
 * an item without one is never shown to a coordinator.
 */
const ADMIN_NAV = [
  {
    section: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: IconDashboard, end: true, page: 'dashboard' }],
  },
  {
    section: 'Candidate Management',
    items: [
      { to: '/candidates/all', label: 'Candidate List', icon: IconUsers, page: 'candidates' },
      // The by-agency screen reads one agency at a time, so its label says so
      // rather than promising a single list of everybody.
      { to: '/candidates', label: 'Candidates by Agency', icon: IconUsers, end: true, page: 'candidates' },
    ],
  },
  {
    section: 'Foreign Agent Management',
    items: [
      { to: '/users/coordinators', label: 'Coordinators & Access', icon: IconShield, mainAdminOnly: true },
      // One listing, opened on one kind of agency. New agencies are added from
      // the button on that page, which is why Create Agency is not a link here.
      { to: '/agencies?type=foreign', label: 'Foreign Company', icon: IconBuilding, page: 'agencies' },
      // Who each foreign company is testing, and where the result is recorded.
      { to: '/companies/candidates', label: 'Company Candidates', icon: IconUsers, page: 'companies' },
      { to: '/agencies?type=local', label: 'Local Agency', icon: IconBuilding, page: 'agencies' },
    ],
  },
  {
    section: 'Agreements',
    items: [
      // The Main Admin, and a coordinator the page is opened to.
      { to: '/agreements', label: 'Employment Agreements', icon: IconDocument, page: 'agreements', adminSideOnly: true },
    ],
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
    items: [{ to: '/verification/emails', label: 'Email Verification', icon: IconMail, page: 'verification' }],
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

// A foreign company registers nobody: local agencies register candidates for
// its test, and it records how each one went.
const COMPANY_NAV = [
  {
    section: 'Candidates',
    items: [{ to: '/candidates', label: 'Candidates', icon: IconUsers, end: true }],
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

// A foreign company is a company, not an agency, to its own owner.
const COMPANY_OWNER_NAV = [
  ...COMPANY_NAV,
  {
    section: 'Company',
    items: [{ to: '/agency/profile', label: 'Company Details', icon: IconBuilding }],
  },
];

// A foreign company uploads, fills and sends its agreements; a local agency
// reads the ones the admin has sent it.
const AGREEMENTS_NAV = [
  {
    section: 'Agreements',
    items: [{ to: '/agreements', label: 'Employment Agreements', icon: IconDocument }],
  },
];

/**
 * The admin menu for whoever is reading it: the Main Admin sees all of it, an
 * auditor all but the coordinator list, and a coordinator only the pages
 * opened to them - with any section left empty dropped.
 */
function adminNavFor(admin) {
  return ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (!item.mainAdminOnly || admin?.roleSlug === 'main_admin') &&
        // The auditor reads the admin side but has no business filling agreements.
        (!item.adminSideOnly || ['main_admin', COORDINATOR].includes(admin?.roleSlug)) &&
        canOpen(admin, item.page)
    ),
  })).filter((group) => group.items.length > 0);
}

function NavItem({ item, onNavigate }) {
  const Icon = item.icon;
  const { pathname, search } = useLocation();

  // A link that carries a filter (?type=foreign) is current only while that
  // filter is the one on screen; NavLink on its own compares the path alone.
  const [path, query] = item.to.split('?');
  const filtered = query ? pathname === path && search === '?' + query : null;

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ' +
        (filtered ?? isActive
          ? 'bg-primary-50 text-primary-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={'h-5 w-5 ' + ((filtered ?? isActive) ? 'text-primary-600' : 'text-gray-400')}
          />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ open, onClose }) {
  const { admin } = useAuth();

  const isAgency = Boolean(admin?.roleSlug) && !isGlobalRole(admin.roleSlug);
  const nav = !isAgency
    ? adminNavFor(admin)
    : [
        ...(admin.agency?.type === 'foreign'
          ? admin.roleSlug === 'agency_owner'
            ? COMPANY_OWNER_NAV
            : COMPANY_NAV
          : admin.roleSlug === 'agency_owner'
            ? AGENCY_OWNER_NAV
            : AGENCY_NAV),
        ...(admin.agency ? AGREEMENTS_NAV : []),
      ];

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
              {isAgency ? 'AA' : 'CA'}
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-gray-900">
                {isAgency ? admin?.agency?.name || 'Agency' : 'Coordinator Admin'}
              </p>
              <p className="text-xs text-gray-500">
                {isAgency
                  ? admin?.agency?.type === 'foreign'
                    ? 'Foreign Company Portal'
                    : 'Candidate Portal'
                  : admin?.roleSlug === COORDINATOR
                  ? 'Coordinator'
                  : 'Main Admin System'}
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
              {roleLabel(admin) || 'User'}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
