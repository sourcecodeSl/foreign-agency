import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Pagination, { usePaged } from '../../components/ui/Pagination';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { IconDocument } from '../../components/ui/Icons';
import { agreementApi } from '../../lib/api';
import { alertError, confirmAction } from '../../lib/alert';
import { formatDate } from '../candidates/shared';
import { downloadAgreementPdf, openAgreementPdf } from './Agreements';

/** One document a company sent, as a small card that can be picked for sending. */
function DocumentCard({ agreement, selected, onToggle }) {
  const navigate = useNavigate();
  const id = 'pick-' + agreement.id;

  return (
    <div
      className={
        'flex flex-col rounded-xl border p-4 transition ' +
        (selected ? 'border-primary-500 bg-primary-50/40 ring-1 ring-primary-500' : 'border-gray-200 bg-white')
      }
    >
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
          <IconDocument className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-gray-900">{agreement.title}</span>
          <span className="block truncate text-xs text-gray-500">{agreement.agencyName}</span>
          <span className="block text-xs text-gray-400">sent {formatDate(agreement.sentToAdminAt)}</span>
        </span>
        <input
          id={id}
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(agreement.id)}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600"
          aria-label={'Select ' + agreement.title + ' from ' + agreement.agencyName}
        />
      </label>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => openAgreementPdf(agreement.id)}>
          View PDF
        </Button>
        <Button size="sm" variant="secondary" onClick={() => navigate('/agreements/' + agreement.id)}>
          View details
        </Button>
      </div>
    </div>
  );
}

/** A company or agency dropdown, with an "all" choice on top. */
function Filter({ id, label, value, onChange, options, allLabel }) {
  return (
    <div className="min-w-[14rem] flex-1 sm:max-w-sm">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="field-input">
        <option value="all">{allLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Documents waiting: pick a company, pick documents, pick a local agency, send. */
function Received({ companies, localAgencies, onSent }) {
  const { toast } = useToast();
  const [company, setCompany] = useState('all');
  const [agreements, setAgreements] = useState(null);
  const [selected, setSelected] = useState([]);
  const [agencyId, setAgencyId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setAgreements(null);
    try {
      const { data } = await agreementApi.list({ company, status: 'sent_to_admin' });
      setAgreements(Array.isArray(data) ? data : []);
    } catch (err) {
      toast(err.message || 'Could not load the documents.', 'error');
      setAgreements([]);
    }
    setSelected([]);
  }, [company, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const send = async () => {
    if (!agencyId) {
      alertError('Choose the local agency to send to.', 'Not sent');
      return;
    }
    const agency = localAgencies.find((a) => a.id === agencyId)?.name || 'the agency';
    const count = selected.length;
    const sure = await confirmAction({
      title: 'Send ' + (count === 1 ? 'this document' : count + ' documents') + ' to ' + agency + '?',
      text: agency + ' sees ' + (count === 1 ? 'it' : 'them') + ' on its agreements page from now on.',
      confirmText: 'Send',
    });
    if (!sure) return;

    setBusy(true);
    let sent = 0;
    try {
      for (const id of selected) {
        await agreementApi.sendToAgency(id, agencyId);
        sent++;
      }
      toast(sent === 1 ? 'Document sent to ' + agency + '.' : sent + ' documents sent to ' + agency + '.');
    } catch (err) {
      alertError(
        (sent ? sent + ' sent before this one failed: ' : '') + (err.message || 'Could not send.'),
        'Not all sent'
      );
    } finally {
      setBusy(false);
      setAgencyId('');
      load();
      onSent();
    }
  };

  return (
    <div className="space-y-4 px-5 py-4">
      <Filter
        id="receivedCompany"
        label="Foreign company"
        value={company}
        onChange={setCompany}
        allLabel="All foreign companies"
        options={companies.map((c) => ({
          id: c.id,
          label: c.name + ' (' + c.code + ')' + (c.waiting ? ' - ' + c.waiting + ' waiting' : ''),
        }))}
      />

      {!agreements ? (
        <p className="py-4 text-sm text-gray-500">Loading...</p>
      ) : agreements.length === 0 ? (
        <p className="py-4 text-sm text-gray-500">
          {company === 'all' ? 'No documents waiting.' : 'This company has no documents waiting.'}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {agreements.map((a) => (
            <DocumentCard key={a.id} agreement={a} selected={selected.includes(a.id)} onToggle={toggle} />
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-primary-200 bg-primary-50/40 p-4">
          <p className="w-full text-sm font-medium text-gray-900">
            {selected.length} document{selected.length === 1 ? '' : 's'} selected
          </p>
          <div className="min-w-[14rem] flex-1 sm:max-w-sm">
            <label htmlFor="sendAgency" className="field-label">
              Send to local agency
            </label>
            <select
              id="sendAgency"
              value={agencyId}
              onChange={(e) => setAgencyId(e.target.value)}
              className="field-input"
            >
              <option value="">Select a local agency...</option>
              {localAgencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.code})
                </option>
              ))}
            </select>
          </div>
          <Button onClick={send} loading={busy}>
            Send
          </Button>
          <Button variant="ghost" onClick={() => setSelected([])} disabled={busy}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}

/** What has been passed on, by company and by local agency. */
function Sent({ companies, localAgencies, version }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [company, setCompany] = useState('all');
  const [local, setLocal] = useState('all');
  const [agreements, setAgreements] = useState(null);
  const { paged, total, pages, page, pageSize, setPage, setPageSize } = usePaged(agreements || []);

  useEffect(() => {
    let live = true;
    setAgreements(null);
    agreementApi
      .list({ company, localAgency: local, status: 'sent_to_agency' })
      .then((res) => live && setAgreements(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        if (!live) return;
        toast(err.message || 'Could not load what was sent.', 'error');
        setAgreements([]);
      });
    return () => {
      live = false;
    };
  }, [company, local, version, toast]);

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex flex-wrap gap-4">
        <Filter
          id="sentCompany"
          label="Foreign company"
          value={company}
          onChange={setCompany}
          allLabel="All foreign companies"
          options={companies.map((c) => ({ id: c.id, label: c.name + ' (' + c.code + ')' }))}
        />
        <Filter
          id="sentAgency"
          label="Local agency"
          value={local}
          onChange={setLocal}
          allLabel="All local agencies"
          options={localAgencies.map((a) => ({ id: a.id, label: a.name + ' (' + a.code + ')' }))}
        />
      </div>

      {!agreements ? (
        <p className="py-4 text-sm text-gray-500">Loading...</p>
      ) : agreements.length === 0 ? (
        <p className="py-4 text-sm text-gray-500">Nothing sent for this choice yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Document</th>
                  <th className="py-2 pr-4 font-medium">Foreign company</th>
                  <th className="py-2 pr-4 font-medium">Local agency</th>
                  <th className="py-2 pr-4 font-medium">Candidate</th>
                  <th className="py-2 pr-4 font-medium">Received</th>
                  <th className="py-2 pr-4 font-medium">Sent</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2.5 pr-4 font-medium text-gray-900">{a.title}</td>
                    <td className="py-2.5 pr-4 text-gray-700">{a.agencyName}</td>
                    <td className="py-2.5 pr-4 text-gray-700">{a.localAgencyName}</td>
                    <td className="py-2.5 pr-4 text-gray-700">
                      {a.candidateName || <span className="text-gray-400">Not assigned yet</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500">{formatDate(a.sentToAdminAt)}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{formatDate(a.sentToAgencyAt)}</td>
                    <td className="whitespace-nowrap py-2.5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => openAgreementPdf(a.id)}>
                        View PDF
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => downloadAgreementPdf(a.id)}>
                        Download
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => navigate('/agreements/' + a.id)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pages={pages}
            pageSize={pageSize}
            total={total}
            onPage={setPage}
            onPageSize={setPageSize}
            label="agreements"
          />
        </>
      )}
    </div>
  );
}

/**
 * The admin side's agreements from foreign companies, in two tabs:
 *
 *   Received  each document a company sent, as a card; pick one or more and
 *             a local agency, and send.
 *   Sent      what has been passed on, filtered by company and local agency.
 */
export default function ForeignCompanyInbox() {
  const [tab, setTab] = useState('received');
  const [lists, setLists] = useState(null);
  // Bumped after a send, so the Sent tab reads again.
  const [version, setVersion] = useState(0);

  const loadLists = useCallback(() => {
    agreementApi
      .recipients()
      .then((res) => setLists(res.data))
      .catch(() => setLists({ companies: [], localAgencies: [] }));
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const waiting = (lists?.companies || []).reduce((n, c) => n + (c.waiting || 0), 0);

  const tabClass = (key) =>
    'border-b-2 px-1 pb-3 text-sm font-medium transition ' +
    (tab === key ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700');

  return (
    <Card>
      <CardHeader
        title="From foreign companies"
        subtitle="Documents foreign companies have sent. Select them and a local agency to send them on."
      />
      <div role="tablist" className="flex gap-6 border-b border-gray-200 px-5 pt-3">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'received'}
          className={tabClass('received')}
          onClick={() => setTab('received')}
        >
          Received {waiting > 0 && <Badge tone="amber">{waiting}</Badge>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sent'}
          className={tabClass('sent')}
          onClick={() => setTab('sent')}
        >
          Sent to local agencies
        </button>
      </div>

      {!lists ? (
        <p className="px-5 py-6 text-sm text-gray-500">Loading...</p>
      ) : tab === 'received' ? (
        <Received
          companies={lists.companies}
          localAgencies={lists.localAgencies}
          onSent={() => {
            loadLists();
            setVersion((v) => v + 1);
          }}
        />
      ) : (
        <Sent companies={lists.companies} localAgencies={lists.localAgencies} version={version} />
      )}
    </Card>
  );
}
