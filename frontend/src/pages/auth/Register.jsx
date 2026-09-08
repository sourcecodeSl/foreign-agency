import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/layout/AuthLayout';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { authApi } from '../../lib/api';
import { IconUsers, IconMail, IconPhone } from '../../components/ui/Icons';

const EMPTY = { name: '', email: '', phone: '', password: '', confirmPassword: '' };

/** Mirrors the express-validator rules on POST /auth/register. */
function validate(values) {
  const errors = {};

  if (!values.name.trim()) errors.name = 'Full name is required.';
  else if (values.name.trim().length < 3) errors.name = 'Name must be at least 3 characters.';

  if (!values.email.trim()) errors.email = 'Email is required.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    errors.email = 'Enter a valid email address.';

  if (!values.phone.trim()) errors.phone = 'Phone number is required.';
  else if (!/^[0-9+\s-]{9,20}$/.test(values.phone.trim()))
    errors.phone = 'Enter a valid phone number.';

  if (!values.password) errors.password = 'Password is required.';
  else if (values.password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (!/[A-Z]/.test(values.password))
    errors.password = 'Password must include an uppercase letter.';
  else if (!/[0-9]/.test(values.password)) errors.password = 'Password must include a number.';

  if (!values.confirmPassword) errors.confirmPassword = 'Please confirm your password.';
  else if (values.confirmPassword !== values.password)
    errors.confirmPassword = 'Passwords do not match.';

  return errors;
}

/** Simple strength meter driven by the same rules as the validator. */
function strengthOf(password) {
  if (!password) return { score: 0, label: '', tone: '' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return { score, label: 'Weak', tone: 'bg-red-500 text-red-600' };
  if (score === 3) return { score, label: 'Fair', tone: 'bg-amber-500 text-amber-600' };
  if (score === 4) return { score, label: 'Good', tone: 'bg-emerald-500 text-emerald-600' };
  return { score, label: 'Strong', tone: 'bg-emerald-600 text-emerald-700' };
}

export default function Register() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const strength = strengthOf(values.password);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const next = { ...values, [name]: value };
    setValues(next);
    setFormError('');
    // Re-validate a field only after it has been blurred once, so typing
    // does not flash errors at the user.
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
    setTouched({ name: true, email: true, phone: true, password: true, confirmPassword: true });
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    try {
      const { message } = await authApi.register(values);
      toast(message || 'Account created. You can sign in now.');
      navigate('/login', { replace: true });
    } catch (err) {
      // Field-level messages from the API land on the matching inputs.
      if (err.errors) setErrors((prev) => ({ ...prev, ...err.errors }));
      setFormError(err.message || 'Could not create your account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Register to access the agency management system."
      footer={
        <p>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          >
            {formError}
          </div>
        )}

        <Input
          label="Full name"
          name="name"
          required
          autoComplete="name"
          placeholder="Kamal Perera"
          value={values.name}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.name}
          icon={IconUsers}
        />

        <Input
          label="Email address"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={values.email}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.email}
          icon={IconMail}
        />

        <Input
          label="Phone number"
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          placeholder="0781311850"
          value={values.phone}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.phone}
          icon={IconPhone}
          hint={!errors.phone ? 'Your sign-in code is sent to this number.' : undefined}
        />

        <div>
          <Input
            label="Password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={values.password}
            onChange={handleChange}
            onBlur={handleBlur}
            error={errors.password}
          />

          {values.password && !errors.password && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex h-1 flex-1 gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={
                      'h-full flex-1 rounded-full ' +
                      (i < strength.score ? strength.tone.split(' ')[0] : 'bg-gray-200')
                    }
                  />
                ))}
              </div>
              <span className={'text-xs font-medium ' + strength.tone.split(' ')[1]}>
                {strength.label}
              </span>
            </div>
          )}
        </div>

        <Input
          label="Confirm password"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={values.confirmPassword}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.confirmPassword}
        />

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? 'Creating account...' : 'Create Account'}
        </Button>

        <p className="text-center text-xs text-gray-500">
          Signing in uses two-step verification: a code to your phone, then one to your email.
        </p>
      </form>
    </AuthLayout>
  );
}
