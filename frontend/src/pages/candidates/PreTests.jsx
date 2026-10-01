import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Tabs from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { IconCheck, IconPlus, IconRefresh, IconSearch, IconX } from '../../components/ui/Icons';
import { useAuth, isGlobalRole } from '../../context/AuthContext';
import { jobRoleApi, preTestApi } from '../../lib/api';
import { alertError, confirmAction, escapeHtml } from '../../lib/alert';
import { PRE_TEST_STATUS, formatDate } from './shared';

const TABS = [
  { id: 'pass', label: 'Eligible for final test' },
  { id: 'pending', label: 'Waiting for result' },
  { id: 'none', label: 'Not tested' },
  { id: 'fail', label: 'Failed' },
  { id: 'all', label: 'All' },
];

/** "Nimal Silva - Tiler (PRE-TL00001)", for the confirmation dialogs. */
const describe = (row) =>
  '<b>' +
  escapeHtml(row.candidate.name) +
  '</b> - ' +
  escapeHtml(row.jobRole.name) +
  (row.latest?.indexNo ? ' (' + escapeHtml(row.latest.indexNo) + ')' : '');

/**
 * The local agency's pre-tests: every candidate and job category, with where
 * its pre-test stands. It is the agency's alone - no company has a part in
 * it. The agency issues the pre-test index number for the category, then
 * marks it passed or failed; the "Eligible" tab is who the agency lets sit
 * the final test. A result given by mistake is rewound. The admin side reads
 * every agency's.
 */
export default function PreTests() {
  const { admin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const adminSide = isGlobalRole(admin?.roleSlug);

  const [tab, setTab] = useState('pass');
  const [roleId, setRoleId] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  // "rowId:action" while that button's request runs.
  const [working, setWorking] = useState(null);

  useEffect(() => {
    jobRoleApi
      .list()
      .then(({ data }) => setRoles(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    preTestApi
      .list({ status: tab, jobRoleId: roleId, search: search.trim() })
      .then(({ data }) => {
        setRows((data?.rows || []).map((row) => ({ ...row, id: row.key })));
        setCounts(data?.counts || {});
      })
      .catch((err) => toast(err.message || 'Could not load the pre-tests.', 'error'))
      .finally(() => setLoading(false));
  }, [tab, roleId, search, toast]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  /** Asks first when `confirm` is given, runs the call, then reads the list again. */
  const act = useCallback(
    async (row, action, call, confirm) => {
      if (confirm && !(await confirmAction(confirm))) return;
      setWorking(row.id + ':' + action);
      try {
        const { message } = await call();
        toast(message || 'Saved.');
        load();
      } catch (err) {
        alertError(err.message || 'Could not save.', 'Not saved');
      } finally {
        setWorking(null);
      }
    },
    [load, toast]
  );

  const issue = (row) => act(row, 'issue', () => preTestApi.book(row.candidate.id, row.jobRole.id));

  const pass = (row) =>
    act(row, 'pass', () => preTestApi.record(row.candidate.id, row.latest.id, { result: 'pass' }), {
      title: 'Mark as passed?',
      html: describe(row) + '<br>They become eligible for the final test in this job category.',
      confirmText: 'Passed',
      icon: 'question',
    });

  const fail = (row) =>
    act(row, 'fail', () => preTestApi.record(row.candidate.id, row.latest.id, { result: 'fail' }), {
      title: 'Mark as failed?',
      html: describe(row) + '<br>A retake can be issued under a new index number.',
      confirmText: 'Failed',
      danger: true,
    });

  const rewind = (row) =>
    act(row, 'rewind', () => preTestApi.rewind(row.candidate.id, row.latest.id), {
      title: 'Rewind this result?',
      html:
        describe(row) +
        '<br>It goes back to waiting for its result, under the same index number' +
        (row.status === 'pass' ? ', and is no longer eligible for the final test.' : '.'),
      confirmText: 'Rewind',
      danger: row.status === 'pass',
    });

  const columns = useMemo(() => {
    const busy = (row, action) => working === row.id + ':' + action;
    const anyBusy = (row) => Boolean(working) && working.startsWith(row.id + ':');

    return [
      {
        key: 'candidate',
        header: 'Candidate',
        render: (row) => (
          <button type="button" onClick={() => navigate('/candidates/' + row.candidate.id)} className="text-left">
            <span className="block font-medium text-primary-600 hover:text-primary-700">{row.candidate.name}</span>
            <span className="block text-xs text-gray-500">
              {row.candidate.passportNo}
              {row.candidate.nicNo ? ' · ' + row.candidate.nicNo : ''}
            </span>
          </button>
        ),
      },
      ...(adminSide ? [{ key: 'agencyName', header: 'Agency', render: (row) => row.agencyName }] : []),
      { key: 'jobRole', header: 'Job category', render: (row) => row.jobRole.name },
      {
        key: 'index',
        header: 'Pre-test index',
        render: (row) =>
          row.latest?.indexNo ? (
            <span className="font-mono text-xs font-semibold text-gray-900">{row.latest.indexNo}</span>
          ) : (
            <span className="text-gray-400">—</span>
          ),
      },
      {
        key: 'status',
        header: 'Pre-test',
        render: (row) => (
          <div>
            <Badge tone={PRE_TEST_STATUS[row.status].tone} dot>
              {PRE_TEST_STATUS[row.status].label}
            </Badge>
            {row.attempts > 1 && <span className="mt-1 block text-xs text-gray-500">Attempt {row.attempts}</span>}
            {row.latest?.note && <span className="mt-1 block text-xs text-gray-500">{row.latest.note}</span>}
          </div>
        ),
      },
      {
        key: 'date',
        header: 'Date',
        render: (row) => formatDate(row.latest?.recordedAt || row.latest?.bookedAt) || '—',
      },
      ...(adminSide
        ? []
        : [
            {
              key: 'actions',
              header: 'Actions',
              className: 'text-right',
              render: (row) => {
                if (row.candidate.blocked) return null;
                const disabled = anyBusy(row);

                return (
                  <div className="flex flex-wrap justify-end gap-2">
                    {row.status === 'none' && (
                      <Button size="sm" icon={IconPlus} loading={busy(row, 'issue')} disabled={disabled} onClick={() => issue(row)}>
                        Issue index
                      </Button>
                    )}
                    {row.status === 'pending' && (
                      <>
                        <Button size="sm" variant="success" icon={IconCheck} loading={busy(row, 'pass')} disabled={disabled} onClick={() => pass(row)}>
                          Pass
                        </Button>
                        <Button size="sm" variant="secondary" icon={IconX} loading={busy(row, 'fail')} disabled={disabled} onClick={() => fail(row)}>
                          Fail
                        </Button>
                      </>
                    )}
                    {(row.status === 'pass' || row.status === 'fail') && (
                      <Button size="sm" variant="secondary" icon={IconRefresh} loading={busy(row, 'rewind')} disabled={disabled} onClick={() => rewind(row)}>
                        Rewind
                      </Button>
                    )}
                    {row.status === 'fail' && (
                      <Button size="sm" icon={IconPlus} loading={busy(row, 'issue')} disabled={disabled} onClick={() => issue(row)}>
                        Retake
                      </Button>
                    )}
                  </div>
                );
              },
            },
          ]),
    ];
    // The handlers only read `row` and the stable load/toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminSide, navigate, working]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Pre-tests"
          subtitle={
            adminSide
              ? "Each local agency's own pre-test, by job category. Only those who pass are eligible for the final test."
              : 'Your own pre-test, by job category. Issue the pre-test index, then mark it passed or failed. Only those who pass are eligible for the final test.'
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, passport or NIC"
                  aria-label="Search candidates"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm placeholder:text-gray-400
                             focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100 sm:w-56"
                />
              </div>
              <label htmlFor="pre-test-role" className="sr-only">
                Job category
              </label>
              <select
                id="pre-test-role"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="field-input py-2 text-sm"
              >
                <option value="">All job categories</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
          }
        />
        <Tabs tabs={TABS.map((t) => ({ ...t, count: counts[t.id] ?? 0 }))} active={tab} onChange={setTab} />
        <Table
          columns={columns}
          rows={rows}
          loading={loading}
          empty={
            tab === 'pass'
              ? 'Nobody is eligible for the final test yet.'
              : tab === 'pending'
                ? 'No pre-test is waiting for its result.'
                : 'Nothing to show here.'
          }
          rowLabel="pre-tests"
        />
      </Card>
    </div>
  );
}
