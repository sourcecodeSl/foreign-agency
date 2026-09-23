import { useState } from 'react';
import { Card, CardHeader, CardBody, CardFooter } from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import CopyButton from '../../components/ui/CopyButton';
import { useToast } from '../../components/ui/Toast';
import {
  IconBuilding,
  IconRefresh,
  IconCheck,
  IconUsers,
  IconMail,
} from '../../components/ui/Icons';
import CountrySelect from '../../components/ui/CountrySelect';
import { agencyApi } from '../../lib/api';

const EMPTY = {
  type: 'local',
  country: '',
  name: '',
  registrationNo: '',
  lawyerName: '',
  lawyerIdNo: '',
  lawyerPosition: '',
  contact: '',
  address: '',
  email: '',
  phone: '',
  username: '',
  password: '',
};

// Both kinds are approved, sign in and register candidates the same way.
const AGENCY_TYPES = [
  { id: 'local', label: 'Local agency', description: 'A recruitment agency in Sri Lanka.' },
  {
    id: 'foreign',
    label: 'Foreign company',
    description: 'A company based overseas, such as in Israel.',
  },
];

/** Field-level rules. Returns a { field: message } map; empty means valid. */
function validate(values) {
  const errors = {};
  const foreign = values.type === 'foreign';

  if (!values.name.trim())
    errors.name = foreign ? 'Company name is required.' : 'Agency name is required.';
  else if (values.name.trim().length < 3) errors.name = 'Name must be at least 3 characters.';

  // What a foreign company files: its registration number. The lawyer is
  // the company's own to add later, on Company Details.
  if (foreign) {
    if (!values.registrationNo.trim())
      errors.registrationNo = "Enter the company's registration number.";

    if (values.lawyerName.trim() && values.lawyerName.trim().length < 3)
      errors.lawyerName = 'Name must be at least 3 characters.';
  }

  if (!values.contact.trim()) errors.contact = 'Contact person is required.';
  else if (values.contact.trim().length < 3)
    errors.contact = 'Contact name must be at least 3 characters.';

  if (foreign && !values.country.trim())
    errors.country = 'Enter the country this company is based in.';

  if (!values.address.trim()) errors.address = 'Address is required.';
  else if (values.address.trim().length < 8) errors.address = 'Please enter the full address.';

  if (!values.email.trim()) errors.email = 'Email is required.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    errors.email = 'Enter a valid email address.';

  if (!values.phone.trim()) errors.phone = 'Phone number is required.';
  else if (!/^[0-9+\s-]{9,20}$/.test(values.phone.trim()))
    errors.phone = 'Enter a valid phone number.';

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
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*?'];
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

  // A foreign record is a company: it is worded that way and files more.
  const foreign = values.type === 'foreign';

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
    setTouched({
      country: true,
      name: true,
      registrationNo: true,
      lawyerName: true,
      lawyerIdNo: true,
      lawyerPosition: true,
      contact: true,
      address: true,
      email: true,
      phone: true,
      username: true,
      password: true,
    });
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      const { data } = await agencyApi.create(values);
      setCreated({
        agencyName: data.name,
        agencyCode: data.code,
        agencyType: data.type || values.type,
        username: data.credentials.username,
        password: data.credentials.password,
        loginUrl: data.credentials.loginUrl,
        // Whether the same details also went out by email, and to whom.
        email: data.credentialsEmail || null,
      });
      setValues(EMPTY);
      setTouched({});
      toast(
        data.credentialsEmail?.delivered
          ? 'Agency created. Login details emailed to ' + data.credentialsEmail.to + '.'
          : 'Agency created successfully. Credentials are ready to share.',
      );
    } catch (err) {
      toast(err.message || 'Could not create the agency.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // The exact text placed on the clipboard by "Copy Details".
  const credentialText = () =>
    [
      (created.agencyType === 'foreign' ? 'Company: ' : 'Agency: ') +
        created.agencyName +
        ' (' +
        created.agencyCode +
        ')',
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
            title={foreign ? 'Company Details' : 'Agency Details'}
            subtitle={
              'These credentials are issued to the ' +
              (foreign ? 'company' : 'agency') +
              ' owner on creation.'
            }
          />
          <form onSubmit={handleSubmit} noValidate>
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <fieldset className="sm:col-span-2">
                <legend className="field-label">
                  Type <span className="text-red-500">*</span>
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {AGENCY_TYPES.map((type) => {
                    const checked = values.type === type.id;
                    return (
                      <label
                        key={type.id}
                        htmlFor={'type-' + type.id}
                        className={
                          'flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ' +
                          (checked
                            ? 'border-primary-400 bg-primary-50/60 ring-1 ring-primary-200'
                            : 'border-gray-200 hover:bg-gray-50')
                        }
                      >
                        <input
                          id={'type-' + type.id}
                          type="radio"
                          name="type"
                          value={type.id}
                          checked={checked}
                          onChange={handleChange}
                          className="mt-1 h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-gray-900">
                            {type.label}
                          </span>
                          <span className="block text-xs text-gray-500">{type.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {values.type === 'foreign' && (
                <div className="sm:col-span-2">
                  {/* The same list the registration screen offers, kept here. */}
                  <CountrySelect
                    manage
                    value={values.country}
                    onChange={(country) => {
                      setValues((v) => ({ ...v, country }));
                      setErrors((prev) => ({ ...prev, country: undefined }));
                    }}
                    error={touched.country ? errors.country : undefined}
                    hint="Where the company is based. Add or remove what this list offers."
                  />
                </div>
              )}

              <Input
                label={foreign ? 'Company name' : 'Agency name'}
                name="name"
                required
                placeholder="e.g. Skyline Marketing Pvt Ltd"
                value={values.name}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.name}
                icon={IconBuilding}
                className={foreign ? '' : 'sm:col-span-2'}
              />

              {/* Filed by a foreign company only. */}
              {foreign && (
                <Input
                  label="Registration No"
                  name="registrationNo"
                  required
                  placeholder="e.g. 514236789"
                  value={values.registrationNo}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={errors.registrationNo}
                  hint={
                    !errors.registrationNo
                      ? 'As it appears on the company registration.'
                      : undefined
                  }
                />
              )}

              {/* The lawyer who acts for the company. */}
              {foreign && (
                <fieldset className="grid gap-5 rounded-lg border border-gray-200 p-4 sm:col-span-2 sm:grid-cols-3">
                  <legend className="px-1 text-sm font-semibold text-gray-900">
                    Company lawyer <span className="font-normal text-gray-500">(optional)</span>
                  </legend>
                  <p className="text-xs text-gray-500 sm:col-span-3">
                    Leave these empty and the company fills them in itself on Company Details, as it does its
                    seal and signature. They are needed before it can send an agreement.
                  </p>

                  <Input
                    label="Lawyer name"
                    name="lawyerName"
                    placeholder="e.g. Ruth Levin"
                    value={values.lawyerName}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.lawyerName}
                    icon={IconUsers}
                  />

                  <Input
                    label="Lawyer ID No"
                    name="lawyerIdNo"
                    placeholder="e.g. 038512477"
                    value={values.lawyerIdNo}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.lawyerIdNo}
                  />

                  <Input
                    label="Position"
                    name="lawyerPosition"
                    placeholder="e.g. Company Secretary"
                    value={values.lawyerPosition}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={errors.lawyerPosition}
                  />
                </fieldset>
              )}

              <Input
                label="Contact Person"
                name="contact"
                required
                placeholder="e.g. Nadia Perera"
                value={values.contact}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.contact}
                icon={IconUsers}
                className="sm:col-span-2"
                hint={
                  !errors.contact
                    ? 'Who to call at the agency. The owner login is created under this name.'
                    : undefined
                }
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
                  className={
                    'field-input resize-none ' + (errors.address ? 'field-input-error' : '')
                  }
                />
                {errors.address && <p className="field-error">{errors.address}</p>}
              </div>

              <Input
                label="Email"
                name="email"
                type="email"
                required
                placeholder="owner@agency.lk"
                value={values.email}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.email}
                hint={!errors.email ? 'Sign-in codes are emailed here.' : undefined}
              />

              <Input
                label="Phone"
                name="phone"
                type="tel"
                required
                placeholder="0771234567"
                value={values.phone}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.phone}
                hint={!errors.phone ? 'Sign-in codes are texted here.' : undefined}
              />

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
            subtitle={
              created ? 'Share these with the agency owner.' : 'Shown after the agency is created.'
            }
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
                    <span className="font-semibold">{created.agencyName}</span>
                    {created.agencyType === 'foreign'
                      ? ' (foreign company)'
                      : ' (local agency)'}{' '}
                    was created and is now awaiting approval. These credentials work only once you
                    approve it in the Agency List.
                  </p>
                </div>

                {created.email &&
                  (created.email.delivered ? (
                    <div className="flex items-start gap-2.5 rounded-lg bg-primary-50 px-3.5 py-3 text-sm text-primary-800 ring-1 ring-inset ring-primary-100">
                      <IconMail className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        Login details emailed to{' '}
                        <span className="break-all font-semibold">{created.email.to}</span>.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 px-3.5 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
                      <IconMail className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        The email to{' '}
                        <span className="break-all font-semibold">{created.email.to}</span> was not
                        sent - email delivery is not set up yet. Copy the details below and share
                        them yourself.
                      </p>
                    </div>
                  ))}

                <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {[
                    [
                      created.agencyType === 'foreign' ? 'Company Code' : 'Agency Code',
                      created.agencyCode,
                    ],
                    ['Username', created.username],
                    ['Password', created.password],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-3 px-3.5 py-3"
                    >
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
