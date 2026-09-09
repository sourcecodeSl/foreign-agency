import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardHeader } from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { IconPlus, IconSearch, IconUsers, IconTrash, IconBuilding } from '../../components/ui/Icons';
import { candidateApi, agencyApi } from '../../lib/api';
import { useAuth, isGlobalRole } from '../../context/AuthContext';

const STATUS_TONE = {
  draft: 'gray',
  submitted: 'blue',
  approved: 'green',
  rejected: 'red',
};

export default function CandidatesList() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { admin } = useAuth();

  // A cross-agency role browses one agency at a time and picks which.
  const isAdmin = isGlobalRole(admin?.roleSlug);

  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(!isAdmin);

  const [agencies, setAgencies] = useState([]);
  const [agencyId, setAgencyId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // The picker only exists for the admin; an agency login is already scoped.
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const { data } = await agencyApi.list({ status: 'all' });
        setAgencies(data);
      } catch (err) {
        toast(err.message || 'Could not load the agency list.', 'error');
      }
    })();
  }, [isAdmin, toast]);

  const load = useCallback(async () => {
    // Nothing to fetch until the admin has chosen whose files to look at.
    if (isAdmin && !agencyId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data } = await candidateApi.list({ search, status, agencyId });
      setRows(data);
    } catch (err) {
      toast(err.message || 'Could not load candidates.', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, status, agencyId, isAdmin, toast]);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const removeCandidate = async (candidate) => {
    setDeleting(true);
    try {
      await candidateApi.remove(candidate.id);
      toast(candidate.name + ' has been removed.');
      setConfirmDelete(null);
      load();
    } catch (err) {
      toast(err.message || 'Could not remove the candidate.', 'error');
    } finally {
      setDeleting(false);
    }
  };

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
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => navigate('/candidates/' + row.id)}>
            {isAdmin ? 'View' : 'Open'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={IconTrash}
            title="Remove this candidate"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => setConfirmDelete(row)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const selectClass =
    'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 ' +
    'focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100';

  const chosenAgency = agencies.find((a) => a.id === agencyId);

  return (
    <>
      <Card>
        <CardHeader
          title="Candidates"
          subtitle={
            isAdmin
              ? 'Pick an agency to review the candidates it registered.'
              : 'Everyone registered by your agency, and how complete their file is.'
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && (
                <select
                  value={agencyId}
                  onChange={(e) => setAgencyId(e.target.value)}
                  className={selectClass}
                  aria-label="Agency"
                >
                  <option value="">Select an agency...</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}

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

              {/* Registering is the agency's job, so the admin is not offered it. */}
              {!isAdmin && (
                <Link to="/candidates/register">
                  <Button icon={IconPlus}>Register Candidate</Button>
                </Link>
              )}
            </div>
          }
        />

        {isAdmin && !agencyId ? (
          <div className="px-5 py-16 text-center">
            <IconBuilding className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-900">No agency selected</p>
            <p className="mt-1 text-sm text-gray-500">
              Choose an agency above to see the candidates it has registered.
            </p>
          </div>
        ) : (
          <Table
            columns={columns}
            rows={rows}
            loading={loading}
            empty="No candidates registered yet."
          />
        )}

        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm text-gray-500">
          <span className="inline-flex items-center gap-2">
            <IconUsers className="h-4 w-4 text-gray-400" />
            <span className="font-medium text-gray-900">{rows.length}</span> candidate
            {rows.length === 1 ? '' : 's'}
            {chosenAgency ? ' at ' + chosenAgency.name : ''}
          </span>
        </div>
      </Card>

      <Modal
        open={confirmDelete !== null}
        title={'Remove ' + (confirmDelete?.name || 'candidate') + '?'}
        subtitle="The candidate no longer appears in the list."
        onClose={() => (deleting ? null : setConfirmDelete(null))}
        footer={
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={deleting}
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={deleting}
              onClick={() => removeCandidate(confirmDelete)}
            >
              Remove Candidate
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Passport{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-900">
            {confirmDelete?.passportNo}
          </code>{' '}
          is removed from the register. The documents already uploaded stay on the server, so the
          record can be restored if this was a mistake.
        </p>
      </Modal>
    </>
  );
}
