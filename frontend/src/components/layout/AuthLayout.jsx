/** The brand column's copy on the sign-in screens. */
function SignInAside() {
  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-widest text-primary-200">
        Secure Access
      </p>
      <div>
        <h2 className="max-w-md text-3xl font-bold leading-tight">
          One control room for every agency, user and permission.
        </h2>
        <p className="mt-4 max-w-md text-primary-100">
          Create agencies, issue credentials, verify identities and control exactly what each
          role is allowed to do.
        </p>
      </div>
      <dl className="grid max-w-md grid-cols-3 gap-6">
        {[
          ['128', 'Agencies'],
          ['2.4k', 'Users'],
          ['99.9%', 'Uptime'],
        ].map(([value, label]) => (
          <div key={label}>
            <dt className="text-2xl font-bold">{value}</dt>
            <dd className="text-sm text-primary-200">{label}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/**
 * Split-screen shell used by every unauthenticated screen
 * (login, phone OTP, email verification prompt, password reset).
 *
 * `aside` replaces the brand column's copy for a screen that needs its own;
 * it is laid out top / middle / bottom, so pass three children.
 */
export default function AuthLayout({ title, subtitle, children, footer, aside }) {
  return (
    <div className="flex min-h-screen bg-white">
      {/* Form column */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 xl:px-24">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white">
              AA
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-gray-900">Agency Admin</p>
              <p className="text-xs text-gray-500">Main Admin System</p>
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-gray-500">{subtitle}</p>}

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-8 text-center text-sm text-gray-500">{footer}</div>}
        </div>
      </div>

      {/* Brand column */}
      <div className="relative hidden w-1/2 overflow-hidden bg-primary-700 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-between p-14 text-white">
          {aside || <SignInAside />}
        </div>
      </div>
    </div>
  );
}
