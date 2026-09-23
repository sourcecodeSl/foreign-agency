/**
 * Pages the Main Admin can open to a coordinator, keyed as the API keys them.
 *
 * The server (App\Support\PageAccess) is what actually enforces these; this
 * only decides what a coordinator's menu shows and where they land.
 */
export const COORDINATOR = 'coordinator';

// In menu order - a coordinator lands on the first one opened to them.
export const PAGE_PATHS = {
  dashboard: '/dashboard',
  agencies: '/agencies',
  'agencies.create': '/agencies/create',
  candidates: '/candidates',
  companies: '/companies/candidates',
  agreements: '/agreements',
  verification: '/verification/emails',
};

/**
 * Whether the signed-in account may open a page. Only a coordinator is held
 * to it; `page` is null for screens that are never opened to one.
 */
export function canOpen(account, page) {
  if (account?.roleSlug !== COORDINATOR) return true;
  return Boolean(page) && (account.pages || []).includes(page);
}

/**
 * What the signed-in account is called on screen. A foreign company's owner
 * reads as the company it is, not as an agency owner.
 */
export function roleLabel(account) {
  if (account?.agency?.type === 'foreign') return 'Foreign Company';

  return account?.role || null;
}

/** Where a coordinator lands: the first page opened to them, if any. */
export function coordinatorHome(pages) {
  const first = Object.keys(PAGE_PATHS).find((key) => (pages || []).includes(key));
  return first ? PAGE_PATHS[first] : '/no-access';
}
