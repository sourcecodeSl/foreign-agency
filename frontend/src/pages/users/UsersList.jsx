import { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Badge, { StatusBadge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { IconSearch, IconTrash } from '../../components/ui/Icons';
import { userApi, roleApi, agencyApi } from '../../lib/api';

/** Where a login belongs: the main system, a local agency or a foreign company. */
const AGENCY_TYPES = [
  { value: 'all', label: 'All accounts' },
  { value: 'local', label: 'Local agencies' },
  { value: 'foreign', label: 'Foreign companies' },
  { value: 'main', label: 'Main system' },
];

export default function UsersList() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [filters, setFilters] = useState({ role: 'all', status: 'all', search: '', agencyType: 'all', agency: 'all' });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    roleApi.list().then(({ data }) => setRoles(data)).catch(() => {});
  }, []);

  // The agencies of the kind chosen, to narrow to one of them.
  useEffect(() => {
    if (!['local', 'foreign'].includes(filters.agencyType)) {
      setAgencies([]);
      return;
    }
    let live = true;
    agencyApi
      .list({ type: filters.agencyType })
      .then(({ data }) => live && setAgencies(Array.isArray(data) ? data : []))
      .catch(() => live && setAgencies([]));
    return () => {
      live = false;
    };
  }, [filters.agencyType]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await userApi.list(filters);
      setRows(data);
    } catch (err) {
      toast(err.message || 'Could not load users.', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    const t = setTimeout(load, filters.search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, filters.search]);

  const setFilter = (key, value) =>
    // A new kind of agency starts again from all of its agencies.
    setFilters((f) => ({ ...f, [key]: value, ...(key === 'agencyType' ? { agency: 'all' } : {}) }));

  const toggleStatus = async (user) => {
    const next = user.status === 'active' ? 'deactivated' : 'active';
    setBusyId(user.id);
    try {
      await userApi.updateStatus(user.id, next);
      toast(user.name + ' is now ' + next + '.');
      load();
    } catch (err) {
      toast(err.message || 'Update failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const removeUser = async (user) => {
    setBusyId(user.id);
    try {
      await userApi.remove(user.id);
      toast(user.name + ' was removed.');
      load();
    } catch (err) {
      toast(err.message || 'Delete failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'User',
      render: (row) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">
            {row.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
          </span>
          <div>
            <p className="font-medium text-gray-900">{row.name}</p>
            <p className="text-xs text-gray-500">{row.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone' },
    { key: 'role', header: 'Role', render: (row) => <Badge tone="blue">{row.role}</Badge> },
    {
      key: 'agency',
      header: 'Agency',
      render: (row) =>
        row.agency ? (
          <div>
            <p className="text-gray-900">{row.agency}</p>
            <p className="text-xs text-gray-500">{row.agencyType === 'foreign' ? 'Foreign company' : 'Local agency'}</p>
          </div>
        ) : (
          <span className="text-xs text-gray-400">Main system</span>
        ),
    },
    { key: 'lastLogin', header: 'Last Login' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant={row.status === 'active' ? 'secondary' : 'primary'}
            loading={busyId === row.id}
            onClick={() => toggleStatus(row)}
          >
            {row.status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
          <button
            type="button"
            onClick={() => removeUser(row)}
            disabled={busyId === row.id}
            className="rounded-md p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            aria-label={'Delete ' + row.name}
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const selectClass =
    'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 ' +
    'focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100';

  return (
    <Card>
      <CardHeader
        title="Users"
        subtitle="Every account across the main system and its agencies. Agency logins are issued with the agency, and coordinators from Coordinators & Access."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filters.role}
              onChange={(e) => setFilter('role', e.target.value)}
              className={selectClass}
              aria-label="Filter by role"
            >
              <option value="all">All roles</option>
              {roles.map((r) => (
                // The server matches the role by its slug.
                <option key={r.id} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>

            <select
              value={filters.agencyType}
              onChange={(e) => setFilter('agencyType', e.target.value)}
              className={selectClass}
              aria-label="Filter by agency type"
            >
              {AGENCY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            {['local', 'foreign'].includes(filters.agencyType) && (
              <select
                value={filters.agency}
                onChange={(e) => setFilter('agency', e.target.value)}
                className={selectClass}
                aria-label={filters.agencyType === 'foreign' ? 'Filter by foreign company' : 'Filter by local agency'}
              >
                <option value="all">
                  {filters.agencyType === 'foreign' ? 'All foreign companies' : 'All local agencies'}
                </option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.code})
                  </option>
                ))}
              </select>
            )}

            <select
              value={filters.status}
              onChange={(e) => setFilter('status', e.target.value)}
              className={selectClass}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="deactivated">Deactivated</option>
            </select>

            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={filters.search}
                onChange={(e) => setFilter('search', e.target.value)}
                placeholder="Search users"
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm
                           placeholder:text-gray-400 focus:border-primary-500 focus:outline-none
                           focus:ring-4 focus:ring-primary-100 sm:w-52"
              />
            </div>
          </div>
        }
      />

      <Table columns={columns} rows={rows} loading={loading} empty="No users match these filters." />

      <div className="border-t border-gray-200 px-5 py-3 text-sm text-gray-500">
        Showing <span className="font-medium text-gray-900">{rows.length}</span> of{' '}
        <span className="font-medium text-gray-900">{rows.length}</span> users
      </div>
    </Card>
  );
}
