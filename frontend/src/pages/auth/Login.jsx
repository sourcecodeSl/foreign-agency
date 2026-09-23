import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/layout/AuthLayout';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useAuth, nextPathFor } from '../../context/AuthContext';
import { IconUsers } from '../../components/ui/Icons';
import { alertError, alertInfo } from '../../lib/alert';

function validate({ username, password }) {
  const errors = {};
  if (!username.trim()) errors.username = 'Username is required.';
  if (!password) errors.password = 'Password is required.';
  else if (password.length < 6) errors.password = 'Password must be at least 6 characters.';
  return errors;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  // Arriving from a password reset brings the username along.
  const [values, setValues] = useState({
    username: location.state?.username || '',
    password: '',
    remember: true,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setValues((v) => ({ ...v, [name]: type === 'checkbox' ? checked : value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  // Bounced here because the session ended: say so once, then let the
  // address forget it so a refresh does not say it again.
  const sessionEnded = Boolean(location.state?.sessionEnded);
  useEffect(() => {
    if (!sessionEnded) return;
    alertInfo('Please sign in again to carry on.', 'Your session has ended', 'warning');
    navigate(location.pathname, { replace: true, state: { ...location.state, sessionEnded: false } });
  }, [sessionEnded, location.pathname, location.state, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    try {
      // The admin, and an agency that has confirmed its phone and email,
      // are signed in right here; anyone else goes on to the code still owed.
      const data = await login(values);
      navigate(nextPathFor(data));
    } catch (err) {
      alertError(err.message || 'Sign in failed. Please try again.', 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in to your account"
      subtitle="Enter the username and password issued to you."
      footer={
        <div className="space-y-1">
          <p>
            No account yet?{' '}
            <Link to="/register" className="font-medium text-primary-600 hover:text-primary-700">
              Register your agency or company
            </Link>
          </p>
          <p>
            <a
              href="mailto:support@agency.local"
              className="font-medium text-primary-600 hover:text-primary-700"
            >
              Contact support
            </a>
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Input
          label="Username"
          name="username"
          autoComplete="username"
          placeholder="mainadmin"
          value={values.username}
          onChange={handleChange}
          error={errors.username}
          icon={IconUsers}
          required
        />

        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={values.password}
          onChange={handleChange}
          error={errors.password}
          required
        />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              name="remember"
              checked={values.remember}
              onChange={handleChange}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Remember this device
          </label>
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>

        <p className="text-center text-xs text-gray-500">
          On an agency's first sign-in, its phone number and email address are confirmed with a
          one-time code. After that, the password is enough.
        </p>
      </form>
    </AuthLayout>
  );
}
