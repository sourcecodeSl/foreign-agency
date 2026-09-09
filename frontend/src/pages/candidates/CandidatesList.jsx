import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardHeader } from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { IconPlus, IconSearch, IconUsers } from '../../components/ui/Icons';
import { candidateApi } from '../../lib/api';

const STATUS_TONE = {
  draft: 'gray',
  submitted: 'blue',
  approved: 'green',
  rejected: 'red',
};

export default function CandidatesList() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await candidateApi.list({ search, status });
      setRows(data);
    } catch (err) {
      toast(err.message || 'Could not load candidates.', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, status, toast]);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

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
        </div>
      ),
    },
    { key: 'mobile', header: 'Mobile' },
    {
      key: 'email',
      header: 'Email',
      render: (row) => row.email || <span className="text-gray-400">—</span>,
    },
    {
      key: 'documents',
      header: 'Documents',
      className: 'text-center',
      render: (row) => {
        const done = 8 - (row.missingDocuments?.length ?? 8);
        const complete = done === 8;
        return (
          <span
            className={
              'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ' +
              (complete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')
            }
          >
            {done} / 8
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={STATUS_TONE[row.status] || 'gray'} dot>{row.status}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (row) => (
        <Button size="sm" variant="secondary" onClick={() => navigate('/candidates/' + row.id)}>
          Open
        </Button>
      ),
    },
  ];

  const selectClass =
    'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 ' +
    'focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100';

  return (
    <Card>
      <CardHeader
        title="Candidates"
        subtitle="Everyone registered by your agency, and how complete their file is."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={selectClass}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>

            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, passport, NIC, mobile"
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm
                           placeholder:text-gray-400 focus:border-primary-500 focus:outline-none
                           focus:ring-4 focus:ring-primary-100 sm:w-64"
              />
            </div>

            <Link to="/candidates/register">
              <Button icon={IconPlus}>Register Candidate</Button>
            </Link>
          </div>
        }
      />

      <Table
        columns={columns}
        rows={rows}
        loading={loading}
        empty="No candidates registered yet."
      />

      <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm text-gray-500">
        <span className="inline-flex items-center gap-2">
          <IconUsers className="h-4 w-4 text-gray-400" />
          <span className="font-medium text-gray-900">{rows.length}</span> candidate
          {rows.length === 1 ? '' : 's'}
        </span>
      </div>
    </Card>
  );
}
