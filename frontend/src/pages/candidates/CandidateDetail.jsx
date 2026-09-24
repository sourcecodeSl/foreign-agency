import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import {
  IconUsers,
  IconCheck,
  IconPlus,
  IconRefresh,
  IconChevronDown,
  IconTrash,
} from '../../components/ui/Icons';
import Switch from '../../components/ui/Switch';
import { PageLoader } from '../../components/ui/Spinner';
import { candidateApi } from '../../lib/api';
import { confirmAction, escapeHtml } from '../../lib/alert';
import { useAuth, isGlobalRole } from '../../context/AuthContext';
import { SourceTag, formatDate, isReviewer, isSettled, submitState } from './shared';
import PoliceReport from './PoliceReport';
import { RegistrationsCard, OtherRegistrations } from './CategoryResults';

const STATUS_TONE = { draft: 'gray', submitted: 'blue', approved: 'green', rejected: 'red' };

const formatSize = (bytes) => {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb < 1024 ? Math.round(kb) + ' KB' : (kb / 1024).toFixed(1) + ' MB';
};

/**
 * One row per required document type.
 *
 * Uploads are append-only: adding a file never replaces what is there, so the
 * row shows the current file and can expand to the full history.
 */
function DocumentRow({ type, versions, onUpload, onDownload, uploading, readOnly }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  const current = versions[0]; // the API returns newest first
  const older = versions.slice(1);
  // The row exists but its file is gone from the server, so it cannot be
  // downloaded and has to be attached again.
  const broken = current && current.available === false;

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
        <span
          className={
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
            (broken
              ? 'bg-red-50 text-red-600'
              : current
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-gray-100 text-gray-400')
          }
        >
          {broken ? '!' : current ? <IconCheck className="h-4 w-4" /> : '—'}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">
            {type.label}
            {/* Welcome, but the profile is submitted without it. */}
            {type.required === false && (
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                Optional
              </span>
            )}
          </p>
          {broken ? (
            <p className="truncate text-xs text-red-600">
              {current.originalName} — file missing on the server, attach it again
            </p>
          ) : current ? (
            <p className="truncate text-xs text-gray-500">
              {current.originalName} · {formatSize(current.sizeBytes)} · {current.uploadedAt}
            </p>
          ) : (
            <p className="text-xs text-gray-400">Not uploaded yet</p>
          )}
        </div>

        {versions.length > 1 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
          >
            {versions.length} versions
            <IconChevronDown className={'h-3.5 w-3.5 transition ' + (open ? 'rotate-180' : '')} />
          </button>
        )}

        {current && !broken && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDownload(current.id, current.originalName)}
          >
            Download
          </Button>
        )}

        {/* Attaching is the owning agency's job; a reviewer only reads. */}
        {!readOnly && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(type.value, file);
                e.target.value = ''; // allow re-picking the same file
              }}
            />
            <Button
              size="sm"
              variant={current ? 'secondary' : 'primary'}
              icon={current ? IconRefresh : IconPlus}
              loading={uploading === type.value}
              onClick={() => inputRef.current?.click()}
            >
              {current ? 'Add new' : 'Attach'}
            </Button>
          </>
        )}
      </div>

      {/* Version history - nothing is ever deleted, so older files stay readable. */}
      {open && older.length > 0 && (
        <ul className="space-y-1 bg-gray-50 px-5 py-3">
          {older.map((doc, index) => (
            <li key={doc.id} className="flex items-center gap-3 text-xs text-gray-600">
              <span className="w-16 shrink-0 text-gray-400">v{older.length - index}</span>
              <span className="min-w-0 flex-1 truncate">{doc.originalName}</span>
              <span className="shrink-0 text-gray-400">{doc.uploadedAt}</span>
              {doc.available === false ? (
                <span className="shrink-0 text-red-500">file missing</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onDownload(doc.id, doc.originalName)}
                  className="shrink-0 font-medium text-primary-600 hover:text-primary-700"
                >
                  Download
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CandidateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { admin } = useAuth();

  // The agency switches the pass and attaches; a coordinator (or the Main
  // Admin) checks the documents and submits the profile.
  const isAgency = !isGlobalRole(admin?.roleSlug);
  const reviewer = isReviewer(admin?.roleSlug);

  const [candidate, setCandidate] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [required, setRequired] = useState([]);
  const [missing, setMissing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [passing, setPassing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [zipping, setZipping] = useState(false);

  // A foreign company the candidate is registered with - one that tests them.
  const isTestingCompany =
    admin?.agency?.type === 'foreign' &&
    (candidate?.registrations || []).some((r) => r.company.id === admin?.agency?.id);
  // The company holding the pass, once there is one.
  const holdsPass = isTestingCompany && admin?.agency?.id === candidate?.company?.id;
  // The company passes a candidate by recording the result against a job
  // category (below), never by the bare switch; the Main Admin keeps it.
  const canPass = admin?.roleSlug === 'main_admin';
  // The local agency that owns the file registers it with companies.
  const ownsFile = isAgency && admin?.agency?.id === candidate?.agencyId;
  // A local agency login, not a foreign company reading the file.
  const localViewer = isAgency && admin?.agency?.type !== 'foreign';
  // Blocking the same person's other registrations: whoever holds the pass.
  const canBlock = reviewer || holdsPass;

  const load = useCallback(async () => {
    try {
      const [detail, docs] = await Promise.all([candidateApi.get(id), candidateApi.documents(id)]);
      setCandidate(detail.data);
      setDocuments(docs.data.documents);
      setRequired(docs.data.required);
      setMissing(docs.data.missing);
    } catch (err) {
      toast(err.message || 'Could not load this candidate.', 'error');
      if (err.status === 403 || err.status === 404) navigate('/candidates');
    } finally {
      setLoading(false);
    }
  }, [id, toast, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (type, file) => {
    setUploading(type);
    try {
      const res = await candidateApi.upload(id, type, file);
      toast(res.message || 'Document uploaded.');
      load();
    } catch (err) {
      toast(err.errors?.file || err.message || 'Upload failed.', 'error');
    } finally {
      setUploading(null);
    }
  };

  const handleDownloadAll = async () => {
    setZipping(true);
    try {
      const name = await candidateApi.downloadAll(id, candidate?.name);
      toast('Downloaded ' + name);
    } catch (err) {
      toast(err.message || 'Could not build the archive.', 'error');
    } finally {
      setZipping(false);
    }
  };

  const handleDownloadOne = async (documentId, name) => {
    try {
      await candidateApi.downloadOne(id, documentId, name);
    } catch (err) {
      toast(err.message || 'Download failed.', 'error');
    }
  };

  const handleDelete = async () => {
    const attachedCount = new Set(documents.map((doc) => doc.type)).size;
    const sure = await confirmAction({
      title: 'Remove ' + candidate.name + '?',
      html:
        'Passport <code>' +
        escapeHtml(candidate.passportNo) +
        '</code> is removed from the register. ' +
        'The ' +
        attachedCount +
        ' attached document' +
        (attachedCount === 1 ? '' : 's') +
        ' stay on the server, so the record can be restored if this was a mistake.',
      confirmText: 'Remove Candidate',
      danger: true,
    });
    if (!sure) return;

    try {
      await candidateApi.remove(id);
      toast(candidate.name + ' has been removed.');
      navigate('/candidates');
    } catch (err) {
      toast(err.message || 'Could not remove the candidate.', 'error');
    }
  };

  const handlePass = async (passed) => {
    setPassing(true);
    try {
      const res = await candidateApi.setPassed(id, passed);
      toast(res.message || (passed ? 'Marked as passed.' : 'No longer marked as passed.'));
      load();
    } catch (err) {
      toast(err.message || 'Could not change the pass.', 'error');
    } finally {
      setPassing(false);
    }
  };

  // The coordinator's switch: on submits the profile, off sends it back to
  // the agency as a draft.
  const handleSubmit = async (submit) => {
    setSubmitting(true);
    try {
      const res = await candidateApi.updateStatus(id, submit ? 'submitted' : 'draft');
      toast(res.message || (submit ? 'Profile submitted.' : 'Profile sent back to the agency.'));
      load();
    } catch (err) {
      toast(err.message || 'Could not change the submission.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <PageLoader label="Loading candidate..." />;
  }
  if (!candidate) return null;

  // Group every upload under its type, newest first.
  const byType = {};
  for (const doc of documents) {
    (byType[doc.type] ||= []).push(doc);
  }

  // Counted against the required documents only; an optional one (the NIC
  // copy) never holds the profile back.
  const requiredCount = required.filter((type) => type.required !== false).length;
  const uploadedCount = requiredCount - missing.length;
  const complete = missing.length === 0;

  const passed = candidate.poolStatus === 'passed';
  // Valid when registered, but a passport can run out while the file is open.
  const passportExpired =
    Boolean(candidate.passportExpiry) &&
    candidate.passportExpiry < new Date().toISOString().slice(0, 10);
  const settled = isSettled(candidate);
  // Only the agency attaches, and only while the file is open: passed, and
  // not yet submitted by the coordinator.
  const canAttach = isAgency && Boolean(candidate.documentsOpen);
  // Whoever works the file keeps the police report up to date; a blocked file
  // is shut to everybody, and the read-only auditor only reads.
  const canEditPolice = !candidate.blocked && admin?.roleSlug !== 'auditor';

  // The submit switch opens only once a passed candidate's documents are all in.
  const submit = submitState(candidate, missing.length);
  const submittedOn = candidate.submittedAt
    ? 'Submitted on ' +
      formatDate(candidate.submittedAt) +
      (candidate.submittedBy ? ' by ' + candidate.submittedBy : '') +
      '.'
    : 'Submitted.';
  let submitNote;
  if (reviewer) {
    submitNote =
      submit.submitted && !submit.locked
        ? submittedOn + ' Switch off to send it back to the agency.'
        : submit.reason;
  } else if (submit.submitted) {
    submitNote = submittedOn;
  } else if (passed && complete) {
    submitNote = 'Every document is in. A coordinator checks them and submits the profile.';
  } else {
    submitNote =
      'A coordinator submits the profile once the candidate has passed and every document is attached.';
  }

  // Why the switch is where it is, and why it may not move.
  let passNote;
  let passLocked = false;
  if (passed && candidate.lockedCompany) {
    passNote = 'Passed a skill test with ' + candidate.lockedCompany.name + '.';
    passLocked = true;
  } else if (passed) {
    passNote = 'Passed' + (candidate.passedAt ? ' on ' + formatDate(candidate.passedAt) : '') + '.';
    passLocked = settled;
  } else if (candidate.blocked) {
    passNote = 'This person has already passed with another agency, so they cannot be passed here.';
    passLocked = true;
  } else if (candidate.poolStatus === 'testing') {
    passNote = 'A skill test is open for this candidate. The coordinator records its result.';
    passLocked = true;
  } else if (isTestingCompany) {
    passNote = 'Record the result under Test results by job category. A pass there becomes their profession.';
  } else {
    passNote = canPass
      ? 'Switch on once the candidate has passed your test. Until then no documents are attached, and they may also register with other agencies.'
      : 'Not passed yet. ' +
        (candidate.company?.name || 'The foreign company they are registered for') +
        ' records the result.';
  }
  if (passed) {
    if (settled) passNote += ' The coordinator has submitted the profile.';
    else if (candidate.documentsOpen) passNote += ' Documents are open, and no other agency can register this candidate.';
    else passNote += ' No other agency can register this candidate. Documents open once the police report is applied for.';
  }

  let documentsNote;
  if (candidate.blocked) {
    documentsNote = 'This file is blocked, so no documents can be attached.';
  } else if (!isAgency) {
    documentsNote =
      'Attached by the agency. Every version is kept, so nothing here was ever replaced.';
  } else if (!passed) {
    documentsNote = canPass
      ? 'Documents are attached once the candidate has passed. Switch on Passed above first.'
      : 'Documents are attached once the candidate has passed their test.';
  } else if (candidate.policeReport?.status !== 'applied' && candidate.policeReport?.status !== 'received') {
    documentsNote =
      'Passed, but the police report is not applied for yet. Documents open once it is applied for or received.';
  } else if (settled) {
    documentsNote =
      'The coordinator has checked these documents and submitted the profile, so they are settled.';
  } else {
    documentsNote = 'Attaching a file never replaces an older one — every version is kept.';
  }

  return (
    <div className="space-y-6">
      {/* Passed with another agency under the same NIC: nothing more happens here. */}
      {candidate.blocked && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800"
        >
          <p className="font-semibold">This candidate is blocked</p>
          <p className="mt-1">
            {candidate.registrationBlocked
              ? 'The person with NIC ' +
                candidate.nicNo +
                ' has passed with ' +
                (candidate.registrationBlocked.company || 'another company') +
                ', which blocked this registration on ' +
                formatDate(candidate.registrationBlocked.at) +
                '. No result can be recorded here.'
              : 'The person with NIC ' +
                candidate.nicNo +
                ' has already passed with ' +
                (candidate.blockedBy || 'another agency') +
                '. This file cannot be passed, edited or given documents while that pass stands.'}
          </p>
        </div>
      )}

      {/* Passed here, but the same NIC is registered for another company. */}
      <OtherRegistrations candidate={candidate} canBlock={canBlock} onChanged={load} />

      {/* Short validity never blocks anything, but it is never hidden either. */}
      {candidate.passportWarning && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900"
        >
          <p className="font-semibold">Check the passport</p>
          <p className="mt-1">
            {candidate.passportWarning} Passport {candidate.passportNo} is on this file.
          </p>
        </div>
      )}

      {/* --- details --- */}
      <Card>
        <CardHeader
          title={candidate.name}
          subtitle={
            'Passport ' +
            candidate.passportNo +
            (candidate.nicNo ? ' · NIC ' + candidate.nicNo : '')
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              {candidate.blocked ? (
                <Badge tone="red" dot>
                  Blocked
                </Badge>
              ) : (
                <Badge tone={STATUS_TONE[candidate.status] || 'gray'} dot>
                  {candidate.status}
                </Badge>
              )}
              <Button
                variant="ghost"
                icon={IconTrash}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={handleDelete}
              >
                Delete
              </Button>
              <Button variant="secondary" onClick={() => navigate('/candidates')}>
                Back
              </Button>
            </div>
          }
        />
        <CardBody>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['First name', candidate.firstName || '—'],
              ['Last name', candidate.lastName || '—'],
              ["Father's name", candidate.fatherName || '—'],
              [
                'Date of birth',
                candidate.dateOfBirth
                  ? formatDate(candidate.dateOfBirth) +
                    (candidate.age != null ? ' · ' + candidate.age + ' years' : '')
                  : '—',
              ],
              [
                'Passport validity',
                candidate.passportExpiry ? (
                  <span
                    className={candidate.passportWarning ? 'font-medium text-amber-700' : undefined}
                  >
                    {formatDate(candidate.passportExpiry)}
                    {passportExpired ? ' · expired' : ''}
                  </span>
                ) : (
                  '—'
                ),
              ],
              [
                'Registered for',
                candidate.registrations?.length
                  ? candidate.registrations.map((r) => r.company.name).join(', ')
                  : candidate.company?.name || '—',
              ],
              ['Profession', candidate.profession || '—'],
              ['Test results', candidate.testResults || '—'],
              ['Mobile', candidate.mobile],
              ['Email', candidate.email || '—'],
              ['Registered', formatDate(candidate.createdAt)],
              ['Added by', <SourceTag registeredBy={candidate.registeredBy} />],
              [
                'Job categories',
                // The local agency sees them under each company, so a second
                // company's categories never get lost among the first's.
                localViewer && candidate.registrations?.length ? (
                  <ul className="space-y-1">
                    {candidate.registrations.map((registration) => (
                      <li
                        key={registration.id}
                        className={registration.state === 'void' ? 'text-gray-400' : undefined}
                      >
                        <span className="font-medium">{registration.company.name}:</span>{' '}
                        {registration.jobRoles.map((role) => role.name).join(', ') || '—'}
                        {registration.state === 'void' ? ' (not valid)' : ''}
                      </li>
                    ))}
                  </ul>
                ) : candidate.jobRoles?.length ? (
                  candidate.jobRoles.map((role) => role.name).join(', ')
                ) : (
                  candidate.jobRole || '—'
                ),
              ],
              ['Test index No', candidate.testIndexNo || '—'],
              ...(candidate.submittedAt
                ? [
                    [
                      'Profile submitted',
                      formatDate(candidate.submittedAt) +
                        (candidate.submittedBy ? ' by ' + candidate.submittedBy : ''),
                    ],
                  ]
                : []),
              ['Address', candidate.address],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {label}
                </dt>
                <dd className="mt-1 text-sm text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      {/* --- the police report: documents wait for it as well as the pass --- */}
      <PoliceReport candidate={candidate} readOnly={!canEditPolice} onChanged={load} />

      {/* --- each foreign company, its job categories and their results --- */}
      <RegistrationsCard
        candidate={candidate}
        admin={admin}
        reviewer={reviewer}
        canManage={ownsFile || reviewer}
        onChanged={load}
      />

      {/* --- the pass: the company's switch, everyone else reads it --- */}
      <Card>
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">Passed</p>
            <p className="mt-0.5 text-xs text-gray-500">{passNote}</p>
          </div>
          {canPass ? (
            <Switch
              checked={passed}
              onChange={handlePass}
              loading={passing}
              disabled={passLocked}
              label="Passed"
            />
          ) : (
            <Badge tone={passed ? 'green' : 'gray'} dot>
              {passed ? 'Passed' : 'Not passed'}
            </Badge>
          )}
        </div>

        {/* --- then the submission: the coordinator's switch --- */}
        <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">Profile submitted</p>
            <p className="mt-0.5 text-xs text-gray-500">{submitNote}</p>
          </div>
          {reviewer ? (
            <Switch
              checked={submit.submitted}
              onChange={handleSubmit}
              loading={submitting}
              disabled={submit.locked}
              label="Profile submitted"
              title={submit.reason}
            />
          ) : (
            <Badge tone={submit.submitted ? 'blue' : 'gray'} dot>
              {submit.submitted ? 'Submitted' : 'Not submitted'}
            </Badge>
          )}
        </div>
      </Card>

      {/* --- documents --- */}
      <Card>
        <CardHeader
          title="Documents"
          subtitle={documentsNote}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={
                  'rounded-full px-2.5 py-1 text-xs font-semibold ' +
                  (complete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')
                }
              >
                {uploadedCount} / {requiredCount} attached
              </span>
              <Button
                variant="secondary"
                loading={zipping}
                disabled={documents.length === 0}
                onClick={handleDownloadAll}
              >
                Download all (ZIP)
              </Button>
            </div>
          }
        />

        <div>
          {required.map((type) => (
            <DocumentRow
              key={type.value}
              type={type}
              versions={byType[type.value] || []}
              uploading={uploading}
              onUpload={handleUpload}
              onDownload={handleDownloadOne}
              readOnly={!canAttach}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-gray-200 px-5 py-3 text-xs text-gray-500">
          <IconUsers className="h-4 w-4 text-gray-400" />
          The ZIP contains one folder per document type, holding the latest file of each.
        </div>
      </Card>
    </div>
  );
}
