import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import Button from '../components/ui/Button';
import { StatusBadge } from '../components/ui/Badge';
import Table from '../components/ui/Table';
import { IconBuilding, IconUsers, IconMail, IconShield, IconPlus } from '../components/ui/Icons';
import { dashboardApi, agencyApi } from '../lib/api';

function StatCard({ label, value, delta, icon: Icon, tone }) {
  const positive = typeof delta === 'string' && delta.startsWith('+');
  return (
    <Card>
      <div className="flex items-start justify-between p-5">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{value}</p>
          {delta && (
            <p
              className={
                'mt-1 text-xs font-medium ' + (positive ? 'text-emerald-600' : 'text-amber-600')
              }
            >
              {delta} vs last month
            </p>
          )}
        </div>
        <span className={'flex h-11 w-11 items-center justify-center rounded-lg ' + tone}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([dashboardApi.stats(), agencyApi.list({ status: 'pending' })])
      .then(([s, p]) => {
        setStats(s.data);
        setPending(p.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const columns = [
    {
      key: 'name',
      header: 'Agency',
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">{row.code}</p>
        </div>
      ),
    },
    { key: 'createdAt', header: 'Submitted' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: () => (
        <Link to="/agencies" className="text-sm font-medium text-primary-600 hover:text-primary-700">
          Review
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Agencies"
          value={stats?.agencies.total ?? '—'}
          delta={stats?.agencies.delta}
          icon={IconBuilding}
          tone="bg-primary-50 text-primary-600"
        />
        <StatCard
          label="Pending Approval"
          value={stats?.pending.total ?? '—'}
          delta={stats?.pending.delta}
          icon={IconShield}
          tone="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Total Users"
          value={stats?.users.total ?? '—'}
          delta={stats?.users.delta}
          icon={IconUsers}
          tone="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Unverified Emails"
          value={stats?.unverified.total ?? '—'}
          delta={stats?.unverified.delta}
          icon={IconMail}
          tone="bg-red-50 text-red-600"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Agencies Awaiting Approval"
              subtitle="New registrations that need a decision."
              action={
                <Link to="/agencies">
                  <Button variant="secondary" size="sm">
                    View all
                  </Button>
                </Link>
              }
            />
            <Table columns={columns} rows={pending} loading={loading} empty="Nothing awaiting approval." />
          </Card>
        </div>

        <Card>
          <CardHeader title="Quick Actions" />
          <CardBody className="space-y-2">
            {[
              ['Create a new agency', '/agencies/create', IconPlus],
              ['Manage user types', '/users/types', IconShield],
              ['Assign permissions', '/users/permissions', IconShield],
              ['Review email verifications', '/verification/emails', IconMail],
            ].map(([label, to, Icon]) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:border-primary-300 hover:bg-primary-50/50 hover:text-primary-700"
              >
                <Icon className="h-4 w-4 text-gray-400" />
                {label}
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
