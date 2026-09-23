import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Table from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { useAuth, isGlobalRole } from '../../context/AuthContext';
import { agencyApi, candidateApi } from '../../lib/api';
import { alertError } from '../../lib/alert';
import { formatDate } from './shared';

/** How the company's test went for one candidate. */
function ResultBadge({ candidate }) {
  const result = candidate.testResult;

  if (result?.result === 'pass') {
    return (
      <Badge tone="green" dot>
        Passed{result.jobRole ? ' - ' + result.jobRole : ''}
      </Badge>
    );
  }
  if (result?.result === 'fail') {
    return (
      <Badge tone="red" dot>
        Did not pass{result.jobRole ? ' - ' + result.jobRole : ''}
      </Badge>
    );
  }
  return <Badge tone="gray">No result yet</Badge>;
}

/**
 * The result for one candidate: the trade they were tested in, and whether
 * they passed. A pass becomes their profession, so the trade is asked for.
 */
function ResultModal({ candidate, onClose, onRecorded }) {
  const { toast } = useToast();
  const roles = candidate.jobRoles || [];
  const [jobRoleId, setJobRoleId] = useState(roles.length === 1 ? String(roles[0].id) : '');
  const [result, setResult] = useState('');
  const [testResults, setTestResults] = useState(candidate.testResults || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!result) {
      alertError('Choose whether the candidate passed.', 'Not recorded');
      return;
    }
    if (result === 'pass' && !jobRoleId) {
      alertError('Choose the job category they passed in.', 'Not recorded');
      return;
    }

    setBusy(true);
    try {
      const { message } = await candidateApi.recordTestResult(candidate.id, {
        result,
        jobRoleId: result === 'pass' ? Number(jobRoleId) : undefined,
        note: note.trim() || undefined,
        testResults: testResults.trim() || undefined,
      });
      toast(message || 'Result recorded.');
      onRecorded();
      onClose();
    } catch (err) {
      alertError(err.message || 'Could not record the result.', 'Not recorded');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={'Record the result - ' + candidate.name}
      subtitle="A pass becomes the candidate's profession; anything else leaves them in the pool."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Save result
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="field-label">Result</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {[
              { id: 'pass', label: 'Passed', hint: 'The trade below becomes their profession.' },
              { id: 'fail', label: 'Did not pass', hint: 'They stay in the pool for another company.' },
            ].map((option) => (
              <label
                key={option.id}
                htmlFor={'result-' + option.id}
                className={
                  'flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ' +
                  (result === option.id
                    ? 'border-primary-400 bg-primary-50/60 ring-1 ring-primary-200'
                    : 'border-gray-200 hover:bg-gray-50')
                }
              >
                <input
                  id={'result-' + option.id}
                  type="radio"
                  name="result"
                  value={option.id}
                  checked={result === option.id}
                  onChange={() => setResult(option.id)}
                  className="mt-1 h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{option.label}</span>
                  <span className="block text-xs text-gray-500">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {result === 'pass' && (
          <div>
            <label htmlFor="resultRole" className="field-label">
              Job category passed <span className="text-red-500">*</span>
            </label>
            <select
              id="resultRole"
              value={jobRoleId}
              onChange={(e) => setJobRoleId(e.target.value)}
              className="field-input"
            >
              <option value="">Select...</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-500">The trades on this candidate's file.</p>
          </div>
        )}

        <div>
          <label htmlFor="testResults" className="field-label">
            Test results
          </label>
          <input
            id="testResults"
            value={testResults}
            maxLength={255}
            placeholder="NVQ Level 3 - Pass"
            onChange={(e) => setTestResults(e.target.value)}
            className="field-input"
          />
          <p className="mt-1.5 text-xs text-gray-500">What the test sheet says. It shows on the candidate's file.</p>
        </div>

        <div>
          <label htmlFor="resultNote" className="field-label">
            Note
          </label>
          <input
            id="resultNote"
            value={note}
            placeholder="Optional, e.g. cutting not accurate enough"
            onChange={(e) => setNote(e.target.value)}
            className="field-input"
          />
        </div>
      </div>
    </Modal>
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
        render: (row) => (row.jobRoles || []).map((r) => r.name).join(', ') || '—',
      },
      { key: 'registered', header: 'Registered', render: (row) => formatDate(row.createdAt) },
      { key: 'result', header: 'Result', render: (row) => <ResultBadge candidate={row} /> },
      {
        key: 'actions',
        header: 'Actions',
        className: 'text-right',
        render: (row) => (
          <Button size="sm" variant={row.testResult ? 'secondary' : 'primary'} onClick={() => setRecording(row)}>
            {row.testResult ? 'Change result' : 'Record result'}
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
        <ResultModal candidate={recording} onClose={() => setRecording(null)} onRecorded={load} />
      )}
    </div>
  );
}
