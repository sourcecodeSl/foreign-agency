import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { useAuth, isGlobalRole } from '../../context/AuthContext';
import { agencyApi, candidateApi } from '../../lib/api';
import { formatDate } from './shared';
import { ResultModal } from './CategoryResults';

/** How this company's test went in each job category it was given. */
function ResultBadges({ candidate }) {
  if (candidate.blocked) {
    return (
      <Badge tone="red" dot>
        Blocked
      </Badge>
    );
  }
  // Passed with another company: this registration has lapsed.
  if (candidate.registration?.state === 'void') {
    return (
      <Badge tone="red" dot>
        Passed with another company
      </Badge>
    );
  }
  const results = candidate.registration?.results || [];
  if (results.length === 0) return <Badge tone="gray">No result yet</Badge>;

  return (
    <div className="flex flex-wrap gap-1">
      {results.map((row) => (
        <Badge key={row.id} tone={row.result === 'pass' ? 'green' : 'red'} dot>
          {(row.result === 'pass' ? 'Passed - ' : 'Did not pass - ') + row.jobRole}
        </Badge>
      ))}
    </div>
  );
}

/**
 * The candidates registered for one foreign company's test.
 *
 * The company signs in and reads its own; the admin side picks whose to read.
 * Either of them records how each candidate's test went - nobody else can,
 * and the local agency that registered them only watches.
 */
export default function CompanyCandidates() {
  const { admin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const adminSide = isGlobalRole(admin?.roleSlug);
  // The company reads its own; the admin picks one.
  const companyId = adminSide ? params.get('companyAgencyId') || '' : admin?.agency?.id || '';
  const agencyFilter = params.get('agencyId') || 'all';

  const [companies, setCompanies] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(null);

  useEffect(() => {
    if (!adminSide) return;
    agencyApi
      .foreignOptions()
      .then(({ data }) => setCompanies(Array.isArray(data) ? data : []))
      .catch((err) => toast(err.message || 'Could not load the foreign companies.', 'error'));
  }, [adminSide, toast]);

  const load = useCallback(() => {
    if (adminSide && !companyId) {
      setRows([]);
      return;
    }
    setLoading(true);
    candidateApi
      .list({ companyAgencyId: adminSide ? companyId : undefined, agencyId: agencyFilter })
      .then(({ data }) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => toast(err.message || 'Could not load the candidates.', 'error'))
      .finally(() => setLoading(false));
  }, [adminSide, companyId, agencyFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // The agencies that have registered somebody here, for the filter beside it.
  const [agencies, setAgencies] = useState([]);
  useEffect(() => {
    if (agencyFilter !== 'all') return;
    setAgencies(
      Array.from(new Map(rows.map((row) => [row.agencyId, row.agencyName || row.agencyId])).entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    );
  }, [rows, agencyFilter]);

  const setParam = (key, value) => {
    const next = Object.fromEntries(params.entries());
    if (value && value !== 'all') next[key] = value;
    else delete next[key];
    setParams(next);
  };

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Candidate',
        render: (row) => (
          <button
            type="button"
            onClick={() => navigate('/candidates/' + row.id)}
            className="text-left font-medium text-primary-600 hover:text-primary-700"
          >
            {row.name}
          </button>
        ),
      },
      { key: 'agencyName', header: 'Agency', render: (row) => row.agencyName || row.agencyId || '—' },
      { key: 'passportNo', header: 'Passport' },
      {
        key: 'jobRoles',
        header: 'Job categories',
        render: (row) => (row.registration?.jobRoles || []).map((r) => r.name).join(', ') || '—',
      },
      { key: 'registered', header: 'Registered', render: (row) => formatDate(row.createdAt) },
      { key: 'result', header: 'Result', render: (row) => <ResultBadges candidate={row} /> },
      {
        key: 'actions',
        header: 'Actions',
        className: 'text-right',
        render: (row) =>
          row.blocked || !row.registration || row.registration.state === 'void' ? null : (
            <Button
              size="sm"
              variant={row.registration.state === 'passed' ? 'secondary' : 'primary'}
              onClick={() => setRecording(row)}
            >
              {row.registration.state === 'passed' ? 'Change result' : 'Record result'}
            </Button>
          ),
      },
    ],
    [navigate]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Candidates registered for your test"
          subtitle="Registered by local agencies for this company. Record how each one's test went."
          action={
            <div className="flex flex-wrap items-center gap-2">
              {adminSide && (
                <div>
                  <label htmlFor="companyPicker" className="sr-only">
                    Foreign company
                  </label>
                  <select
                    id="companyPicker"
                    value={companyId}
                    onChange={(e) => setParam('companyAgencyId', e.target.value)}
                    className="field-input py-2 text-sm"
                  >
                    <option value="">Select a company...</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="agencyPicker" className="sr-only">
                  Agency
                </label>
                <select
                  id="agencyPicker"
                  value={agencyFilter}
                  onChange={(e) => setParam('agencyId', e.target.value)}
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
            </div>
          }
        />

        {adminSide && !companyId ? (
          <p className="px-5 py-6 text-sm text-gray-500">Pick a company to see the candidates registered for it.</p>
        ) : (
          <Table
            columns={columns}
            rows={rows}
            loading={loading}
            empty="Nobody has been registered for this company yet."
            rowLabel="candidates"
          />
        )}
      </Card>

      {recording && (
        <ResultModal
          candidate={recording}
          registration={recording.registration}
          onClose={() => setRecording(null)}
          onRecorded={load}
        />
      )}
    </div>
  );
}
