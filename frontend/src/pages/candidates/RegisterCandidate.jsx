import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardBody, CardFooter } from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { IconUsers, IconMail, IconPhone, IconCheck } from '../../components/ui/Icons';
import { candidateApi } from '../../lib/api';

const EMPTY = { name: '', passportNo: '', nicNo: '', address: '', mobile: '', email: '' };

/**
 * Field rules, mirroring the server so the same wording appears either way.
 * Nothing here is verified by code or email - a candidate never signs in.
 */
function validate(values) {
  const errors = {};

  if (!values.name.trim()) errors.name = 'Full name is required.';
  else if (values.name.trim().length < 3) errors.name = 'Name must be at least 3 characters.';

  if (!values.passportNo.trim()) errors.passportNo = 'Passport number is required.';
  else if (!/^[A-Za-z0-9]+$/.test(values.passportNo.trim()))
    errors.passportNo = 'Letters and numbers only.';

  // Optional, but validated when supplied.
  if (values.nicNo.trim() && !/^([0-9]{9}[VvXx]|[0-9]{12})$/.test(values.nicNo.trim()))
    errors.nicNo = 'Enter a valid NIC (9 digits plus V/X, or 12 digits).';

  if (!values.address.trim()) errors.address = 'Address is required.';
  else if (values.address.trim().length < 5) errors.address = 'Please enter the full address.';

  if (!values.mobile.trim()) errors.mobile = 'Mobile number is required.';
  else if (!/^[0-9+\s-]{9,20}$/.test(values.mobile.trim()))
    errors.mobile = 'Enter a valid mobile number.';

  if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    errors.email = 'Enter a valid email address.';

  return errors;
}

export default function RegisterCandidate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const next = { ...values, [name]: value };
    setValues(next);
    setFormError('');
    if (touched[name]) setErrors((prev) => ({ ...prev, [name]: validate(next)[name] }));
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({ ...prev, [name]: validate(values)[name] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    setTouched(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, true])));
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const { data } = await candidateApi.create(values);
      toast('Candidate registered. Now attach the documents.');
      // Straight to the file, which is where the documents get attached.
      navigate('/candidates/' + data.candidate.id);
    } catch (err) {
      if (err.errors) setErrors((prev) => ({ ...prev, ...err.errors }));
      setFormError(err.message || 'Could not register the candidate.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Card>
        <CardHeader
          title="Register Candidate"
          subtitle="Enter the candidate details. Documents are attached on the next screen."
        />

        <form onSubmit={handleSubmit} noValidate>
          <CardBody className="grid gap-x-8 gap-y-6 p-6 sm:grid-cols-2 sm:p-8">
            {formError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 sm:col-span-2"
              >
                {formError}
              </div>
            )}

            <Input
              label="Full name"
              name="name"
              required
              placeholder="Kamal Perera"
              value={values.name}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.name}
              icon={IconUsers}
              className="sm:col-span-2"
            />

            <Input
              label="Passport number"
              name="passportNo"
              required
              placeholder="N1234567"
              value={values.passportNo}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.passportNo}
            />

            <Input
              label="NIC number"
              name="nicNo"
              placeholder="901234567V"
              value={values.nicNo}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.nicNo}
              hint={!errors.nicNo ? 'Optional.' : undefined}
            />

            <div className="sm:col-span-2">
              <label htmlFor="address" className="field-label">
                Address <span className="text-red-500">*</span>
              </label>
              <textarea
                id="address"
                name="address"
                rows={4}
                placeholder="Street, city and postal code"
                value={values.address}
                onChange={handleChange}
                onBlur={handleBlur}
                aria-invalid={errors.address ? true : undefined}
                className={'field-input resize-none ' + (errors.address ? 'field-input-error' : '')}
              />
              {errors.address && <p className="field-error">{errors.address}</p>}
            </div>

            <Input
              label="Mobile number"
              name="mobile"
              type="tel"
              required
              placeholder="0771234567"
              value={values.mobile}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.mobile}
              icon={IconPhone}
            />

            <Input
              label="Email"
              name="email"
              type="email"
              placeholder="kamal@example.com"
              value={values.email}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.email}
              icon={IconMail}
              hint={!errors.email ? 'Optional.' : undefined}
            />

            <div className="flex items-start gap-2.5 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600 sm:col-span-2">
              <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <p>
                None of these details need verifying — a candidate never signs in, so no code is
                sent to the mobile or the email.
              </p>
            </div>
          </CardBody>

          <CardFooter className="flex items-center justify-end gap-3 px-6 sm:px-8">
            <Button type="button" variant="secondary" onClick={() => navigate('/candidates')}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {saving ? 'Registering...' : 'Register & Attach Documents'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
