const VARIANTS = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-100 disabled:bg-primary-300',
  secondary:
    'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-100 disabled:text-gray-400',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 focus:ring-gray-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-100 disabled:bg-red-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-100',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-5 py-3 text-sm gap-2',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  className = '',
  children,
  disabled,
  ...rest
}) {
  return (
    <button
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center rounded-lg font-semibold transition',
        'focus:outline-none focus:ring-4 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
        </svg>
      ) : (
        Icon && <Icon className="h-4 w-4" />
      )}
      {children}
    </button>
  );
}
