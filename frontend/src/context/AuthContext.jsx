import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authApi, tokenStore } from '../lib/api';

const AuthContext = createContext(null);

const ADMIN_ROLES = ['main_admin', 'auditor'];

/**
 * Whether a role works across agencies rather than inside one.
 *
 * These roles review candidate files but do not own them, so the UI reads them
 * one agency at a time and never offers to register or attach anything.
 */
export function isGlobalRole(roleSlug) {
  return ADMIN_ROLES.includes(roleSlug);
}

/** Landing route for a role. */
export function homePathFor(roleSlug) {
  if (!roleSlug) return '/dashboard';
  return ADMIN_ROLES.includes(roleSlug) ? '/dashboard' : '/candidates';
}

/**
 * Where a sign-in step's answer sends the user: the next code to enter, or
 * the role's home once the session has been issued.
 */
export function nextPathFor(data) {
  if (data?.nextStep === 'phone') return '/verify-phone';
  if (data?.nextStep === 'email') return '/verify-email';
  return homePathFor(data?.admin?.roleSlug);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [challenge, setChallenge] = useState(null); // pending OTP step
  const [booting, setBooting] = useState(true);

  // Restore the session on a hard refresh.
  useEffect(() => {
    (async () => {
      if (!tokenStore.get()) return setBooting(false);
      try {
        const { data } = await authApi.me();
        setAdmin(data);
      } catch {
        tokenStore.clear();
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const value = useMemo(() => {
    /**
     * Applies one sign-in step's answer. The server asks only for the codes a
     * login still owes - none for the Main Admin, none once an agency has
     * confirmed both - so any step may be the last, and then it carries the
     * token.
     */
    const advance = (data, earlier = null) => {
      if (data.nextStep === 'dashboard') {
        tokenStore.set(data.token);
        setAdmin(data.admin);
        setChallenge(null);
        return;
      }

      setChallenge({
        stage: data.nextStep,
        id: data.challengeId, // rotated each step, so an earlier code cannot be replayed
        // Every code this sign-in asks for, fixed at its first step.
        steps: earlier?.steps || data.steps || [data.nextStep],
        // Carried over only when the phone was confirmed during this sign-in.
        maskedPhone: data.maskedPhone || earlier?.maskedPhone,
        maskedEmail: data.maskedEmail,
        // Present only outside production, so the OTP screen can display it
        // while real delivery is not configured.
        devCode: data.devCode,
      });
    };

    return {
      admin,
      challenge,
      booting,
      isAuthenticated: !!admin && !!tokenStore.get(),

      /*
       * Where this role belongs after signing in. An agency account exists to
       * register candidates, so the admin dashboard is not its home.
       */
      homePath: homePathFor(admin?.roleSlug),

      /** Credentials -> the first code still owed, or straight to the session. */
      async login(credentials) {
        // A fresh sign-in supersedes any earlier session. Without this, a token
        // left in localStorage would make the verification screens think the
        // user is already authenticated and let them skip a step.
        tokenStore.clear();
        setAdmin(null);
        setChallenge(null);

        const { data } = await authApi.login(credentials);
        advance(data);
        return data;
      },

      /** Phone code -> the email code if that is still owed, else the session. */
      async verifyOtp(code) {
        const { data } = await authApi.verifyOtp({ challengeId: challenge?.id, code });
        advance(data, challenge);
        return data;
      },

      /** Email code -> the session. */
      async verifyEmail(code) {
        const { data } = await authApi.verifyEmail({ challengeId: challenge?.id, code });
        advance(data, challenge);
        return data;
      },

      /** Re-sends the code and refreshes the on-screen dev code with it. */
      async resendOtp() {
        const { data } = await authApi.resendOtp({ challengeId: challenge?.id });
        if (data?.devCode) {
          setChallenge((prev) => (prev ? { ...prev, devCode: data.devCode } : prev));
        }
        return data;
      },

      /** Re-reads the account, e.g. after the agency renamed itself. */
      async refresh() {
        const { data } = await authApi.me();
        setAdmin(data);
        return data;
      },

      logout() {
        tokenStore.clear();
        setAdmin(null);
        setChallenge(null);
      },
    };
  }, [admin, challenge, booting]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Wraps the dashboard routes; bounces unauthenticated visitors to /login. */
export function RequireAuth({ children }) {
  const { isAuthenticated, booting } = useAuth();
  const location = useLocation();

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
        Loading your workspace...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
