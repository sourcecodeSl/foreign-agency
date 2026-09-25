import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { IconCheck } from '../../components/ui/Icons';
import { candidateApi } from '../../lib/api';
import { SourceTag, formatDate } from './shared';
import { AssignModal } from './CategoryResults';

const POLICE = {
  not_applied: { label: 'Not applied', tone: 'gray' },
  applied: { label: 'Applied', tone: 'amber' },
  received: { label: 'Received', tone: 'green' },
};

/** One label and its value, as the candidate file lays them out. */
function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

/**
 * Candidates local agencies have registered that are not with any foreign
 * company yet, oldest first, each with the details checked before assigning.
 *
 * A coordinator or the Main Admin picks the company and the job categories
 * it tests - starting from what the agency said the candidate can do - and
 * the test index numbers are issued. The agency never chooses the company.
 */
export default function PendingRegistrations() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [rows, setRows] = useState(null);
  const [assigning, setAssigning] = useState(null);
  // One local agency's candidates, or everybody's.
  const [agencyFilter, setAgencyFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const { data } = await candidateApi.waitingForCompany();
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      toast(err.message || 'Could not load the candidates waiting for a company.', 'error');
      setRows([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // The agencies with somebody waiting, by name, for the filter.
  const agencies = useMemo(
    () =>
      Array.from(new Map((rows || []).map((row) => [row.agencyId, row.agencyName || row.agencyId])).entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [rows]
  );

  // An agency with nobody left waiting drops back to everybody.
  useEffect(() => {
    if (agencyFilter !== 'all' && !agencies.some((a) => a.id === agencyFilter)) setAgencyFilter('all');
  }, [agencies, agencyFilter]);

  // Oldest first, as the server sends them: the first to come in is at the top.
  const shown = (rows || []).filter((row) => agencyFilter === 'all' || row.agencyId === agencyFilter);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Waiting for a company {rows?.length > 0 && <Badge tone="amber">{rows.length}</Badge>}
          </span>
        }
        subtitle="Registered by local agencies, oldest first. Assigning the company issues the test index numbers."
        action={
          <div>
            <label htmlFor="pendingAgency" className="sr-only">
              Local agency
            </label>
            <select
              id="pendingAgency"
              value={agencyFilter}
              onChange={(e) => setAgencyFilter(e.target.value)}
              className="field-input py-2 text-sm"
            >
              <option value="all">All agencies</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {rows === null ? (
        <p className="px-5 py-6 text-sm text-gray-500">Loading...</p>
      ) : shown.length === 0 && rows.length > 0 ? (
        <p className="px-5 py-10 text-center text-sm text-gray-500">Nobody from this agency is waiting.</p>
      ) : rows.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <IconCheck className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-3 text-sm font-medium text-gray-900">Nobody is waiting for a company</p>
          <p className="mt-1 text-sm text-gray-500">Candidates new from the local agencies show here.</p>
        </div>
      ) : (
        <ul>
          {shown.map((row) => {
            const c = row.candidate;
            const police = POLICE[c.policeReport?.status] || POLICE.not_applied;
            return (
              <li key={row.id} className="border-t border-gray-100 px-5 py-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => navigate('/candidates/' + c.id)}
                      className="text-left text-base font-semibold text-primary-600 hover:text-primary-700"
                    >
                      {c.name}
                    </button>
                    <p className="text-xs text-gray-500">
                      From {row.agencyName} · registered {formatDate(row.createdAt)}
                      {row.requested ? ' · the agency asked for ' + row.requested.company.name : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => navigate('/candidates/' + c.id)}>
                    View file
                  </Button>
                  <Button size="sm" onClick={() => setAssigning(row)}>
                    Assign company
                  </Button>
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Detail label="Father's name">{c.fatherName || '—'}</Detail>
                  <Detail label="Passport">{c.passportNo}</Detail>
                  <Detail label="Passport validity">
                    {c.passportExpiry ? (
                      <span className={c.passportWarning ? 'text-amber-700' : undefined}>{formatDate(c.passportExpiry)}</span>
                    ) : (
                      '—'
                    )}
                  </Detail>
                  <Detail label="NIC">{c.nicNo || '—'}</Detail>
                  <Detail label="Date of birth">
                    {c.dateOfBirth ? formatDate(c.dateOfBirth) + (c.age != null ? ' · ' + c.age + ' years' : '') : '—'}
                  </Detail>
                  <Detail label="Job categories">{(c.jobRoles || []).map((role) => role.name).join(', ') || '—'}</Detail>
                  <Detail label="Police report">
                    <Badge tone={police.tone} dot>
                      {police.label}
                    </Badge>
                    {c.policeReport?.referenceNo ? (
                      <span className="ml-2 text-xs text-gray-500">{c.policeReport.referenceNo}</span>
                    ) : null}
                  </Detail>
                  <Detail label="Added by">
                    <SourceTag registeredBy={c.registeredBy} />
                  </Detail>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <Detail label="Address">{c.address || '—'}</Detail>
                  </div>
                </dl>
                {c.passportWarning && <p className="mt-2 text-xs text-amber-700">{c.passportWarning}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {assigning && (
        <AssignModal
          candidate={assigning.candidate}
          mode="assign"
          // What the agency asked for, if it did; else what it said the candidate can do.
          initialCompanyId={assigning.requested?.company.id || ''}
          initialRoleIds={assigning.requested?.jobRoleIds || (assigning.candidate.jobRoles || []).map((role) => role.id)}
          onClose={() => setAssigning(null)}
          onSaved={load}
        />
      )}
    </Card>
  );
}
