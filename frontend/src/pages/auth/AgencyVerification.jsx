import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Tabs from '../../components/ui/Tabs';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { IconSearch, IconCheck, IconMail, IconPhone } from '../../components/ui/Icons';
import { verificationApi } from '../../lib/api';

// Re-read while the page is open, so an agency signing in shows up without a reload.
export const REFRESH_MS = 30000;

const STATES = {
  verified: { label: 'Verified', tone: 'green' },
  partial: { label: 'Partly verified', tone: 'amber' },
  not_signed_in: { label: 'Not signed in yet', tone: 'gray' },
  awaiting_approval: { label: 'Awaiting approval', tone: 'amber' },
  deactivated: { label: 'Deactivated', tone: 'red' },
  no_login: { label: 'No login', tone: 'red' },
};

// Everything that still needs someone to act. Deactivated agencies are
// switched off on purpose, so they are not counted as outstanding.
const OUTSTANDING = ['not_signed_in', 'partial', 'awaiting_approval', 'no_login'];

const TABS = [
  { id: 'all', label: 'All Agencies' },
  { id: 'not_signed_in', label: 'Not Signed In' },
  { id: 'partial', label: 'Partly Verified' },
  { id: 'awaiting_approval', label: 'Awaiting Approval' },
  { id: 'verified', label: 'Verified' },
];

// The four things that have to happen before an agency is fully set up.
const STEPS = [
  ['approved', 'Approved'],
  ['phoneVerifiedAt', 'Phone'],
  ['emailVerifiedAt', 'Email'],
  ['signedInAt', 'Signed in'],
];

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StepList({ steps }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {STEPS.map(([key, label]) => {
        const value = steps?.[key];
        const done = Boolean(value);
        const when = typeof value === 'string' ? ' ' + formatDate(value) : '';

        return (
          <li
            key={key}
            title={done ? label + when : label + ': not yet'}
            className={
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ' +
              (done
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                : 'bg-gray-50 text-gray-400 ring-gray-200')
            }
          >
            {done ? (
              <IconCheck className="h-3 w-3" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            )}
            {label}
            <span className="sr-only">{done ? '(done)' : '(not done)'}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * For every agency: has its owner signed in and confirmed the phone and
 * email, and what is still left. Read from the login itself, so it reflects
 * what actually happened.
 */
export default function AgencyVerification() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  /** `silent` is a background refresh: no spinner, and no toast if it fails. */
  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const { data } = await verificationApi.agencies();
        setRows(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!silent) toast(err.message || 'Could not load agency verification.', 'error');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load({ silent: true });
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const counts = useMemo(() => {
    const byState = { all: rows.length };
    rows.forEach((row) => {
      byState[row.state] = (byState[row.state] || 0) + 1;
    });
    return byState;
  }, [rows]);

  const outstanding = rows.filter((row) => OUTSTANDING.includes(row.state)).length;

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (tab === 'all' || row.state === tab) &&
        (!term ||
          [row.name, row.code, row.owner?.email, row.owner?.username]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(term)))
    );
  }, [rows, tab, search]);

  const columns = [
    {
      key: 'name',
      header: 'Agency',
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">
            {row.code}
            {row.owner?.username ? ' · ' + row.owner.username : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Owner Contact',
      render: (row) =>
        row.owner ? (
          <div className="space-y-0.5 text-xs text-gray-600">
            <p className="text-sm text-gray-900">{row.owner.name}</p>
            <p className="flex items-center gap-1.5">
              <IconMail className="h-3.5 w-3.5 text-gray-400" />
              {row.owner.email}
            </p>
            <p className="flex items-center gap-1.5">
              <IconPhone className="h-3.5 w-3.5 text-gray-400" />
              {row.owner.phone}
            </p>
          </div>
        ) : (
          <span className="text-xs text-red-600">No owner login</span>
        ),
    },
    {
      key: 'steps',
      header: 'Progress',
      render: (row) => <StepList steps={row.steps} />,
    },
    {
      key: 'signedInAt',
      header: 'Last Sign-in',
      render: (row) =>
        row.steps?.signedInAt ? (
          <span className="text-gray-700">{formatDate(row.steps.signedInAt)}</span>
        ) : (
          <span className="text-gray-400">Never</span>
        ),
    },
    {
      key: 'state',
      header: 'Status',
      render: (row) => {
        const state = STATES[row.state] || { label: row.state, tone: 'gray' };
        return (
          <div className="max-w-[16rem] whitespace-normal">
            <Badge tone={state.tone} dot>
              {state.label}
            </Badge>
            {row.pending?.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-gray-500">
                {row.pending.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            )}
          </div>
        );
      },
    },
  ];

  const tabsWithCounts = TABS.map((t) => ({ ...t, count: counts[t.id] || 0 }));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Agencies', rows.length, 'text-gray-900'],
          ['Fully verified', counts.verified || 0, 'text-emerald-600'],
          ['Still to verify', outstanding, 'text-amber-600'],
        ].map(([label, value, tone]) => (
          <Card key={label}>
            <div className="p-5">
              <p className="text-sm text-gray-500">{label}</p>
              <p className={'mt-1 text-2xl font-bold ' + tone}>{loading ? '—' : value}</p>
            </div>
          </Card>
        ))}
      </div>

      <section aria-label="Agency sign-in verification">
        <Card>
          <CardHeader
            title="Agency Sign-in Verification"
            subtitle="Whether each agency has signed in and confirmed its phone and email - and what is still left."
            action={
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search agency or email"
                  aria-label="Search agencies"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm
                             placeholder:text-gray-400 focus:border-primary-500 focus:outline-none
                             focus:ring-4 focus:ring-primary-100 sm:w-64"
                />
              </div>
            }
          />
          <Tabs tabs={tabsWithCounts} active={tab} onChange={setTab} />
          <Table columns={columns} rows={visible} loading={loading} empty="No agencies found." />
        </Card>
      </section>
    </>
  );
}
