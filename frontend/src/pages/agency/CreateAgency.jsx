import { useState } from 'react';
import { Card, CardHeader, CardBody, CardFooter } from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import CopyButton from '../../components/ui/CopyButton';
import { useToast } from '../../components/ui/Toast';
import { IconBuilding, IconRefresh, IconCheck } from '../../components/ui/Icons';
import { agencyApi } from '../../lib/api';

const EMPTY = { name: '', address: '', username: '', password: '' };

/** Field-level rules. Returns a { field: message } map; empty means valid. */
function validate(values) {
  const errors = {};

  if (!values.name.trim()) errors.name = 'Agency name is required.';
  else if (values.name.trim().length < 3) errors.name = 'Name must be at least 3 characters.';

  if (!values.address.trim()) errors.address = 'Address is required.';
  else if (values.address.trim().length < 8) errors.address = 'Please enter the full address.';

  if (!values.username.trim()) errors.username = 'Username is required.';
  else if (!/^[a-zA-Z0-9._-]{4,20}$/.test(values.username))
    errors.username = '4-20 characters. Letters, numbers, dot, underscore or hyphen only.';

  if (!values.password) errors.password = 'Password is required.';
  else if (values.password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (!/[A-Z]/.test(values.password) || !/[0-9]/.test(values.password))
    errors.password = 'Include at least one uppercase letter and one number.';

  return errors;
}

/** Generates a reasonably strong password the admin can hand over. */
function generatePassword(length = 12) {
  const sets = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@#$%*?',
  ];
  const all = sets.join('');
  const pick = (chars) => chars[Math.floor(Math.random() * chars.length)];
  const chars = sets.map(pick);
  while (chars.length < length) chars.push(pick(all));
  return chars.sort(() => Math.random() - 0.5).join('');
}

export default function CreateAgency() {
  const { toast } = useToast();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null); // credentials returned by the API

  const handleChange = (e) => {
    const { name, value } = e.target;
    const next = { ...values, [name]: value };
    setValues(next);
    // Re-validate a field only once the user has left it, so typing stays quiet.
    if (touched[name]) setErrors((prev) => ({ ...prev, [name]: validate(next)[name] }));
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({ ...prev, [name]: validate(values)[name] }));
  };

  const handleGenerate = () => {
    const password = generatePassword();
    const next = { ...values, password };
    setValues(next);
    setErrors((prev) => ({ ...prev, password: undefined }));
    toast('A strong password has been generated.', 'info');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    setTouched({ name: true, address: true, username: true, password: true });
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      const { data } = await agencyApi.create(values);
      setCreated({
        agencyName: data.name,
        agencyCode: data.code,
        username: data.credentials.username,
        password: data.credentials.password,
        loginUrl: data.credentials.loginUrl,
      });
      setValues(EMPTY);
      setTouched({});
      toast('Agency created successfully. Credentials are ready to share.');
    } catch (err) {
      toast(err.message || 'Could not create the agency.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // The exact text placed on the clipboard by "Copy Details".
  const credentialText = () =>
    [
      'Agency: ' + created.agencyName + ' (' + created.agencyCode + ')',
      'Login URL: ' + created.loginUrl,
      'Username: ' + created.username,
      'Password: ' + created.password,
      '',
      'Please change this password after your first sign-in.',
    ].join('\n');

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* ---------------- Form ---------------- */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader
            title="Agency Details"
            subtitle="These credentials are issued to the agency owner on creation."
          />
          <form onSubmit={handleSubmit} noValidate>
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Name"
                name="name"
                required
                placeholder="e.g. Skyline Marketing Pvt Ltd"
                value={values.name}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.name}
                icon={IconBuilding}
                className="sm:col-span-2"
              />

              <div className="sm:col-span-2">
                <label htmlFor="address" className="field-label">
                  Address <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="address"
                  name="address"
                  rows={3}
                  placeholder="Street, city, state and postal code"
                  value={values.address}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={errors.address ? true : undefined}
                  className={'field-input resize-none ' + (errors.address ? 'field-input-error' : '')}
                />
                {errors.address && <p className="field-error">{errors.address}</p>}
              </div>

              <Input
                label="Username"
                name="username"
                required
                autoComplete="off"
                placeholder="skyline.admin"
                value={values.username}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.username}
                hint="This is the agency's login ID."
              />

              <div>
                <Input
                  label="Password"
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                  value={values.password}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={errors.password}
                />
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700"
                >
                  <IconRefresh className="h-3.5 w-3.5" />
                  Generate strong password
                </button>
              </div>
            </CardBody>

            <CardFooter className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setValues(EMPTY);
                  setErrors({});
                  setTouched({});
                }}
              >
                Reset
              </Button>
              <Button type="submit" loading={submitting}>
                {submitting ? 'Creating...' : 'Create Agency'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      {/* --------- Generated credentials panel --------- */}
      <div className="lg:col-span-1">
        <Card className="sticky top-24">
          <CardHeader
            title="Generated Credentials"
            subtitle={created ? 'Share these with the agency owner.' : 'Shown after the agency is created.'}
          />
          <CardBody>
            {!created ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center">
                <IconBuilding className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-3 text-sm font-medium text-gray-900">No credentials yet</p>
                <p className="mt-1 text-sm text-gray-500">
                  Submit the form and the username and password will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
                  <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    <span className="font-semibold">{created.agencyName}</span> was created and is
                    now awaiting approval.
                  </p>
                </div>

                <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {[
                    ['Agency Code', created.agencyCode],
                    ['Username', created.username],
                    ['Password', created.password],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 px-3.5 py-3">
                      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        {label}
                      </dt>
                      <dd className="flex items-center gap-2">
                        <code className="rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-900">
                          {value}
                        </code>
                        <CopyButton value={value} label="" size="sm" variant="ghost" />
                      </dd>
                    </div>
                  ))}
                </dl>

                {/* The headline "Copy Details" action */}
                <CopyButton
                  value={credentialText}
                  label="Copy Details"
                  copiedLabel="Details Copied!"
                  variant="primary"
                  size="md"
                  className="w-full"
                  onCopied={() => toast('Credentials copied to clipboard.')}
                />

                <p className="text-xs text-gray-500">
                  The password is shown only once. Copy it before leaving this screen.
                </p>

                <Button variant="secondary" className="w-full" onClick={() => setCreated(null)}>
                  Create another agency
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
