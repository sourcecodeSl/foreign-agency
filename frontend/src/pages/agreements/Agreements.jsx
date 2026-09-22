import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useAuth, isGlobalRole } from '../../context/AuthContext';
import { PageLoader } from '../../components/ui/Spinner';
import { IconEdit, IconPlus, IconTrash } from '../../components/ui/Icons';
import { agreementApi } from '../../lib/api';
import { StatusBadge } from './CompanyAgreement';
import ForeignCompanyInbox from './ForeignCompanyInbox';
import LocalAgencyAgreements from './LocalAgencyAgreements';
import { showPdf } from './PdfViewer';
import { alertError, confirmAction } from '../../lib/alert';
import { formatDate } from '../candidates/shared';

/** A file name from an agreement's title. */
const fileNameFor = (title, suffix) => (title || 'agreement').replace(/[\\/:*?"<>|]+/g, '-') + suffix + '.pdf';

/** An uploaded PDF, from the uploader's own list, in the viewer. */
export const openTemplatePdf = (templateId) =>
  showPdf({
    title: 'Original agreement',
    load: async () => ({
      url: await agreementApi.templateFileUrl(templateId),
      fileName: 'agreement.pdf',
    }),
  });

/**
 * A foreign company's agreement as one PDF: the original, every page, with
 * the saved values written onto its blanks in all three languages. Built
 * from what is saved each time, so it always matches the screen.
 */
async function filledPdf(agreementId) {
  const [{ data }, original, { fillAgreementPdf }] = await Promise.all([
    agreementApi.get(agreementId),
    agreementApi.fileBytes(agreementId),
    // pdf-lib is only fetched once somebody opens a PDF.
    import('../../lib/agreementPdf'),
  ]);
  // The seal and the signature, where the company has added them.
  const types = Object.keys(data.marks || {}).filter((type) => data.marks[type]);
  const blobs = await Promise.all(types.map((type) => agreementApi.markBlob(agreementId, type)));
  const pictures = Object.fromEntries(types.map((type, i) => [type, blobs[i]]));

  const bytes = await fillAgreementPdf(original, data.blanks, data.values, {
    boxes: data.markBoxes,
    pictures,
  });

  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    title: data.title,
  };
}

/** The filled agreement, in the viewer. */
export const openAgreementPdf = (agreementId) =>
  showPdf({
    title: 'Filled agreement',
    load: async () => {
      const { blob, title } = await filledPdf(agreementId);
      return {
        url: URL.createObjectURL(blob),
        fileName: fileNameFor(title, ' - filled'),
        title,
      };
    },
  });

/** The filled agreement, saved as a file. */
export async function downloadAgreementPdf(agreementId) {
  try {
    const { blob, title } = await filledPdf(agreementId);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileNameFor(title, ' - filled');
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    alertError(err.message || 'Could not make the PDF.', 'PDF not saved');
  }
}

/** A salary as typed, in NIS: digits with an optional comma and up to two decimals. */
export const parseSalary = (text) => {
  const clean = String(text).replace(/,/g, '').trim();
  return /^\d+(\.\d{1,2})?$/.test(clean) && Number(clean) > 0 ? Number(clean) : null;
};

/** The seal and the signature: pictures, printed at the foot of every page. */
export const MARKS = [
  { type: 'seal', label: 'Company seal' },
  { type: 'signature', label: 'Signature' },
];

const PICTURE = /\.(jpe?g|png|webp)$/i;

/** One picture to choose, with a preview of what was chosen. */
export function MarkPicker({ type, label, file, onPick, error, saved }) {
  const [preview, setPreview] = useState(null);
  // Unique per picker: the upload card and the edit card can be open together.
  const id = 'mark-' + type + useId();

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={(e) => onPick(e.target.files?.[0] || null)}
          className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
        />
        {preview && (
          <img
            src={preview}
            alt={label + ' chosen'}
            className="h-12 w-20 rounded border border-gray-200 object-contain"
          />
        )}
      </div>
      {error ? (
        <p className="field-error">{error}</p>
      ) : (
        <p className="mt-1.5 text-xs text-gray-500">
          {saved && !file ? 'Added - choose another to replace it.' : 'JPG, PNG or WEBP.'}
        </p>
      )}
    </div>
  );
}

/** Checks a chosen seal or signature before it is sent. */
export const markError = (file) =>
  file && !PICTURE.test(file.name) ? 'Choose a JPG, PNG or WEBP picture.' : undefined;

/**
 * A foreign company's upload: the PDF first, then its monthly salary, seal
 * and signature.
 *
 * Upload sends the PDF, which becomes the company's agreement with the
 * employer part filled. Save puts the salary on it - it takes the place of
 * the amount clause 3a prints, in all three languages - and the seal and
 * signature, printed on every page; then it opens the agreement.
 *
 * The PDF is either a new upload or one of the company's saved PDFs - the
 * agreement it uses every time, kept uploaded. One or the other, never both.
 */
function UploadCard({ layouts, savedPdfs = [], onSavedPdfsChanged, onSaved, subtitle }) {
  const { toast } = useToast();
  const inputRef = useRef(null);
  const keepRef = useRef(null);
  const [name, setName] = useState('');
  const [layout, setLayout] = useState('');
  const [source, setSource] = useState('new'); // 'new' | 'saved'
  const [file, setFile] = useState(null);
  const [savedId, setSavedId] = useState('');
  const [keepFile, setKeepFile] = useState(null);
  const [salary, setSalary] = useState('');
  const [pictures, setPictures] = useState({ seal: null, signature: null });
  const [uploaded, setUploaded] = useState(null); // { agreementId, name } once the PDF is in
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');

  // One layout on offer means there is nothing to choose.
  useEffect(() => {
    if (layouts.length === 1) setLayout(layouts[0].key);
  }, [layouts]);

  // The first saved PDF is picked until another is, or the picked one is removed.
  useEffect(() => {
    if (!savedPdfs.some((t) => String(t.id) === savedId)) {
      setSavedId(savedPdfs[0] ? String(savedPdfs[0].id) : '');
    }
  }, [savedPdfs, savedId]);

  const picked = source === 'saved' ? savedPdfs.find((t) => String(t.id) === savedId) : null;

  const chooseSource = (next) => {
    setSource(next);
    setErrors((prev) => ({ ...prev, file: undefined, layout: undefined }));
  };

  const upload = async (e) => {
    e.preventDefault();
    const found = {};
    if (name.trim().length < 3) found.name = 'Name the agreement.';
    if (source === 'saved') {
      if (!picked) found.file = 'Save a PDF here first, or upload a new one.';
    } else {
      if (!layout) found.layout = 'Choose which agreement this is.';
      if (!file) found.file = 'Choose the PDF.';
      else if (!/\.pdf$/i.test(file.name)) found.file = 'Upload the agreement as a PDF.';
    }
    setErrors(found);
    if (Object.keys(found).length) return;

    if (source === 'saved') {
      setBusy('upload');
      try {
        const { data, message } = await agreementApi.create(picked.id, name.trim());
        toast(message || 'Agreement created.');
        setUploaded({ agreementId: data.id, name: data.title });
        setName('');
      } catch (err) {
        if (err.errors) setErrors(err.errors);
        alertError(err.message || 'Could not start the agreement.', 'Not created');
      } finally {
        setBusy('');
      }
      return;
    }

    setBusy('upload');
    try {
      const { data, message } = await agreementApi.uploadTemplate({
        name: name.trim(),
        layout,
        file,
      });
      toast(message || 'Agreement uploaded.');
      setUploaded({ agreementId: data.agreementId, name: data.name });
      setName('');
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      alertError(err.message || 'Could not upload the agreement.', 'Upload failed');
    } finally {
      setBusy('');
    }
  };

  /** Keeps a PDF uploaded, to start agreements from without uploading it again. */
  const keep = async () => {
    const found = {};
    if (!layout) found.layout = 'Choose which agreement this is.';
    if (!keepFile) found.file = 'Choose the PDF to save.';
    else if (!/\.pdf$/i.test(keepFile.name)) found.file = 'Save the agreement as a PDF.';
    setErrors((prev) => ({
      ...prev,
      file: undefined,
      layout: undefined,
      ...found,
    }));
    if (Object.keys(found).length) return;

    const base = keepFile.name.replace(/\.pdf$/i, '').trim();
    setBusy('keep');
    try {
      const { data, message } = await agreementApi.uploadTemplate({
        name: base.length >= 3 ? base.slice(0, 150) : 'Saved agreement',
        layout,
        file: keepFile,
        saved: true,
      });
      toast(message || 'PDF saved.');
      setKeepFile(null);
      if (keepRef.current) keepRef.current.value = '';
      setSavedId(String(data.id));
      onSavedPdfsChanged?.();
    } catch (err) {
      if (err.errors) setErrors((prev) => ({ ...prev, ...err.errors }));
      alertError(err.message || 'Could not save the PDF.', 'Not saved');
    } finally {
      setBusy('');
    }
  };

  const forget = async () => {
    if (!picked) return;
    const sure = await confirmAction({
      title: 'Remove ' + picked.name + '?',
      text: 'It is taken off your saved PDFs. Agreements already started from it are kept.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!sure) return;
    try {
      const { message } = await agreementApi.removeTemplate(picked.id);
      toast(message || 'Removed.');
      onSavedPdfsChanged?.();
    } catch (err) {
      alertError(err.message || 'Could not remove it.', 'Not removed');
    }
  };

  const save = async () => {
    if (!uploaded) {
      alertError('Upload the agreement PDF first, then save its salary.', 'Not saved');
      return;
    }
    const amount = parseSalary(salary);
    const found = {
      salary: amount ? undefined : 'Enter the monthly salary in NIS, such as 6247.67.',
      seal: markError(pictures.seal),
      signature: markError(pictures.signature),
    };
    setErrors((prev) => ({ ...prev, ...found }));
    if (Object.values(found).some(Boolean)) return;

    setBusy('save');
    try {
      await agreementApi.setSalary(uploaded.agreementId, amount);
      for (const { type } of MARKS) {
        if (pictures[type]) await agreementApi.uploadMark(uploaded.agreementId, type, pictures[type]);
      }
      toast('Agreement saved.');
      onSaved(uploaded.agreementId);
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      alertError(err.message || 'Could not save the salary.', 'Not saved');
    } finally {
      setBusy('');
    }
  };

  return (
    <Card>
      <CardHeader title="Upload an agreement" subtitle={subtitle} />
      <form onSubmit={upload} noValidate>
        <CardBody className="grid gap-5 sm:grid-cols-2">
          <Input
            label="Name"
            name="templateName"
            required
            placeholder="SEC Construction - Sri Lanka 2025"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />

          {/* With one agreement on offer it is picked already; nothing to show. */}
          {layouts.length !== 1 && (
            <div>
              <label htmlFor="templateLayout" className="field-label">
                Agreement <span className="text-red-500">*</span>
              </label>
              <select
                id="templateLayout"
                // A saved PDF brings its own layout.
                value={picked ? picked.layout : layout}
                disabled={!!picked}
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
              {errors.layout ? (
                <p className="field-error">{errors.layout}</p>
              ) : (
                <p className="mt-1.5 text-xs text-gray-500">Which fields the PDF has to fill.</p>
              )}
            </div>
          )}

          <fieldset>
            <legend className="field-label">
              PDF <span className="text-red-500">*</span>
            </legend>
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              {[
                { id: 'new', label: 'Upload a new PDF' },
                { id: 'saved', label: 'Use a saved PDF' },
              ].map((option) => (
                <label
                  key={option.id}
                  htmlFor={'pdfSource-' + option.id}
                  className={
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ' +
                    (source === option.id
                      ? 'border-primary-400 bg-primary-50/60 text-gray-900 ring-1 ring-primary-200'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50')
                  }
                >
                  <input
                    id={'pdfSource-' + option.id}
                    type="radio"
                    name="pdfSource"
                    value={option.id}
                    checked={source === option.id}
                    onChange={() => chooseSource(option.id)}
                    className="h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  {option.label}
                </label>
              ))}
            </div>

            {source === 'saved' ? (
              <div className="space-y-3">
                {savedPdfs.length > 0 ? (
                  <div className="flex gap-2">
                    <select
                      id="savedPdf"
                      aria-label="Saved PDF"
                      value={savedId}
                      onChange={(e) => setSavedId(e.target.value)}
                      className="field-input"
                    >
                      {savedPdfs.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="secondary" icon={IconTrash} onClick={forget} disabled={!!busy}>
                      Remove
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No saved PDF yet. Save the agreement you use every time here.</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={keepRef}
                    id="keepFile"
                    type="file"
                    aria-label="PDF to save"
                    accept=".pdf,application/pdf"
                    onChange={(e) => setKeepFile(e.target.files?.[0] || null)}
                    className="block min-w-0 flex-1 text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={keep}
                    loading={busy === 'keep'}
                    disabled={!!busy || !keepFile}
                  >
                    Save PDF
                  </Button>
                </div>
              </div>
            ) : (
              <input
                ref={inputRef}
                id="templateFile"
                aria-label="PDF"
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
              />
            )}
            {errors.file ? (
              <p className="field-error">{errors.file}</p>
            ) : (
              uploaded && (
                <p className="mt-1.5 text-xs font-medium text-emerald-700">
                  {uploaded.name} {source === 'saved' ? 'started' : 'uploaded'} - enter its salary and save.
                </p>
              )
            )}
          </fieldset>

          <div>
            <label htmlFor="agreementSalary" className="field-label">
              Monthly salary (NIS) <span className="text-red-500">*</span>
            </label>
            <input
              id="agreementSalary"
              inputMode="decimal"
              placeholder="6,247.67"
              value={salary}
              onChange={(e) => {
                setSalary(e.target.value);
                setErrors((prev) => ({ ...prev, salary: undefined }));
              }}
              className={'field-input ' + (errors.salary ? 'field-input-error' : '')}
            />
            {errors.salary ? (
              <p className="field-error">{errors.salary}</p>
            ) : (
              <p className="mt-1.5 text-xs text-gray-500">
                Replaces the salary in clause 3a, with the amount in words, in all three languages.
              </p>
            )}
          </div>

          {MARKS.map(({ type, label }) => (
            <MarkPicker
              key={type}
              type={type}
              label={label}
              file={pictures[type]}
              error={errors[type]}
              onPick={(file) => {
                setPictures((prev) => ({ ...prev, [type]: file }));
                setErrors((prev) => ({ ...prev, [type]: markError(file) }));
              }}
            />
          ))}

          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <Button type="submit" icon={IconPlus} loading={busy === 'upload'} disabled={!!busy}>
              {source === 'saved' ? 'Use saved PDF' : 'Upload'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={save}
              loading={busy === 'save'}
              disabled={!!busy || !uploaded}
            >
              Save
            </Button>
          </div>
        </CardBody>
      </form>
    </Card>
  );
}

/**
 * The company's edit of an agreement it uploaded, at any stage - even once
 * sent: its name, monthly salary, seal and signature. The filled PDF is built
 * from what is saved, so every side sees the change.
 */
function EditAgreementModal({ agreement, onClose, onSaved }) {
  const { toast } = useToast();
  const [title, setTitle] = useState(agreement.title);
  const [salary, setSalary] = useState(agreement.salaryNis ?? '');
  const [pictures, setPictures] = useState({ seal: null, signature: null });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const amount = String(salary).trim() === '' ? null : parseSalary(salary);
    const found = {
      title: title.trim().length < 3 ? 'Name the agreement with at least 3 characters.' : undefined,
      salary: String(salary).trim() !== '' && !amount ? 'Enter the monthly salary in NIS, such as 6247.67.' : undefined,
      seal: markError(pictures.seal),
      signature: markError(pictures.signature),
    };
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    const details = {};
    if (title.trim() !== agreement.title) details.title = title.trim();
    if (amount && amount !== Number(agreement.salaryNis)) details.salary = amount;

    setBusy(true);
    try {
      if (Object.keys(details).length) await agreementApi.updateDetails(agreement.id, details);
      for (const { type } of MARKS) {
        if (pictures[type]) await agreementApi.uploadMark(agreement.id, type, pictures[type]);
      }
      toast('Agreement saved.');
      onSaved();
    } catch (err) {
      if (err.errors) setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, [].concat(v)[0]])));
      alertError(err.message || 'Could not save the agreement.', 'Not saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={'Edit ' + agreement.title}
      subtitle={agreement.status === 'draft' ? 'Draft' : 'Already sent - the admin and local agency see the change.'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Input
          label="Name"
          name="editTitle"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
        />
        <div>
          <label htmlFor="editSalary" className="field-label">
            Monthly salary (NIS)
          </label>
          <input
            id="editSalary"
            inputMode="decimal"
            placeholder="6,247.67"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            className={'field-input ' + (errors.salary ? 'field-input-error' : '')}
          />
          {errors.salary ? (
            <p className="field-error">{errors.salary}</p>
          ) : (
            <p className="mt-1.5 text-xs text-gray-500">Replaces the salary in clause 3a, in all three languages.</p>
          )}
        </div>
        {MARKS.map(({ type, label }) => (
          <MarkPicker
            key={type}
            type={type}
            label={label}
            file={pictures[type]}
            saved={agreement.marks?.[type]}
            error={errors[type]}
            onPick={(file) => {
              setPictures((prev) => ({ ...prev, [type]: file }));
              setErrors((prev) => ({ ...prev, [type]: markError(file) }));
            }}
          />
        ))}
      </div>
    </Modal>
  );
}

/** A list of foreign companies' agreements, each with where it has got to. */
function CompanyAgreementList({ agreements, empty, onRemove, onEdit, onSend }) {
  const navigate = useNavigate();

  if (agreements.length === 0) return <p className="px-5 py-6 text-sm text-gray-500">{empty}</p>;

  return (
    <ul>
      {agreements.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3.5 last:border-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">{a.title}</p>
            <p className="text-xs text-gray-500">
              {a.sentToAdminAt ? 'sent ' + formatDate(a.sentToAdminAt) : 'updated ' + formatDate(a.updatedAt)}
            </p>
          </div>
          {onRemove && (
            <Button
              size="sm"
              variant="ghost"
              icon={IconTrash}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => onRemove(a)}
              aria-label={'Delete ' + a.title}
            />
          )}
          <StatusBadge agreement={a} />
          {onEdit && (
            <Button size="sm" variant="secondary" icon={IconEdit} onClick={() => onEdit(a)}>
              Edit
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => navigate('/agreements/' + a.id)}>
            Open
          </Button>
          {onSend && a.status === 'draft' && (
            <Button size="sm" onClick={() => onSend(a)}>
              Send to admin
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Agreements, by who is reading:
 *
 *   admin    what foreign companies have sent, to pass to a local agency.
 *   company  uploads its PDF, which becomes its agreement with the employer
 *            part already filled (CompanyAgreement); it checks it and sends
 *            it to the admin.
 *   local    picks an agreement the admin side sent it and assigns one of
 *            its candidates, which fills the employee part.
 */
export default function Agreements() {
  const { admin } = useAuth();

  if (isGlobalRole(admin?.roleSlug)) return <ForeignCompanyInbox />;
  return admin?.agency?.type === 'foreign' ? <CompanyAgreements /> : <LocalAgencyAgreements />;
}

/** A foreign company: upload a PDF, then check and send the agreement it becomes. */
function CompanyAgreements() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [layouts, setLayouts] = useState(null);
  const [savedPdfs, setSavedPdfs] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([agreementApi.templates(), agreementApi.list()]);
      setLayouts(t.data.layouts || []);
      setSavedPdfs((t.data.templates || []).filter((template) => template.saved));
      setAgreements(Array.isArray(a.data) ? a.data : []);
    } catch (err) {
      toast(err.message || 'Could not load the agreements.', 'error');
      setLayouts([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const removeAgreement = async (agreement) => {
    const sure = await confirmAction({
      title: 'Delete ' + agreement.title + '?',
      text:
        agreement.status === 'draft'
          ? 'The agreement and its PDF are deleted.'
          : 'It has been sent already - it is deleted for the admin' +
            (agreement.status === 'sent_to_agency' ? ' and ' + (agreement.localAgencyName || 'the local agency') : '') +
            ' too.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!sure) return;
    try {
      const { message } = await agreementApi.remove(agreement.id);
      toast(message || 'Deleted.');
      load();
    } catch (err) {
      alertError(err.message || 'Could not delete it.', 'Not deleted');
    }
  };

  const sendToAdmin = async (agreement) => {
    const sure = await confirmAction({
      title: 'Send ' + agreement.title + ' to the admin?',
      text: 'You can still correct it after it is sent.',
      confirmText: 'Send',
    });
    if (!sure) return;
    try {
      const { message } = await agreementApi.sendToAdmin(agreement.id);
      toast(message || 'Sent to the admin.');
      load();
    } catch (err) {
      alertError(err.message || 'Could not send the agreement.', 'Not sent');
    }
  };

  if (!layouts) return <PageLoader label="Loading agreements..." />;

  return (
    <div className="space-y-6">
      <UploadCard
        layouts={layouts}
        savedPdfs={savedPdfs}
        onSavedPdfsChanged={load}
        // Saved with its salary, the agreement opens to check and send.
        onSaved={(id) => navigate('/agreements/' + id)}
        subtitle="Upload the agreement PDF. The employer part is filled from your company details in English, Hebrew and Sinhala, for you to check and send to the admin."
      />
      <Card>
        <CardHeader title="Your agreements" subtitle="Open one to check it, or to send it to the admin." />
        <CompanyAgreementList
          agreements={agreements}
          empty="Nothing uploaded yet."
          onRemove={removeAgreement}
          onEdit={setEditing}
          onSend={sendToAdmin}
        />
      </Card>

      {editing && (
        <EditAgreementModal
          agreement={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
