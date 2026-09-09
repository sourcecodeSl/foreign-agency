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

  const value = useMemo(
    () => ({
      admin,
      challenge,
      booting,
      isAuthenticated: !!admin && !!tokenStore.get(),

      /*
       * Where this role belongs after signing in. An agency account exists to
       * register candidates, so the admin dashboard is not its home.
       */
      homePath: homePathFor(admin?.roleSlug),

      /** Step 1: credentials -> opens the phone challenge. */
      async login(credentials) {
        // A fresh sign-in supersedes any earlier session. Without this, a token
        // left in localStorage would make the verification screens think the
        // user is already authenticated and let them skip the email step.
        tokenStore.clear();
        setAdmin(null);

        const { data } = await authApi.login(credentials);
        setChallenge({
          stage: 'phone',
          id: data.challengeId,
          maskedPhone: data.maskedPhone,
          // Present only outside production, so the OTP screen can display it
          // while real delivery is not configured.
          devCode: data.devCode,
        });
        return data;
      },

      /**
       * Step 2: phone code -> opens the email challenge.
       * Deliberately issues no token; the session starts only after step 3.
       */
      async verifyOtp(code) {
        const { data } = await authApi.verifyOtp({ challengeId: challenge?.id, code });
        setChallenge((prev) => ({
          ...prev,
          stage: 'email',
          id: data.challengeId, // rotated, so the phone code cannot be replayed
          maskedEmail: data.maskedEmail,
          devCode: data.devCode,
        }));
        return data;
      },

      /** Step 3: email code -> both factors confirmed, session token issued. */
      async verifyEmail(code) {
        const { data } = await authApi.verifyEmail({ challengeId: challenge?.id, code });
        tokenStore.set(data.token);
        setAdmin(data.admin);
        setChallenge(null);
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

      logout() {
        tokenStore.clear();
        setAdmin(null);
        setChallenge(null);
      },
    }),
    [admin, challenge, booting]
  );

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
