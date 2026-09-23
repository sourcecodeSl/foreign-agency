import { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardBody, CardFooter } from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { PageLoader } from '../../components/ui/Spinner';
import OtpForm from '../../components/auth/OtpForm';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import {
  IconBuilding,
  IconUsers,
  IconMail,
  IconPhone,
  IconEdit,
  IconPlus,
  IconRefresh,
} from '../../components/ui/Icons';
import { agencyProfileApi } from '../../lib/api';
import { alertError, confirmAction } from '../../lib/alert';

const PHONE_RE = /^[0-9+\s-]{9,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const detailsFrom = (profile) => ({
  name: profile.name || '',
  contact: profile.contact || '',
  address: profile.address || '',
  // A foreign company files these as well; a local agency leaves them empty.
  registrationNo: profile.registrationNo || '',
  lawyerName: profile.lawyer?.name || '',
  lawyerIdNo: profile.lawyer?.idNo || '',
  lawyerPosition: profile.lawyer?.position || '',
});

/** Field rules, mirroring the server so the same wording appears either way. */
function validateDetails(values, foreign) {
  const errors = {};

  if (foreign) {
    if (!values.registrationNo.trim())
      errors.registrationNo = "Enter the company's registration number.";
    if (!values.lawyerName.trim()) errors.lawyerName = "Enter the company lawyer's name.";
    else if (values.lawyerName.trim().length < 3)
      errors.lawyerName = 'Name must be at least 3 characters.';
    if (!values.lawyerIdNo.trim()) errors.lawyerIdNo = "Enter the company lawyer's ID number.";
    if (!values.lawyerPosition.trim())
      errors.lawyerPosition = "Enter the company lawyer's position.";
  }

  if (!values.name.trim()) errors.name = 'Name is required.';
  else if (values.name.trim().length < 3) errors.name = 'Name must be at least 3 characters.';

  if (!values.contact.trim()) errors.contact = 'A contact person is required.';
  else if (values.contact.trim().length < 3)
    errors.contact = 'Contact name must be at least 3 characters.';

  if (!values.address.trim()) errors.address = 'Address is required.';
  else if (values.address.trim().length < 8) errors.address = 'Please provide the full address.';

  return errors;
}

function Fact({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-0.5 truncate font-semibold text-gray-900">{value || '—'}</dd>
    </div>
  );
}

/** Name, contact person and address - nothing here needs a code. */
function DetailsCard({ profile, onSaved }) {
  const { toast } = useToast();
  const [values, setValues] = useState(() => detailsFrom(profile));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  // A form-wide error is shown through SweetAlert, like every other message.
  useEffect(() => {
    if (formError) alertError(formError);
  }, [formError]);
  const [saving, setSaving] = useState(false);

  const saved = detailsFrom(profile);
  const dirty = Object.keys(saved).some((key) => values[key] !== saved[key]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
    setFormError('');
  };

  const discard = () => {
    setValues(saved);
    setErrors({});
    setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validateDetails(values, profile.type === 'foreign');
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const { data, message } = await agencyProfileApi.update(values);
      setValues(detailsFrom(data));
      onSaved(data);
      toast(message || 'Agency details saved.');
    } catch (err) {
      if (err.errors) setErrors((prev) => ({ ...prev, ...err.errors }));
      setFormError(err.message || 'Could not save the agency details.');
    } finally {
      setSaving(false);
    }
  };

  const status = profile.status ? profile.status[0].toUpperCase() + profile.status.slice(1) : '';
  // An agency of type foreign is a foreign company wherever it is read.
  const foreign = profile.type === 'foreign';

  return (
    <Card>
      <CardHeader
        title={foreign ? 'Company details' : 'Agency details'}
        subtitle="Saved as soon as you press Save changes."
      />

      <form onSubmit={handleSubmit} noValidate>
        <CardBody className="grid gap-x-8 gap-y-6 p-6 sm:grid-cols-2 sm:p-8">
          <div className="rounded-lg bg-gray-50 px-4 py-3 sm:col-span-2">
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <Fact label={foreign ? 'Company code' : 'Agency code'} value={profile.code} />
              <Fact label="Login username" value={profile.username} />
              <Fact label="Status" value={status} />
            </dl>
            <p className="mt-2 text-xs text-gray-500">Set by the administrator.</p>
          </div>

          <Input
            label={foreign ? 'Company name' : 'Agency name'}
            name="name"
            required
            value={values.name}
            onChange={handleChange}
            error={errors.name}
            icon={IconBuilding}
          />

          <Input
            label="Contact person"
            name="contact"
            required
            value={values.contact}
            onChange={handleChange}
            error={errors.contact}
            icon={IconUsers}
            hint={!errors.contact ? 'Also the name you sign in under.' : undefined}
          />

          {/* A foreign company files these; a local agency is not asked. */}
          {foreign && (
            <>
              <Input
                label="Registration No"
                name="registrationNo"
                required
                value={values.registrationNo}
                onChange={handleChange}
                error={errors.registrationNo}
                className="sm:col-span-2"
              />

              <fieldset className="grid gap-5 rounded-lg border border-gray-200 p-4 sm:col-span-2 sm:grid-cols-3">
                <legend className="px-1 text-sm font-semibold text-gray-900">Company lawyer</legend>

                <Input
                  label="Lawyer name"
                  name="lawyerName"
                  required
                  value={values.lawyerName}
                  onChange={handleChange}
                  error={errors.lawyerName}
                  icon={IconUsers}
                />

                <Input
                  label="Lawyer ID No"
                  name="lawyerIdNo"
                  required
                  value={values.lawyerIdNo}
                  onChange={handleChange}
                  error={errors.lawyerIdNo}
                />

                <Input
                  label="Position"
                  name="lawyerPosition"
                  required
                  value={values.lawyerPosition}
                  onChange={handleChange}
                  error={errors.lawyerPosition}
                />
              </fieldset>
            </>
          )}

          <div className="sm:col-span-2">
            <label htmlFor="address" className="field-label">
              Address <span className="text-red-500">*</span>
            </label>
            <textarea
              id="address"
              name="address"
              rows={3}
              value={values.address}
              onChange={handleChange}
              aria-invalid={errors.address ? true : undefined}
              className={'field-input resize-none ' + (errors.address ? 'field-input-error' : '')}
            />
            {errors.address && <p className="field-error">{errors.address}</p>}
          </div>
        </CardBody>

        <CardFooter className="flex items-center justify-end gap-3 px-6 sm:px-8">
          <Button type="button" variant="secondary" onClick={discard} disabled={!dirty || saving}>
            Discard changes
          </Button>
          <Button type="submit" loading={saving} disabled={!dirty}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

/**
 * One sign-in channel. Changing it sends a code to the new value, and the value
 * is written only once that code is entered - so a typo cannot lock the agency
 * out. While delivery is not wired up the code is shown right here.
 */
function ContactRow({ field, label, icon: Icon, current, placeholder, onSaved }) {
  const { toast } = useToast();
  const [step, setStep] = useState('view'); // view -> edit -> verify
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [challenge, setChallenge] = useState(null);

  const noun = field === 'phone' ? 'phone number' : 'email address';

  const problemWith = (raw) => {
    const v = raw.trim();
    if (!v) return 'Enter the new ' + noun + '.';
    if (field === 'phone' && !PHONE_RE.test(v)) return 'Enter a valid phone number.';
    if (field === 'email' && !EMAIL_RE.test(v)) return 'Enter a valid email address.';
    return '';
  };

  const startEdit = () => {
    setValue('');
    setError('');
    setStep('edit');
  };

  const cancel = () => {
    setChallenge(null);
    setError('');
    setStep('view');
  };

  const sendCode = async (e) => {
    e.preventDefault();
    const problem = problemWith(value);
    if (problem) return setError(problem);

    setSending(true);
    try {
      const { data } = await agencyProfileApi.requestContactChange(field, value.trim());
      setChallenge({ id: data.challengeId, destination: data.destination, devCode: data.devCode });
      setStep('verify');
    } catch (err) {
      setError(err.errors?.value || err.message || 'Could not send the code.');
    } finally {
      setSending(false);
    }
  };

  // OtpForm shows whatever these throw, so they only handle success.
  const verify = async (code) => {
    const { data, message } = await agencyProfileApi.verifyContactChange(challenge.id, code);
    onSaved(data);
    toast(message || 'Saved.');
    setChallenge(null);
    setStep('view');
  };

  const resend = async () => {
    const { data } = await agencyProfileApi.resendContactCode(challenge.id);
    setChallenge((prev) => ({ ...prev, devCode: data?.devCode }));
  };

  return (
    <section aria-label={label} className="px-6 py-5 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500">{label}</p>
            <p className="truncate text-sm font-semibold text-gray-900">{current || 'Not set'}</p>
          </div>
        </div>

        {step === 'view' && (
          <Button type="button" variant="secondary" size="sm" icon={IconEdit} onClick={startEdit}>
            Change
          </Button>
        )}
      </div>

      {step === 'edit' && (
        <form onSubmit={sendCode} noValidate className="mt-4 space-y-3">
          <Input
            label={'New ' + noun}
            name={'new-' + field}
            type={field === 'phone' ? 'tel' : 'email'}
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
            error={error}
            icon={Icon}
            hint={!error ? 'A code is sent here to confirm it.' : undefined}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={cancel} disabled={sending}>
              Cancel
            </Button>
            <Button type="submit" loading={sending}>
              {sending ? 'Sending...' : 'Send code'}
            </Button>
          </div>
        </form>
      )}

      {step === 'verify' && challenge && (
        <div className="mt-4 max-w-md">
          <OtpForm
            icon={Icon}
            destination={challenge.destination}
            devCode={challenge.devCode}
            onVerify={verify}
            onResend={resend}
            submitLabel="Verify & Save"
          />
          <div className="mt-4 flex justify-center gap-4 text-sm">
            <button
              type="button"
              onClick={() => {
                setChallenge(null);
                setStep('edit');
              }}
              className="font-medium text-gray-600 hover:text-gray-900"
            >
              Use a different {noun}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="font-medium text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * One picture: the signature, or the seal.
 *
 * The file sits on a private disk, so it is fetched with the session token
 * and shown from a blob URL rather than linked to. Uploading a new one
 * replaces what was there - there is no history to keep.
 */
function MarkBox({ type, label, hint, mark, onSaved }) {
  const { toast } = useToast();
  const inputRef = useRef(null);
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);

  const uploaded = Boolean(mark?.uploaded);

  useEffect(() => {
    if (!uploaded) {
      setUrl(null);
      return undefined;
    }

    let objectUrl = null;
    let cancelled = false;

    agencyProfileApi
      .markUrl(type)
      .then((next) => {
        if (cancelled) {
          if (next) URL.revokeObjectURL(next);
          return;
        }
        objectUrl = next;
        setUrl(next);
      })
      .catch(() => {});

    // The blob is held by this page alone, so it goes when the box does.
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [type, uploaded, mark?.uploadedAt]);

  const upload = async (file) => {
    setBusy(true);
    try {
      const { data, message } = await agencyProfileApi.uploadMark(type, file);
      onSaved(data);
      toast(message || label + ' uploaded.');
    } catch (err) {
      alertError(
        err.errors?.file || err.message || 'Could not upload the ' + type + '.',
        'Upload failed',
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const sure = await confirmAction({
      title: 'Remove the ' + type + '?',
      text: 'It is deleted from the server. You can upload a new one at any time.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!sure) return;

    setBusy(true);
    try {
      const { data, message } = await agencyProfileApi.removeMark(type);
      onSaved(data);
      toast(message || label + ' removed.');
    } catch (err) {
      alertError(err.message || 'Could not remove the ' + type + '.', 'Not removed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-sm font-semibold text-gray-900">{label}</p>
      <p className="mt-0.5 text-xs text-gray-500">{hint}</p>

      <div className="mt-3 flex h-28 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
        {uploaded ? (
          url ? (
            <img src={url} alt={label} className="max-h-24 max-w-full object-contain" />
          ) : (
            <span className="text-xs text-gray-400">Loading...</span>
          )
        ) : (
          <span className="text-xs text-gray-400">Nothing uploaded yet</span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = ''; // allow re-picking the same file
        }}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={uploaded ? 'secondary' : 'primary'}
          icon={uploaded ? IconRefresh : IconPlus}
          loading={busy}
          onClick={() => inputRef.current?.click()}
        >
          {uploaded ? 'Replace' : 'Upload'}
        </Button>
        {uploaded && (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={remove}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

/** The signature and the seal, both added here and nowhere else. */
function MarksCard({ profile, onSaved }) {
  return (
    <Card>
      <CardHeader
        title="Signature and seal"
        subtitle="Pictures used on this account's paperwork. A new upload replaces the one before it."
      />
      <CardBody className="grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
        <MarkBox
          type="signature"
          label="Signature"
          hint="A scan of the authorised signature."
          mark={profile.marks?.signature}
          onSaved={onSaved}
        />
        <MarkBox
          type="seal"
          label="Seal"
          hint="The rubber stamp or company seal."
          mark={profile.marks?.seal}
          onSaved={onSaved}
        />
      </CardBody>
    </Card>
  );
}

export default function AgencyProfile() {
  const { refresh } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    agencyProfileApi
      .get()
      .then(({ data }) => !cancelled && setProfile(data))
      .catch(
        (err) => !cancelled && setLoadError(err.message || 'Could not load the agency details.'),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  // A save can rename the agency or the owner, which the sidebar and topbar show.
  const applySaved = (data) => {
    setProfile(data);
    refresh().catch(() => {});
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl">
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {loadError}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageLoader label="Loading agency details..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <DetailsCard profile={profile} onSaved={applySaved} />

      <MarksCard profile={profile} onSaved={applySaved} />

      <Card>
        <CardHeader
          title="Sign-in phone & email"
          subtitle="Sign-in codes go here. A new one is saved only after you enter the code sent to it."
        />
        <div className="divide-y divide-gray-200">
          <ContactRow
            field="phone"
            label="Phone number"
            icon={IconPhone}
            current={profile.phone}
            placeholder="0771234567"
            onSaved={applySaved}
          />
          <ContactRow
            field="email"
            label="Email address"
            icon={IconMail}
            current={profile.email}
            placeholder="agency@example.com"
            onSaved={applySaved}
          />
        </div>
      </Card>
    </div>
  );
}
