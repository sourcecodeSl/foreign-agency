import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { IconDocument, IconEdit, IconEye, IconPlus, IconTrash } from '../../components/ui/Icons';
import { agreementApi } from '../../lib/api';
import { alertError, confirmAction } from '../../lib/alert';
import { formatDate } from '../candidates/shared';
import { openTemplatePdf } from './Agreements';

/** Changes the heading companies start from; agreements already started keep theirs. */
function RenameModal({ template, onClose, onSaved }) {
  const { toast } = useToast();
  const [name, setName] = useState(template.name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (name.trim().length < 3) {
      setError('Name the agreement with at least 3 characters.');
      return;
    }
    setBusy(true);
    try {
      const { message } = await agreementApi.renameTemplate(template.id, name.trim());
      toast(message || 'Heading changed.');
      onSaved();
    } catch (err) {
      setError(err.errors?.name ? [].concat(err.errors.name)[0] : '');
      alertError(err.message || 'Could not change the heading.', 'Not saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Change the heading"
      subtitle="Every foreign company starting an agreement from this PDF gets this heading by default."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Save heading
          </Button>
        </>
      }
    >
      <Input
        label="Heading"
        name="renameTemplate"
        required
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError('');
        }}
        error={error}
      />
    </Modal>
  );
}

/**
 * The agreement PDFs the admin side keeps for every foreign company.
 *
 * A company picks one under "Use a saved PDF" instead of uploading its own.
 * The name given here is the heading its agreement starts with - the same
 * for a company that signs up later - and the company changes it only when
 * it needs to.
 */
export default function AdminAgreementPdfs() {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [templates, setTemplates] = useState(null);
  const [layouts, setLayouts] = useState([]);
  const [name, setName] = useState('');
  const [layout, setLayout] = useState('');
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await agreementApi.templates();
      setLayouts(data.layouts || []);
      setTemplates((data.templates || []).filter((t) => t.saved));
    } catch (err) {
      toast(err.message || 'Could not load the agreement PDFs.', 'error');
      setTemplates([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // One layout on offer means there is nothing to choose.
  useEffect(() => {
    if (layouts.length === 1) setLayout(layouts[0].key);
  }, [layouts]);

  const upload = async (e) => {
    e.preventDefault();
    const found = {};
    if (name.trim().length < 3) found.name = 'Name the agreement - it is the heading companies start with.';
    if (!layout) found.layout = 'Choose which agreement this is.';
    if (!file) found.file = 'Choose the PDF.';
    else if (!/\.pdf$/i.test(file.name)) found.file = 'Upload the agreement as a PDF.';
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const { message } = await agreementApi.uploadTemplate({ name: name.trim(), layout, file, saved: true });
      toast(message || 'Agreement PDF saved.');
      setName('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) {
      if (err.errors) setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, [].concat(v)[0]])));
      alertError(err.message || 'Could not upload the PDF.', 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (template) => {
    const sure = await confirmAction({
      title: 'Remove ' + template.name + '?',
      text: 'Foreign companies can no longer pick it. Agreements already started from it are kept.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!sure) return;
    try {
      const { message } = await agreementApi.removeTemplate(template.id);
      toast(message || 'Removed.');
      load();
    } catch (err) {
      alertError(err.message || 'Could not remove it.', 'Not removed');
    }
  };

  return (
    <Card>
      <CardHeader
        title="Agreement PDFs for foreign companies"
        subtitle={'Foreign companies pick these under "Use a saved PDF". The name is the heading their agreement starts with; they change it only if they need to.'}
      />
      <form onSubmit={upload} noValidate>
        <CardBody className="grid gap-5 sm:grid-cols-2">
          <Input
            label="Name (heading)"
            name="adminTemplateName"
            required
            placeholder="SEC Construction - Sri Lanka 2025"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            error={errors.name}
          />

          {layouts.length !== 1 && (
            <div>
              <label htmlFor="adminTemplateLayout" className="field-label">
                Agreement <span className="text-red-500">*</span>
              </label>
              <select
                id="adminTemplateLayout"
                value={layout}
                onChange={(e) => setLayout(e.target.value)}
                className={'field-input ' + (errors.layout ? 'field-input-error' : '')}
              >
                <option value="">Select...</option>
                {layouts.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.name}
                  </option>
                ))}
              </select>
              {errors.layout && <p className="field-error">{errors.layout}</p>}
            </div>
          )}

          <div>
            <label htmlFor="adminTemplateFile" className="field-label">
              PDF <span className="text-red-500">*</span>
            </label>
            <input
              ref={fileRef}
              id="adminTemplateFile"
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setErrors((prev) => ({ ...prev, file: undefined }));
              }}
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
            />
            {errors.file && <p className="field-error">{errors.file}</p>}
          </div>

          <div className="flex items-end sm:col-span-2">
            <Button type="submit" icon={IconPlus} loading={busy}>
              Upload PDF
            </Button>
          </div>
        </CardBody>
      </form>

      {templates === null ? (
        <p className="border-t border-gray-100 px-5 py-4 text-sm text-gray-500">Loading...</p>
      ) : templates.length === 0 ? (
        <p className="border-t border-gray-100 px-5 py-4 text-sm text-gray-500">
          No agreement PDF yet. Companies only see the ones uploaded here.
        </p>
      ) : (
        <ul className="border-t border-gray-100">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3.5 last:border-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <IconDocument className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{t.name}</p>
                <p className="text-xs text-gray-500">
                  {t.originalName} · uploaded {formatDate(t.uploadedAt)}
                  {t.agreements ? ' · ' + t.agreements + ' started from it' : ''}
                </p>
              </div>
              <Button size="sm" variant="secondary" icon={IconEye} onClick={() => openTemplatePdf(t.id, { name: t.name, heading: t.heading })}>
                View
              </Button>
              <Button size="sm" variant="secondary" icon={IconEdit} onClick={() => setRenaming(t)}>
                Change heading
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={IconTrash}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => remove(t)}
                aria-label={'Remove ' + t.name}
              />
            </li>
          ))}
        </ul>
      )}

      {renaming && (
        <RenameModal
          template={renaming}
          onClose={() => setRenaming(null)}
          onSaved={() => {
            setRenaming(null);
            load();
          }}
        />
      )}
    </Card>
  );
}
