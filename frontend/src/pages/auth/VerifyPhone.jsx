import { Navigate, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/layout/AuthLayout';
import OtpForm from '../../components/auth/OtpForm';
import StepIndicator from '../../components/auth/StepIndicator';
import { useAuth } from '../../context/AuthContext';
import { IconPhone } from '../../components/ui/Icons';

/** Step 1 of 2: confirm the registered phone number. */
export default function VerifyPhone() {
  const navigate = useNavigate();
  const { challenge, verifyOtp, resendOtp, isAuthenticated } = useAuth();

  // Phone already done - the email step is what is outstanding. Checked before
  // the session test so a stale token can never skip a step.
  if (challenge?.stage === 'email') return <Navigate to="/verify-email" replace />;

  // Nothing to verify without a login challenge in flight.
  if (!challenge) return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;

  return (
    <AuthLayout
      title="Verify your phone number"
      subtitle="Step 1 of 2. We sent a 6-digit code to your registered number."
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
      <StepIndicator current="phone" />

      <OtpForm
        icon={IconPhone}
        destination={challenge?.maskedPhone || '078 XXX 1850'}
        devCode={challenge?.devCode}
        submitLabel="Verify Phone"
        onResend={resendOtp}
        onVerify={async (code) => {
          // Issues no token - it opens the email challenge instead.
          await verifyOtp(code);
          navigate('/verify-email', { replace: true });
        }}
      />
    </AuthLayout>
  );
}
