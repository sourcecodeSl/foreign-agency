import { Navigate, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/layout/AuthLayout';
import OtpForm from '../../components/auth/OtpForm';
import StepIndicator, { signInSteps } from '../../components/auth/StepIndicator';
import { useAuth, nextPathFor } from '../../context/AuthContext';
import { IconMail, IconCheck } from '../../components/ui/Icons';

/**
 * Confirm the email address. Asked only until it has been confirmed once -
 * normally on the agency's first sign-in, right after the phone.
 */
export default function VerifyEmail() {
  const navigate = useNavigate();
  const { challenge, verifyEmail, resendOtp, isAuthenticated, homePath } = useAuth();

  // An in-flight challenge always wins over an existing session, otherwise a
  // stale token would let this required step be skipped.
  if (challenge?.stage === 'phone') return <Navigate to="/verify-phone" replace />;
  if (!challenge) return <Navigate to={isAuthenticated ? homePath : '/login'} replace />;

  const steps = signInSteps(challenge.steps);
  const position = steps.findIndex((step) => step.id === 'email') + 1;
  const counter = steps.length > 1 ? 'Step ' + position + ' of ' + steps.length + '. ' : '';

  return (
    <AuthLayout
      title="Verify your email address"
      subtitle={counter + 'One last code to finish signing in. You only need to confirm it once.'}
      footer={
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Cancel and start over
        </button>
      }
    >
      {steps.length > 1 && <StepIndicator current="email" steps={steps} />}

      {/* Only when the phone was confirmed during this sign-in. */}
      {challenge.maskedPhone && (
        <div className="mb-5 flex items-center gap-2.5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
          <IconCheck className="h-4 w-4 shrink-0" />
          <p>
            Phone number <span className="font-semibold">{challenge.maskedPhone}</span> verified.
          </p>
        </div>
      )}

      <OtpForm
        icon={IconMail}
        destination={challenge.maskedEmail}
        devCode={challenge.devCode}
        submitLabel="Verify Email & Sign In"
        onResend={resendOtp}
        onVerify={async (code) => {
          const data = await verifyEmail(code);
          navigate(nextPathFor(data), { replace: true });
        }}
      />
    </AuthLayout>
  );
}
