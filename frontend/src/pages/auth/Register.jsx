import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../../components/layout/AuthLayout';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import CountrySelect from '../../components/ui/CountrySelect';
import { authApi } from '../../lib/api';
import { alertError } from '../../lib/alert';

const TYPES = [
  {
    id: 'local',
    label: 'Local agency',
    description: 'A recruitment agency in Sri Lanka.',
  },
  {
    id: 'foreign',
    label: 'Foreign company',
    description: 'A company overseas that employs the candidates.',
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\s-]{9,20}$/;

const EMPTY = {
  type: '',
  name: '',
  country: '',
  registrationNo: '',
  contact: '',
  address: '',
  email: '',
  phone: '',
};

function validate(values) {
  const errors = {};
  if (!values.type) errors.type = 'Choose a local agency or a foreign company.';
  if (values.name.trim().length < 3) errors.name = 'Name must be at least 3 characters.';
  if (values.contact.trim().length < 3) errors.contact = 'Contact name must be at least 3 characters.';
  if (values.address.trim().length < 8) errors.address = 'Please provide the full address.';
  if (!EMAIL_RE.test(values.email.trim())) errors.email = 'Enter a valid email address.';
  if (!PHONE_RE.test(values.phone.trim())) errors.phone = 'Enter a valid phone number.';

  if (values.type === 'foreign') {
    if (!values.country.trim()) errors.country = 'Enter the country your company is based in.';
    if (!values.registrationNo.trim()) errors.registrationNo = "Enter your company's registration number.";
  }

  return errors;
}

/** What the applicant sees once the application is in: nothing more to do. */
function Filed({ application }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-sm font-semibold text-emerald-900">Registration received</p>
        <p className="mt-1 text-sm text-emerald-800">
          Your reference is <span className="font-semibold">{application.reference}</span>. Keep it for any
          question about your registration.
        </p>
      </div>

      <div className="space-y-2 text-sm text-gray-600">
        <p>
          The administrator reviews every registration. Once yours is approved, your username and password are
          emailed to <span className="font-medium text-gray-900">{application.email}</span>.
        </p>
        <p>You cannot sign in until then.</p>
      </div>

      <Link to="/login" className="block">
        <Button className="w-full">Back to sign in</Button>
      </Link>
    </div>
  );
}

/**
 * An agency registers itself: its own details, as a local agency or a
 * foreign company. No login is chosen here - the application is filed as
 * pending, and the administrator issues the credentials on approving it.
 */
export default function Register() {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [application, setApplication] = useState(null);

  const foreign = values.type === 'foreign';

  const change = (e) => {
    const { name, value } = e.target;
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    try {
      const { data } = await authApi.register({
        type: values.type,
        name: values.name.trim(),
        country: foreign ? values.country.trim() : undefined,
        registrationNo: foreign ? values.registrationNo.trim() : undefined,
        contact: values.contact.trim(),
        address: values.address.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
      });
      setApplication(data);
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      alertError(err.message || 'Could not send your registration.', 'Not registered');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={application ? 'Registration received' : 'Register your agency'}
      subtitle={
        application
          ? 'The administrator reviews it and emails your login.'
          : 'Send your details. The administrator approves the registration and emails your login.'
      }
      footer={
        application ? null : (
          <p>
            Already have a login?{' '}
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
              Sign in
            </Link>
          </p>
        )
      }
    >
      {application ? (
        <Filed application={application} />
      ) : (
        <form onSubmit={submit} noValidate className="space-y-5">
          <fieldset>
            <legend className="field-label">
              Registering as <span className="text-red-500">*</span>
            </legend>
            <div className="mt-1 grid gap-2">
              {TYPES.map((type) => (
                <label
                  key={type.id}
                  htmlFor={'type-' + type.id}
                  className={
                    'flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ' +
                    (values.type === type.id
                      ? 'border-primary-400 bg-primary-50/60 ring-1 ring-primary-200'
                      : 'border-gray-200 hover:bg-gray-50')
                  }
                >
                  <input
                    id={'type-' + type.id}
                    type="radio"
                    name="type"
                    value={type.id}
                    checked={values.type === type.id}
                    onChange={change}
                    className="mt-1 h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{type.label}</span>
                    <span className="block text-xs text-gray-500">{type.description}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.type && <p className="field-error">{errors.type}</p>}
          </fieldset>

          <Input
            label={foreign ? 'Company name' : 'Agency name'}
            name="name"
            required
            value={values.name}
            onChange={change}
            error={errors.name}
          />

          {foreign && (
            <>
              <CountrySelect
                value={values.country}
                onChange={(country) => {
                  setValues((v) => ({ ...v, country }));
                  setErrors((prev) => ({ ...prev, country: undefined }));
                }}
                error={errors.country}
                hint="Where your company is registered."
              />
              <Input
                label="Company registration number"
                name="registrationNo"
                required
                value={values.registrationNo}
                onChange={change}
                error={errors.registrationNo}
              />
            </>
          )}

          <Input
            label="Contact person"
            name="contact"
            required
            hint="The login is created in this name."
            value={values.contact}
            onChange={change}
            error={errors.contact}
          />

          <Input
            label="Address"
            name="address"
            required
            value={values.address}
            onChange={change}
            error={errors.address}
          />

          <Input
            label="Email"
            name="email"
            type="email"
            required
            hint="Your login is emailed here once approved."
            value={values.email}
            onChange={change}
            error={errors.email}
          />

          <Input
            label="Phone"
            name="phone"
            required
            hint="Sign-in codes are sent to this number."
            value={values.phone}
            onChange={change}
            error={errors.phone}
          />

          <Button type="submit" className="w-full" loading={loading}>
            Send registration
          </Button>

          <p className="text-center text-xs text-gray-500">
            The lawyer's details a foreign company needs for its agreements are filled in later, on Company
            Details.
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
