import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { PageLoader } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { IconDocument } from '../../components/ui/Icons';
import { agencyApi, candidateApi } from '../../lib/api';
import { buildHistoryPdf } from '../../lib/historyPdf';

/** A file name for the report: "History - Nimal Silva.pdf". */
const fileNameFor = (name) => 'History - ' + String(name || 'candidate').replace(/[\\/:*?"<>|]+/g, '-') + '.pdf';

/**
 * The report as a PDF document, shown in the page, to download or print as
 * it is - the same file either way.
 */
function HistoryPdf({ report }) {
  const { toast } = useToast();
  const frame = useRef(null);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    let made = null;
    setUrl(null);
    setError(null);
    buildHistoryPdf(report)
      .then((bytes) => {
        made = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        if (live) setUrl(made);
        else URL.revokeObjectURL(made);
      })
      .catch((err) => live && setError(err.message || 'Could not make the PDF.'));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [report]);

  const download = () => {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileNameFor(report.candidate.name);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const print = () => {
    try {
      frame.current.contentWindow.focus();
      frame.current.contentWindow.print();
    } catch {
      // A browser that will not print from the frame opens it on its own.
      window.open(url, '_blank');
      toast('Opened in a new tab - print it from there.');
    }
  };

  return (
    <Card>
      <CardHeader
        title={'Candidate history - ' + report.candidate.name}
        subtitle="The report as a PDF. Download it, or print it."
        action={
          <div className="flex flex-wrap gap-2">
            <Link to={'/candidates/' + report.candidate.id}>
              <Button variant="secondary" size="sm">
                Open file
              </Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={download} disabled={!url}>
              Download PDF
            </Button>
            <Button size="sm" icon={IconDocument} onClick={print} disabled={!url}>
              Print
            </Button>
          </div>
        }
      />
      <div className="h-[80vh] border-t border-gray-200 bg-gray-100">
        {error ? (
          <p role="alert" className="p-6 text-sm text-red-700">
            {error}
          </p>
        ) : url ? (
          <iframe ref={frame} title="Candidate history report" src={url} className="h-full w-full border-0" />
        ) : (
          <PageLoader label="Making the report..." />
        )}
      </div>
    </Card>
  );
}

/**
 * The admin side's candidate history report.
 *
 * Pick a local agency - or a foreign company, then which agency's
 * candidates - then the candidate, and read (or print) everything they went
 * through: their details, and every company they were assigned to with the
 * tests, index numbers, results and dates, including companies they moved on
 * from - as a PDF shown in the page, to download or print.
 */
export default function CandidateHistory() {
  const { toast } = useToast();
  const [by, setBy] = useState('agency'); // 'agency' | 'company'
  const [locals, setLocals] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [agencyId, setAgencyId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [search, setSearch] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([agencyApi.list({ status: 'all', type: 'local' }), agencyApi.list({ status: 'all', type: 'foreign' })])
      .then(([l, f]) => {
        setLocals(Array.isArray(l.data) ? l.data : []);
        setCompanies(Array.isArray(f.data) ? f.data : []);
      })
      .catch((err) => toast(err.message || 'Could not load the agencies.', 'error'));
  }, [toast]);

  // The candidates to pick from: an agency's files, or a company's list.
  useEffect(() => {
    setCandidates([]);
    setCandidateId('');
    const query =
      by === 'agency'
        ? agencyId && { agencyId }
        : companyId && { agencyId: 'all', companyAgencyId: companyId };
    if (!query) return;
    candidateApi
      .list(query)
      .then(({ data }) => setCandidates(Array.isArray(data) ? data : []))
      .catch((err) => toast(err.message || 'Could not load the candidates.', 'error'));
  }, [by, agencyId, companyId, toast]);

  // With a company picked, which local agencies sent it somebody.
  const companyAgencies = useMemo(
    () =>
      by !== 'company'
        ? []
        : Array.from(new Map(candidates.map((c) => [c.agencyId, c.agencyName || c.agencyId])).entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [by, candidates]
  );

  const term = search.trim().toLowerCase();
  const choices = candidates.filter(
    (c) =>
      (by !== 'company' || !agencyId || c.agencyId === agencyId) &&
      (!term || [c.name, c.passportNo, c.nicNo].some((v) => String(v || '').toLowerCase().includes(term)))
  );

  useEffect(() => {
    setReport(null);
    if (!candidateId) return;
    setLoading(true);
    candidateApi
      .candidateHistory(candidateId)
      .then(({ data }) => setReport(data))
      .catch((err) => toast(err.message || 'Could not make the report.', 'error'))
      .finally(() => setLoading(false));
  }, [candidateId, toast]);

  const switchBy = (next) => {
    setBy(next);
    setAgencyId('');
    setCompanyId('');
    setReport(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Candidate history report"
          subtitle="Choose a local agency, or a foreign company and then the agency, then the candidate."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="historyBy" className="field-label">
              Find by
            </label>
            <select id="historyBy" value={by} onChange={(e) => switchBy(e.target.value)} className="field-input">
              <option value="agency">Local agency</option>
              <option value="company">Foreign company</option>
            </select>
          </div>

          {by === 'company' && (
            <div>
              <label htmlFor="historyCompany" className="field-label">
                Foreign company
              </label>
              <select
                id="historyCompany"
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value);
                  setAgencyId('');
                }}
                className="field-input"
              >
                <option value="">Select...</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="historyAgency" className="field-label">
              Local agency
            </label>
            <select
              id="historyAgency"
              value={agencyId}
              onChange={(e) => setAgencyId(e.target.value)}
              disabled={by === 'company' && !companyId}
              className="field-input"
            >
              <option value="">{by === 'company' ? 'All agencies' : 'Select...'}</option>
              {(by === 'company' ? companyAgencies : locals).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className={by === 'company' ? '' : 'lg:col-span-2'}>
            <label htmlFor="historyCandidate" className="field-label">
              Candidate
            </label>
            <div className="flex gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, passport, NIC"
                aria-label="Narrow the candidates"
                className="field-input w-40"
              />
              <select
                id="historyCandidate"
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                disabled={choices.length === 0}
                className="field-input min-w-0 flex-1"
              >
                <option value="">{choices.length ? 'Select...' : 'No candidates'}</option>
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.passportNo}
                    {c.nicNo ? ' · ' + c.nicNo : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardBody>
      </Card>

      {loading && <p className="text-sm text-gray-500">Making the report...</p>}
      {report && <HistoryPdf report={report} />}
    </div>
  );
}
