import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader } from '../../components/ui/Card';
import Tabs from '../../components/ui/Tabs';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import CopyButton from '../../components/ui/CopyButton';
import { StatusBadge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { IconPlus, IconSearch } from '../../components/ui/Icons';
import { agencyApi } from '../../lib/api';

const TABS = [
  { id: 'pending', label: 'Pending' },
  { id: 'active', label: 'Active' },
  { id: 'deactivated', label: 'Deactivated' },
  { id: 'all', label: 'All Agencies' },
];

export default function AgencyList() {
  const { toast } = useToast();
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, countRes] = await Promise.all([
        agencyApi.list({ status: tab, search }),
        agencyApi.counts(),
      ]);
      setRows(list.data);
      setCounts(countRes.data);
    } catch (err) {
      toast(err.message || 'Could not load agencies.', 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, search, toast]);

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const changeStatus = async (agency, status, label) => {
    setBusyId(agency.id);
    try {
      await agencyApi.updateStatus(agency.id, status);
      toast(agency.name + ' has been ' + label + '.');
      load();
    } catch (err) {
      toast(err.message || 'Update failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const resetCredentials = async (agency) => {
    setBusyId(agency.id);
    try {
      const { data } = await agencyApi.resetCredentials(agency.id);
      const text = [
        'Agency: ' + agency.name,
        'Username: ' + data.username,
        'Password: ' + data.password,
        'Login URL: ' + data.loginUrl,
      ].join('\n');
      await navigator.clipboard?.writeText(text).catch(() => {});
      toast('New credentials generated and copied to clipboard.');
    } catch (err) {
      toast(err.message || 'Could not reset credentials.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Agency',
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">
            {row.code} · {row.username}
          </p>
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Address',
      render: (row) => (
        <span className="block max-w-[240px] truncate text-gray-600" title={row.address}>
          {row.address}
        </span>
      ),
    },
    { key: 'contact', header: 'Contact' },
    { key: 'users', header: 'Users', className: 'text-center' },
    { key: 'createdAt', header: 'Created' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <CopyButton
            size="sm"
            variant="ghost"
            label="Copy"
            value={
              'Agency: ' + row.name + '\nCode: ' + row.code + '\nUsername: ' + row.username +
              '\nAddress: ' + row.address
            }
          />

          {row.status === 'pending' && (
            <>
              <Button
                size="sm"
                loading={busyId === row.id}
                onClick={() => changeStatus(row, 'active', 'approved')}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busyId === row.id}
                onClick={() => changeStatus(row, 'deactivated', 'rejected')}
              >
                Reject
              </Button>
            </>
          )}

          {row.status === 'active' && (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={busyId === row.id}
                onClick={() => resetCredentials(row)}
              >
                Reset Login
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={busyId === row.id}
                onClick={() => changeStatus(row, 'deactivated', 'deactivated')}
              >
                Deactivate
              </Button>
            </>
          )}

          {row.status === 'deactivated' && (
            <Button
              size="sm"
              loading={busyId === row.id}
              onClick={() => changeStatus(row, 'active', 'reactivated')}
            >
              Reactivate
            </Button>
          )}
        </div>
      ),
    },
  ];

  const tabsWithCounts = TABS.map((t) => ({ ...t, count: counts[t.id] }));

  return (
    <Card>
      <CardHeader
        title="Agencies"
        subtitle="Approve new registrations and manage the status of every agency."
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agencies"
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm
                           placeholder:text-gray-400 focus:border-primary-500 focus:outline-none
                           focus:ring-4 focus:ring-primary-100 sm:w-56"
              />
            </div>
            <Link to="/agencies/create">
              <Button icon={IconPlus}>New Agency</Button>
            </Link>
          </div>
        }
      />

      <Tabs tabs={tabsWithCounts} active={tab} onChange={setTab} />

      <Table
        columns={columns}
        rows={rows}
        loading={loading}
        empty={'No ' + (tab === 'all' ? '' : tab + ' ') + 'agencies found.'}
      />

      <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm text-gray-500">
        <span>
          Showing <span className="font-medium text-gray-900">{rows.length}</span> record
          {rows.length === 1 ? '' : 's'}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled>
            Previous
          </Button>
          <Button size="sm" variant="secondary" disabled>
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}
