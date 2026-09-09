import { Navigate, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/layout/AuthLayout';
import OtpForm from '../../components/auth/OtpForm';
import StepIndicator from '../../components/auth/StepIndicator';
import { useAuth, homePathFor } from '../../context/AuthContext';
import { IconMail, IconCheck } from '../../components/ui/Icons';

/** Step 2 of 2: confirm the email address. Only this step issues the session. */
export default function VerifyEmail() {
  const navigate = useNavigate();
  const { challenge, verifyEmail, resendOtp, isAuthenticated, homePath } = useAuth();

  // An in-flight challenge always wins over an existing session, otherwise a
  // stale token would let this required step be skipped.
  if (challenge?.stage === 'phone') return <Navigate to="/verify-phone" replace />;
  if (!challenge) return <Navigate to={isAuthenticated ? homePath : '/login'} replace />;

  return (
    <AuthLayout
      title="Verify your email address"
      subtitle="Step 2 of 2. One last code to finish signing in."
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
      <StepIndicator current="email" />

      <div className="mb-5 flex items-center gap-2.5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
        <IconCheck className="h-4 w-4 shrink-0" />
        <p>
          Phone number <span className="font-semibold">{challenge.maskedPhone}</span> verified.
        </p>
      </div>

      <OtpForm
        icon={IconMail}
        destination={challenge.maskedEmail}
        devCode={challenge.devCode}
        submitLabel="Verify Email & Sign In"
        onResend={resendOtp}
        onVerify={async (code) => {
          // Both factors confirmed - this is where the token is issued.
          const data = await verifyEmail(code);
          navigate(homePathFor(data?.admin?.roleSlug), { replace: true });
        }}
      />
    </AuthLayout>
  );
}
