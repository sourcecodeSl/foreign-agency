import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { PageLoader } from '../../components/ui/Spinner';
import { IconDocument, IconPlus } from '../../components/ui/Icons';
import { testLineApi } from '../../lib/api';
import { notify } from '../../lib/alert';

const MAX_LINE = 1000;

function lineTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * A candidate's test document, line by line in the order written.
 *
 * The foreign company testing the candidate adds lines here - only adds:
 * nothing written is changed or taken back, and saving tells the local
 * agency. The agency and the admin side only read. Whether this login may
 * add is the server's answer (`canAdd`), not worked out here.
 */
export default function TestDocument({ candidate, onClose }) {
  const [lines, setLines] = useState([]);
  const [canAdd, setCanAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    testLineApi
      .list(candidate.id)
      .then(({ data }) => {
        if (!alive) return;
        setLines(data.lines || []);
        setCanAdd(Boolean(data.canAdd));
      })
      .catch((e) => alive && setError(e.message || 'Could not open the test document.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [candidate.id]);

  const save = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) {
      setFieldError('Write the test line first.');
      return;
    }
    setSaving(true);
    setFieldError('');
    try {
      const res = await testLineApi.add(candidate.id, body);
      setLines((prev) => [...prev, res.data]);
      setDraft('');
      notify(res.message || 'Test line saved.');
    } catch (err) {
      setFieldError(err.errors?.body?.[0] || err.errors?.body || err.message || 'Could not save the line.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Test document"
      subtitle={candidate.name}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading ? (
        <PageLoader label="Opening the test document..." className="py-8" />
      ) : error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : (
        <div className="space-y-4">
          {/* The document itself, one line after another */}
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
              <IconDocument className="h-4 w-4 text-gray-500" />
              <p className="text-sm font-semibold text-gray-900">
                {lines.length} {lines.length === 1 ? 'line' : 'lines'}
              </p>
              {!canAdd && <span className="ml-auto text-xs text-gray-500">Read only</span>}
            </div>

            {lines.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">
                {canAdd ? 'Nothing written yet. Add the first line below.' : 'The company has not written anything yet.'}
              </p>
            ) : (
              <ol className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
                {lines.map((line, i) => (
                  <li key={line.id} className="flex gap-3 px-4 py-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap break-words text-sm text-gray-900">{line.body}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {line.company?.name || 'Foreign company'}
                        {line.recordedBy ? ' · ' + line.recordedBy : ''} · {lineTime(line.at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* The company adds; nothing is edited or removed */}
          {canAdd && (
            <form onSubmit={save} className="space-y-2">
              <label htmlFor="test-line" className="block text-sm font-medium text-gray-700">
                New test line
              </label>
              <textarea
                id="test-line"
                rows={3}
                value={draft}
                maxLength={MAX_LINE}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (fieldError) setFieldError('');
                }}
                placeholder="e.g. Practical: tiling a 2 m wall - 8/10"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400
                           focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
              />
              {fieldError && <p className="text-xs text-red-600">{fieldError}</p>}
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  A saved line cannot be changed. The candidate&apos;s agency is notified.
                </p>
                <Button type="submit" size="sm" icon={IconPlus} loading={saving}>
                  Save line
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
