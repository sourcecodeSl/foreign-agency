import { Navigate, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/layout/AuthLayout';
import OtpForm from '../../components/auth/OtpForm';
import StepIndicator, { signInSteps } from '../../components/auth/StepIndicator';
import { useAuth, nextPathFor } from '../../context/AuthContext';
import { IconPhone } from '../../components/ui/Icons';

/**
 * Confirm the registered phone number. Asked only until it has been confirmed
 * once - normally on the agency's first sign-in.
 */
export default function VerifyPhone() {
  const navigate = useNavigate();
  const { challenge, verifyOtp, resendOtp, isAuthenticated, homePath } = useAuth();

  // Phone already done - the email step is what is outstanding. Checked before
  // the session test so a stale token can never skip a step.
  if (challenge?.stage === 'email') return <Navigate to="/verify-email" replace />;

  // Nothing to verify without a login challenge in flight.
  if (!challenge) return <Navigate to={isAuthenticated ? homePath : '/login'} replace />;

  const steps = signInSteps(challenge.steps);
  const counter = steps.length > 1 ? 'Step 1 of ' + steps.length + '. ' : '';

  return (
    <AuthLayout
      title="Verify your phone number"
      subtitle={counter + 'We sent a 6-digit code to your registered number. You only need to confirm it once.'}
      footer={
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Use a different account
        </button>
      }
    >
      {steps.length > 1 && <StepIndicator current="phone" steps={steps} />}

      <OtpForm
        icon={IconPhone}
        destination={challenge?.maskedPhone || '078 XXX 1850'}
        devCode={challenge?.devCode}
        submitLabel="Verify Phone"
        onResend={resendOtp}
        onVerify={async (code) => {
          // Opens the email code if that is still owed, otherwise the session.
          const data = await verifyOtp(code);
          navigate(nextPathFor(data), { replace: true });
        }}
      />
    </AuthLayout>
  );
}
