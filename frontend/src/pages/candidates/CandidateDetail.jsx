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
import Modal from '../../components/ui/Modal';
import { candidateApi } from '../../lib/api';
import { useAuth, isGlobalRole } from '../../context/AuthContext';

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
          <p className="text-sm font-medium text-gray-900">{type.label}</p>
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

  // A cross-agency role reviews the file; it does not attach or submit.
  const readOnly = isGlobalRole(admin?.roleSlug);

  const [candidate, setCandidate] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [required, setRequired] = useState([]);
  const [missing, setMissing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [zipping, setZipping] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [detail, docs] = await Promise.all([
        candidateApi.get(id),
        candidateApi.documents(id),
      ]);
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
    setDeleting(true);
    try {
      await candidateApi.remove(id);
      toast(candidate.name + ' has been removed.');
      navigate('/candidates');
    } catch (err) {
      toast(err.message || 'Could not remove the candidate.', 'error');
      setDeleting(false);
    }
  };

  const handleSubmit = async () => {
    try {
      await candidateApi.updateStatus(id, 'submitted');
      toast('Candidate submitted for review.');
      load();
    } catch (err) {
      toast(err.message || 'Could not submit.', 'error');
    }
  };

  if (loading) {
    return <p className="py-16 text-center text-sm text-gray-500">Loading candidate...</p>;
  }
  if (!candidate) return null;

  // Group every upload under its type, newest first.
  const byType = {};
  for (const doc of documents) {
    (byType[doc.type] ||= []).push(doc);
  }

  const uploadedCount = required.length - missing.length;
  const complete = missing.length === 0;

  return (
    <div className="space-y-6">
      {/* --- details --- */}
      <Card>
        <CardHeader
          title={candidate.name}
          subtitle={'Passport ' + candidate.passportNo + (candidate.nicNo ? ' · NIC ' + candidate.nicNo : '')}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[candidate.status] || 'gray'} dot>
                {candidate.status}
              </Badge>
              <Button
                variant="ghost"
                icon={IconTrash}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setConfirmDelete(true)}
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
              ['Mobile', candidate.mobile],
              ['Email', candidate.email || '—'],
              ['Registered', candidate.createdAt],
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

      {/* --- documents --- */}
      <Card>
        <CardHeader
          title="Documents"
          subtitle={
            readOnly
              ? 'Filed by the agency. Every version is kept, so nothing here was ever replaced.'
              : 'Attaching a file never replaces an older one — every version is kept.'
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={
                  'rounded-full px-2.5 py-1 text-xs font-semibold ' +
                  (complete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')
                }
              >
                {uploadedCount} / {required.length} attached
              </span>
              <Button
                variant="secondary"
                loading={zipping}
                disabled={uploadedCount === 0}
                onClick={handleDownloadAll}
              >
                Download all (ZIP)
              </Button>
              {!readOnly && complete && candidate.status === 'draft' && (
                <Button onClick={handleSubmit}>Submit for review</Button>
              )}
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
              readOnly={readOnly}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-gray-200 px-5 py-3 text-xs text-gray-500">
          <IconUsers className="h-4 w-4 text-gray-400" />
          The ZIP contains one folder per document type, holding the latest file of each.
        </div>
      </Card>

      <Modal
        open={confirmDelete}
        title={'Remove ' + candidate.name + '?'}
        subtitle="The candidate no longer appears in the register."
        onClose={() => (deleting ? null : setConfirmDelete(false))}
        footer={
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
            <Button size="sm" variant="danger" loading={deleting} onClick={handleDelete}>
              Remove Candidate
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Passport{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-900">
            {candidate.passportNo}
          </code>{' '}
          is removed from the register. The {uploadedCount} attached document
          {uploadedCount === 1 ? '' : 's'} stay on the server, so the record can be restored if this
          was a mistake.
        </p>
      </Modal>
    </div>
  );
}
