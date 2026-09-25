import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader } from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Badge, { STATUS_TONE } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { IconSearch } from '../../components/ui/Icons';
import { candidateApi } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { SourceTag, SubmitSwitch, indexNumbers, isReviewer } from './shared';

// Where a candidate stands in the testing pool.
const POOL = {
  pool: { label: 'In pool', tone: 'gray' },
  testing: { label: 'Testing', tone: 'amber' },
  passed: { label: 'Passed', tone: 'green' },
};

const POOL_FILTERS = [
  { id: 'all', label: 'Everyone' },
  { id: 'pool', label: 'In pool' },
  { id: 'testing', label: 'Testing' },
  { id: 'passed', label: 'Passed' },
];

/**
 * Every candidate across every agency, with where each one stands in the
 * testing pool and which foreign company holds them once they have passed.
 *
 * The by-agency screen stays as it is; this is the master list the admin and
 * coordinators work from.
 */
export default function CandidateList() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { admin } = useAuth();
  // A coordinator (or the Main Admin) submits a passed candidate's profile.
  const reviewer = isReviewer(admin?.roleSlug);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pool, setPool] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 'all' is what the API reads as every agency at once.
      const { data } = await candidateApi.list({ agencyId: 'all', search, poolStatus: pool });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      toast(err.message || 'Could not load the candidate list.', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, pool, toast]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const counts = useMemo(() => {
    const byPool = { all: rows.length, pool: 0, testing: 0, passed: 0 };
    rows.forEach((row) => {
      byPool[row.poolStatus] = (byPool[row.poolStatus] || 0) + 1;
    });
    return byPool;
  }, [rows]);

  const columns = [
    {
      key: 'name',
      header: 'Candidate',
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">
            Passport {row.passportNo}
            {row.nicNo ? ' · NIC ' + row.nicNo : ''}
          </p>
          {(row.jobRoles?.length || row.jobRole || row.testIndexNo) && (
            <p className="text-xs text-gray-500">
              {row.jobRoles?.length
                ? row.jobRoles.map((role) => role.name).join(', ')
                : row.jobRole || 'No job category'}
              {row.testIndexNo ? ' · Test index ' + row.testIndexNo : ''}
            </p>
          )}
          {indexNumbers(row).length > 0 && (
            <p className="text-xs text-gray-500">Index {indexNumbers(row).join(', ')}</p>
          )}
        </div>
      ),
    },
    {
      key: 'agencyName',
      header: 'Agency',
      render: (row) => (
        <div className="space-y-1">
          <p className="text-gray-900">{row.agencyName || '—'}</p>
          <p className="text-xs text-gray-500">{row.agencyId}</p>
          {/* The agency, or a coordinator filing on its behalf. */}
          <SourceTag registeredBy={row.registeredBy} />
        </div>
      ),
    },
    {
      key: 'documents',
      header: 'Documents',
      className: 'text-center',
      render: (row) => {
        const done = 8 - (row.missingDocuments?.length ?? 8);
        return (
          <span
            className={
              'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ' +
              (done === 8 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')
            }
          >
            {done} / 8
          </span>
        );
      },
    },
    {
      key: 'poolStatus',
      header: 'Testing',
      render: (row) => {
        const state = row.blocked
          ? { label: 'Blocked', tone: 'red' }
          : POOL[row.poolStatus] || POOL.pool;
        const test = row.latestTest;

        return (
          <div className="max-w-[15rem] space-y-1 whitespace-normal">
            <Badge tone={state.tone} dot>
              {state.label}
            </Badge>
            {row.blocked && (
              <p className="text-xs font-medium text-red-700">
                Passed with {row.blockedBy || 'another agency'}
              </p>
            )}
            {row.lockedCompany && (
              <p className="text-xs font-medium text-emerald-700">
                Locked to {row.lockedCompany.name}
              </p>
            )}
            {test && (
              <p className="text-xs text-gray-500">
                {test.testNo} · {test.jobRole} · {test.companyName}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'File',
      render: (row) => (
        <Badge tone={STATUS_TONE[row.status] || 'gray'} dot>
          {row.status}
        </Badge>
      ),
    },
    // Opens once a passed candidate's documents are all in.
    ...(reviewer
      ? [
          {
            key: 'submitted',
            header: 'Submitted',
            render: (row) => <SubmitSwitch candidate={row} onChanged={load} />,
          },
        ]
      : []),
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (row) => (
        <Button size="sm" variant="secondary" onClick={() => navigate('/candidates/' + row.id)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Candidate List"
          subtitle="Every candidate registered across all agencies, and where each one stands."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <select
                id="pool-filter"
                value={pool}
                onChange={(e) => setPool(e.target.value)}
                aria-label="Pool status"
                className="rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-700
                           focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
              >
                {POOL_FILTERS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>

              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="candidate-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, passport, NIC or test index"
                  aria-label="Search candidates"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm
                             placeholder:text-gray-400 focus:border-primary-500 focus:outline-none
                             focus:ring-4 focus:ring-primary-100 sm:w-64"
                />
              </div>
            </div>
          }
        />

        <Table columns={columns} rows={rows} loading={loading} empty="No candidates match this view." />

        <div className="border-t border-gray-200 px-5 py-3 text-sm text-gray-500">
          Showing <span className="font-medium text-gray-900">{rows.length}</span> candidate
          {rows.length === 1 ? '' : 's'} · <span className="font-medium text-gray-900">{counts.passed}</span>{' '}
          passed · <span className="font-medium text-gray-900">{counts.testing}</span> testing
        </div>
      </Card>
    </div>
  );
}
