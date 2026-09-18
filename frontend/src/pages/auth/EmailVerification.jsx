import { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Tabs from '../../components/ui/Tabs';
import Button from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { IconMail, IconSearch, IconCheck, IconRefresh, IconTrash } from '../../components/ui/Icons';
import { verificationApi } from '../../lib/api';
import { confirmAction, escapeHtml } from '../../lib/alert';
import AgencyVerification from './AgencyVerification';

const TABS = [
  { id: 'all', label: 'All Requests' },
  { id: 'unverified', label: 'Awaiting Confirmation' },
  { id: 'verified', label: 'Verified' },
  { id: 'bounced', label: 'Bounced' },
];

export default function EmailVerification() {
  const { toast } = useToast();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await verificationApi.listEmails({ status: tab, search });
      setRows(data);
    } catch (err) {
      toast(err.message || 'Could not load verification requests.', 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, search, toast]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const run = async (id, fn, successMessage) => {
    setBusyId(id);
    try {
      await fn(id);
      toast(successMessage);
      load();
    } catch (err) {
      toast(err.message || 'Action failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const removeRequest = async (row) => {
    const sure = await confirmAction({
      title: 'Remove this request?',
      html:
        '<p>The confirmation history for <strong>' + escapeHtml(row.email) +
        '</strong> is dropped from this list.</p>' +
        '<p style="margin-top:.75rem">This is only the record of the links that were sent - the account ' +
        'itself is not touched, and a new confirmation can be requested at any time.</p>',
      confirmText: 'Remove Request',
      danger: true,
    });
    if (!sure) return;

    try {
      await verificationApi.removeEmail(row.id);
      toast(row.email + ' has been removed from the list.');
      load();
    } catch (err) {
      toast(err.message || 'Could not remove the request.', 'error');
    }
  };

  const columns = [
    {
      key: 'email',
      header: 'Email Address',
      render: (row) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
            <IconMail className="h-4 w-4" />
          </span>
          <div>
            <p className="font-medium text-gray-900">{row.email}</p>
            <p className="text-xs text-gray-500">{row.name}</p>
          </div>
        </div>
      ),
    },
    { key: 'agency', header: 'Agency' },
    { key: 'requestedAt', header: 'Requested' },
    {
      key: 'attempts',
      header: 'Attempts',
      className: 'text-center',
      render: (row) => (
        <span className={row.attempts > 2 ? 'font-semibold text-amber-600' : 'text-gray-600'}>
          {row.attempts}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={IconRefresh}
            loading={busyId === row.id}
            onClick={() =>
              run(row.id, verificationApi.resendEmail, 'Verification email resent to ' + row.email + '.')
            }
          >
            Resend
          </Button>
          {row.status !== 'verified' && (
            <Button
              size="sm"
              icon={IconCheck}
              disabled={busyId === row.id}
              onClick={() =>
                run(row.id, verificationApi.markVerified, row.email + ' marked as verified.')
              }
            >
              Mark Verified
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={IconTrash}
            title="Remove this request"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            disabled={busyId === row.id}
            onClick={() => removeRequest(row)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Where each agency's own sign-in verification stands. */}
      <AgencyVerification />

      <Card>
        <CardHeader
          title="Email Confirmations"
          subtitle="Confirmation links sent from this module. Resend a link or verify an address by hand."
          action={
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email or name"
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm
                           placeholder:text-gray-400 focus:border-primary-500 focus:outline-none
                           focus:ring-4 focus:ring-primary-100 sm:w-64"
              />
            </div>
          }
        />
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <Table columns={columns} rows={rows} loading={loading} empty="No verification requests found." />
      </Card>
    </div>
  );
}
