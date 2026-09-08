const TONES = {
  gray: 'bg-gray-100 text-gray-700 ring-gray-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-primary-50 text-primary-700 ring-primary-200',
};

// Maps a domain status to a visual tone so every table renders status the same way.
export const STATUS_TONE = {
  pending: 'amber',
  active: 'green',
  deactivated: 'red',
  verified: 'green',
  unverified: 'gray',
  bounced: 'red',
  suspended: 'red',
};

export default function Badge({ tone = 'gray', dot = false, children }) {
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ' +
        (TONES[tone] || TONES.gray)
      }
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  return (
    <Badge tone={STATUS_TONE[status] || 'gray'} dot>
      {status}
    </Badge>
  );
}
