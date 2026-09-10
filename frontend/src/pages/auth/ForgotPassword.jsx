import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/layout/AuthLayout';
import OtpForm from '../../components/auth/OtpForm';
import StepIndicator from '../../components/auth/StepIndicator';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { authApi } from '../../lib/api';
import { IconUsers, IconMail, IconShield, IconCheck } from '../../components/ui/Icons';

const STEPS = [
  { id: 'account', label: 'Account' },
  { id: 'verify', label: 'Verify' },
  { id: 'password', label: 'Password' },
];

// Mirrors the server's rules, so the checklist and the API always agree.
const RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'A number', test: (p) => /[0-9]/.test(p) },
];

const COPY = {
  account: {
    title: 'Forgot your password?',
    subtitle:
      "Enter your username. We'll find the email address on your account and send a verification code to it.",
  },
  verify: {
    title: 'Check your email',
    subtitle: 'Enter the 6-digit code we sent, to confirm it is really you.',
  },
  password: {
    title: 'Choose a new password',
    subtitle: 'Your code was accepted. Set the password you will sign in with from now on.',
  },
  done: {
    title: 'Password updated',
    subtitle: 'Your password has been changed successfully.',
  },
};

const HOW_IT_WORKS = [
  ['Identify your account', 'Enter the username issued to you by the administrator.'],
  ['Confirm by email', 'A 6-digit code is sent to the email address registered to that account.'],
  ['Set a new password', 'Choose a strong password and sign straight back in.'],
];

/** Brand column for this screen: what happens, and why it is safe. */
function RecoveryAside() {
  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-widest text-primary-200">
        Account Recovery
      </p>

      <div>
        <h2 className="max-w-md text-3xl font-bold leading-tight">
          Locked out? You&apos;ll be back in within a minute.
        </h2>
        <p className="mt-4 max-w-md text-primary-100">
          Passwords are reset through the email address on your account, so only the person who
          holds it can change one.
        </p>

        <ol className="mt-10 max-w-md space-y-5">
          {HOW_IT_WORKS.map(([title, text], index) => (
            <li key={title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-semibold ring-1 ring-inset ring-white/25">
                {index + 1}
              </span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="mt-0.5 text-sm text-primary-100">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex max-w-md items-start gap-3 rounded-xl bg-white/10 p-4 text-sm text-primary-100 ring-1 ring-inset ring-white/15">
        <IconShield className="mt-0.5 h-5 w-5 shrink-0 text-white" />
        <p>
          Codes expire after 5 minutes. Our team will never ask you for a code - never share one
          with anyone.
        </p>
      </div>
    </>
  );
}

/**
 * Forgotten password, in three steps: the username identifies the account and
 * its email, a code sent there proves the person holds it, and only then is a
 * new password accepted. While email delivery is not configured the code is
 * shown on the page.
 */
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState('account'); // account -> verify -> password -> done
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [resetToken, setResetToken] = useState('');
  const [passwords, setPasswords] = useState({ password: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState({});

  const startOver = () => {
    setStep('account');
    setChallenge(null);
    setResetToken('');
    setPasswords({ password: '', confirm: '' });
    setPasswordErrors({});
    setFormError('');
  };

  const findAccount = async (e) => {
    e.preventDefault();
    if (!username.trim()) return setUsernameError('Enter your username.');

    setLoading(true);
    setFormError('');
    try {
      const { data } = await authApi.forgotPassword({ username: username.trim() });
      setChallenge({
        id: data.challengeId,
        username: data.username || username.trim(),
        maskedEmail: data.maskedEmail,
        devCode: data.devCode,
      });
      setStep('verify');
    } catch (err) {
      if (err.errors?.username) setUsernameError(err.errors.username);
      else setFormError(err.message || 'Could not start the password reset.');
    } finally {
      setLoading(false);
    }
  };

  // OtpForm shows whatever these throw, so they only handle success.
  const verifyCode = async (code) => {
    const { data } = await authApi.verifyResetCode({ challengeId: challenge.id, code });
    setResetToken(data.resetToken);
    setStep('password');
  };

  const resendCode = async () => {
    const { data } = await authApi.resendResetCode({ challengeId: challenge.id });
    setChallenge((prev) => ({ ...prev, devCode: data?.devCode }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswords((prev) => ({ ...prev, [name]: value }));
    setPasswordErrors((prev) => ({ ...prev, [name]: undefined }));
    setFormError('');
  };

  const savePassword = async (e) => {
    e.preventDefault();

    const found = {};
    if (!RULES.every((rule) => rule.test(passwords.password))) {
      found.password = 'Use at least 8 characters, including an uppercase letter and a number.';
    }
    if (!passwords.confirm) found.confirm = 'Confirm the new password.';
    else if (passwords.confirm !== passwords.password) found.confirm = 'The passwords do not match.';
    setPasswordErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    setFormError('');
    try {
      await authApi.resetPassword({
        resetToken,
        password: passwords.password,
        passwordConfirmation: passwords.confirm,
      });
      setStep('done');
    } catch (err) {
      if (err.errors) {
        setPasswordErrors({ password: err.errors.password, confirm: err.errors.passwordConfirmation });
      }
      setFormError(err.message || 'Could not update the password.');
    } finally {
      setLoading(false);
    }
  };

  const copy = COPY[step];

  return (
    <AuthLayout
      title={copy.title}
      subtitle={copy.subtitle}
      aside={<RecoveryAside />}
      footer={
        step !== 'done' && (
          <p>
            Remembered it?{' '}
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
              Back to sign in
            </Link>
          </p>
        )
      }
    >
      {step !== 'done' && <StepIndicator steps={STEPS} current={step} />}

      {formError && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {formError}
        </div>
      )}

      {step === 'account' && (
        <form onSubmit={findAccount} noValidate className="space-y-5">
          <Input
            label="Username"
            name="username"
            autoComplete="username"
            placeholder="Your username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setUsernameError('');
              setFormError('');
            }}
            error={usernameError}
            icon={IconUsers}
            required
            autoFocus
          />

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {loading ? 'Finding your account...' : 'Send Verification Code'}
          </Button>

          <p className="text-center text-xs text-gray-500">
            The code is sent to the email address registered to this account.
          </p>
        </form>
      )}

      {step === 'verify' && challenge && (
        <>
          <div className="mb-5 flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-4 py-3 text-sm ring-1 ring-inset ring-gray-200">
            <div className="flex min-w-0 items-center gap-2.5">
              <IconUsers className="h-4 w-4 shrink-0 text-gray-400" />
              <p className="truncate text-gray-600">
                Account <span className="font-semibold text-gray-900">{challenge.username}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={startOver}
              className="shrink-0 text-xs font-semibold text-primary-600 hover:text-primary-700"
            >
              Not you?
            </button>
          </div>

          <OtpForm
            icon={IconMail}
            destination={challenge.maskedEmail}
            devCode={challenge.devCode}
            submitLabel="Verify Code"
            onVerify={verifyCode}
            onResend={resendCode}
          />
        </>
      )}

      {step === 'password' && (
        <form onSubmit={savePassword} noValidate className="space-y-5">
          <div>
            <Input
              label="New password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Enter a new password"
              value={passwords.password}
              onChange={handlePasswordChange}
              error={passwordErrors.password}
              autoFocus
            />

            <ul className="mt-3 space-y-1.5">
              {RULES.map((rule) => {
                const met = rule.test(passwords.password);
                return (
                  <li
                    key={rule.label}
                    className={
                      'flex items-center gap-2 text-xs ' + (met ? 'text-emerald-700' : 'text-gray-500')
                    }
                  >
                    <span
                      className={
                        'flex h-4 w-4 items-center justify-center rounded-full ' +
                        (met ? 'bg-emerald-100' : 'bg-gray-100')
                      }
                    >
                      <IconCheck className={'h-3 w-3 ' + (met ? 'text-emerald-600' : 'text-gray-300')} />
                    </span>
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          </div>

          <Input
            label="Confirm new password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="Enter it again"
            value={passwords.confirm}
            onChange={handlePasswordChange}
            error={passwordErrors.confirm}
          />

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {loading ? 'Updating...' : 'Update Password'}
          </Button>
        </form>
      )}

      {step === 'done' && (
        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-lg bg-emerald-50 px-4 py-4 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
            <IconCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              The password for <span className="font-semibold">{challenge?.username}</span> has
              been changed. Use it the next time you sign in.
            </p>
          </div>

          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() =>
              navigate('/login', { replace: true, state: { username: challenge?.username } })
            }
          >
            Back to Sign In
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}
