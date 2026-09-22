import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardBody, CardFooter } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { useAuth, isGlobalRole } from '../../context/AuthContext';
import { agreementApi } from '../../lib/api';
import { alertError, confirmAction } from '../../lib/alert';
import { formatDate } from '../candidates/shared';
import { EmployerTable } from './EmployerAgreement';
import { downloadAgreementPdf, openAgreementPdf, parseSalary, MARKS, MarkPicker, markError } from './Agreements';

/** Where a foreign company's agreement has got to, as each side reads it. */
export function StatusBadge({ agreement }) {
  if (agreement.status === 'sent_to_agency') {
    return (
      <Badge tone="green" dot>
        Sent to {agreement.localAgencyName || 'local agency'}
      </Badge>
    );
  }
  if (agreement.status === 'sent_to_admin') {
    return (
      <Badge tone="blue" dot>
        Sent to admin
      </Badge>
    );
  }
  return (
    <Badge tone="amber" dot>
      Draft
    </Badge>
  );
}

/** The admin side's step: pick one local agency and pass the agreement on. */
function SendToAgency({ agreement, onSent }) {
  const { toast } = useToast();
  const [agencies, setAgencies] = useState(null);
  const [agencyId, setAgencyId] = useState(agreement.localAgencyId || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    agreementApi
      .recipients()
      .then((res) => setAgencies(res.data.localAgencies || []))
      .catch(() => setAgencies([]));
  }, []);

  const send = async () => {
    if (!agencyId) {
      alertError('Choose the local agency to send it to.', 'Not sent');
      return;
    }
    const name = agencies.find((a) => a.id === agencyId)?.name || 'the agency';
    const sure = await confirmAction({
      title: 'Send to ' + name + '?',
      text: 'The agreement appears on ' + name + "'s agreements page.",
      confirmText: 'Send',
    });
    if (!sure) return;

    setBusy(true);
    try {
      const { data, message } = await agreementApi.sendToAgency(agreement.id, agencyId);
      toast(message || 'Sent.');
      onSent(data);
    } catch (err) {
      alertError(err.message || 'Could not send the agreement.', 'Not sent');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Send to a local agency"
        subtitle={
          agreement.status === 'sent_to_agency'
            ? 'Sent to ' + agreement.localAgencyName + ' on ' + formatDate(agreement.sentToAgencyAt) +
              '. Sending again moves it to the agency chosen.'
            : 'The local agency sees the agreement only once it is sent here.'
        }
      />
      <div className="flex flex-wrap items-end gap-3 px-5 py-4">
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="localAgency" className="field-label">
            Local agency
          </label>
          <select
            id="localAgency"
            value={agencyId}
            onChange={(e) => setAgencyId(e.target.value)}
            className="field-input"
            disabled={!agencies}
          >
            <option value="">{agencies ? 'Select...' : 'Loading...'}</option>
            {(agencies || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.code})
              </option>
            ))}
          </select>
        </div>
        <Button onClick={send} loading={busy}>
          Send to local agency
        </Button>
      </div>
    </Card>
  );
}

/** A saved salary as the screen shows it: 6,247.67. */
const formatNis = (value) =>
  Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * What the company puts on its agreement besides its details, in one place:
 * the monthly salary - written into clause 3a in all three languages, in
 * place of the amount the paper prints - and the seal and signature, printed
 * beside the page number on every page. The company changes them at any
 * stage, even once sent; everyone else reads them.
 */
function TermsCard({ agreement, editable, onChange }) {
  const { toast } = useToast();
  const [salary, setSalary] = useState(agreement.salaryNis ?? '');
  const [pictures, setPictures] = useState({ seal: null, signature: null });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const amount = String(salary).trim() === '' ? null : parseSalary(salary);
  const salaryChanged = String(salary).trim() !== '' && amount !== Number(agreement.salaryNis);
  const chosen = MARKS.filter(({ type }) => pictures[type]);
  const dirty = salaryChanged || chosen.length > 0;

  const save = async () => {
    const found = {
      salary: salaryChanged && !amount ? 'Enter the monthly salary in NIS, such as 6247.67.' : undefined,
      ...Object.fromEntries(MARKS.map(({ type }) => [type, markError(pictures[type])])),
    };
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    setBusy(true);
    try {
      let data = agreement;
      if (salaryChanged) ({ data } = await agreementApi.updateDetails(agreement.id, { salary: amount }));
      for (const { type } of chosen) {
        ({ data } = await agreementApi.uploadMark(agreement.id, type, pictures[type]));
      }
      toast('Agreement saved.');
      setPictures({ seal: null, signature: null });
      setSalary(data.salaryNis ?? '');
      onChange(data);
    } catch (err) {
      alertError(err.message || 'Could not save the agreement.', 'Not saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Salary, seal and signature"
        subtitle="The salary goes into clause 3a in all three languages; the seal and signature beside the page number on every page."
      />

      {editable ? (
        <CardBody className="grid gap-6 md:grid-cols-3">
          <div>
            <label htmlFor="salaryNis" className="field-label">
              Monthly salary (NIS)
            </label>
            <input
              id="salaryNis"
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
                {agreement.salaryNis
                  ? 'Replaces the amount clause 3a prints, with the amount in words.'
                  : 'Not set yet: the PDF keeps the amount the paper prints.'}
              </p>
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
        </CardBody>
      ) : (
        <CardBody className="flex flex-wrap items-center gap-2">
          <Badge tone={agreement.salaryNis ? 'blue' : 'gray'}>
            {agreement.salaryNis ? 'NIS ' + formatNis(agreement.salaryNis) + ' a month' : 'Salary as printed'}
          </Badge>
          {MARKS.map(({ type, label }) => (
            <Badge key={type} tone={agreement.marks?.[type] ? 'green' : 'gray'} dot>
              {label}: {agreement.marks?.[type] ? 'added' : 'not added'}
            </Badge>
          ))}
        </CardBody>
      )}

      {agreement.values?.salary && (
        <div className="border-t border-gray-100">
          <EmployerTable section={agreement.salarySection} values={agreement.values} />
        </div>
      )}

      {editable && (
        <CardFooter className="flex items-center justify-end gap-3">
          {dirty && <p className="text-xs text-gray-500">Unsaved changes</p>}
          <Button onClick={save} loading={busy} disabled={!dirty}>
            Save changes
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

/**
 * A foreign company's agreement: the employer part, filled from the
 * company's record in English, Hebrew and Sinhala, laid out as the paper is.
 *
 * The company corrects the Hebrew and Sinhala while it is a draft, then sends
 * it to the admin side. The admin side reads it and passes it to one local
 * agency, which then reads it too.
 */
export default function CompanyAgreement({ agreement, onChange }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { admin } = useAuth();
  const [values, setValues] = useState(agreement.values || {});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');

  const adminSide = isGlobalRole(admin?.roleSlug);
  const isOwner = !adminSide && admin?.agency?.id === agreement.agencyId;
  const editable = isOwner && agreement.status === 'draft';
  const unchecked = Object.values(values).some((v) => v.auto?.he || v.auto?.si);

  const change = (key, lang, text) => {
    setDirty(true);
    // A number reads the same in every language, so its English carries over.
    const number = lang === 'en' && agreement.employerSection?.fields.find((f) => f.key === key)?.kind === 'text';
    setValues((prev) => ({
      ...prev,
      [key]: number
        ? { ...prev[key], en: text, he: text, si: text }
        : { ...prev[key], [lang]: text, auto: { ...prev[key]?.auto, [lang]: false } },
    }));
  };

  const save = async () => {
    const { data } = await agreementApi.update(agreement.id, { values });
    setValues(data.values || {});
    setDirty(false);
    onChange(data);
    return data;
  };

  const saveOnly = async () => {
    setBusy('save');
    try {
      await save();
      toast('Agreement saved.');
    } catch (err) {
      alertError(err.message || 'Could not save the agreement.', 'Not saved');
    } finally {
      setBusy('');
    }
  };

  const sendToAdmin = async () => {
    const sure = await confirmAction({
      title: 'Send to the admin?',
      text: 'Once sent, the agreement can no longer be changed.',
      confirmText: 'Send',
    });
    if (!sure) return;

    setBusy('send');
    try {
      if (dirty) await save();
      const { data, message } = await agreementApi.sendToAdmin(agreement.id);
      onChange(data);
      toast(message || 'Sent to the admin.');
    } catch (err) {
      alertError(err.message || 'Could not send the agreement.', 'Not sent');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-gray-900">{agreement.title}</p>
            <p className="text-xs text-gray-500">
              {agreement.agencyName}
              {agreement.sentToAdminAt ? ' · sent to admin ' + formatDate(agreement.sentToAdminAt) : ''}
            </p>
          </div>
          <StatusBadge agreement={agreement} />
          <Button variant="ghost" onClick={() => openAgreementPdf(agreement.id)}>
            View filled PDF
          </Button>
          <Button variant="secondary" onClick={() => downloadAgreementPdf(agreement.id)}>
            Download PDF
          </Button>
          <Button variant="ghost" onClick={() => navigate('/agreements')}>
            Back
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Employment Agreement - employer"
          subtitle={
            editable
              ? 'Filled from your company details in all three languages. Change any of it for this agreement, check the highlighted Hebrew and Sinhala, then send it to the admin.'
              : 'Filled from the company details in English, Hebrew and Sinhala.'
          }
        />
        <EmployerTable
          section={agreement.employerSection}
          values={values}
          onChange={editable ? change : undefined}
          editAll
        />
        {editable && (
          <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-4">
            {unchecked && (
              <p className="text-xs text-amber-800">
                Highlighted values were filled automatically - check they read right.
              </p>
            )}
            <Button variant="secondary" onClick={saveOnly} loading={busy === 'save'} disabled={!dirty || !!busy}>
              Save
            </Button>
            <Button onClick={sendToAdmin} loading={busy === 'send'} disabled={!!busy}>
              Send to admin
            </Button>
          </div>
        )}
      </Card>

      {/* The salary, seal and signature stay the company's to change, even once sent. */}
      {agreement.salarySection && <TermsCard agreement={agreement} editable={isOwner} onChange={onChange} />}

      {agreement.candidateId && agreement.employeeSection && (
        <Card>
          <CardHeader
            title={'Employee - ' + agreement.candidateName}
            subtitle={'Assigned by ' + agreement.localAgencyName + ' on ' + formatDate(agreement.candidateAssignedAt) + '.'}
          />
          <EmployerTable section={agreement.employeeSection} values={agreement.values || {}} />
        </Card>
      )}

      {adminSide && agreement.status !== 'draft' && <SendToAgency agreement={agreement} onSent={onChange} />}
    </div>
  );
}
