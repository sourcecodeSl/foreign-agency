/**
 * An on/off switch. `label` names it for screen readers, since the switch
 * itself carries no text.
 */
export default function Switch({ checked, onChange, disabled = false, loading = false, label, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled || loading}
      onClick={() => onChange(!checked)}
      className={
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ' +
        'focus:outline-none focus:ring-4 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50 ' +
        (checked ? 'bg-emerald-500' : 'bg-gray-300') +
        (loading ? ' animate-pulse' : '')
      }
    >
      <span
        className={
          'inline-block h-5 w-5 rounded-full bg-white shadow transition ' +
          (checked ? 'translate-x-5' : 'translate-x-0.5')
        }
      />
    </button>
  );
}
