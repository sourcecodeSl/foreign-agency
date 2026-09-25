import { IconBuilding, IconClock, IconShield, IconTicks } from '../../components/ui/Icons';
import { initials } from './format';

// Companies and agencies read apart at a glance, as they do in the list.
const AVATAR_TONES = {
  foreign: 'bg-amber-100 text-amber-700',
  local: 'bg-primary-100 text-primary-700',
  admin: 'bg-emerald-100 text-emerald-700',
};

/** Initials in a circle, with the green dot while someone there is online. */
export function Avatar({ name, type = 'local', online = false, size = 'md' }) {
  const box = size === 'sm' ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm';

  return (
    <span className={'relative inline-flex shrink-0 ' + box}>
      <span
        className={
          'flex h-full w-full items-center justify-center rounded-full font-semibold ' +
          (AVATAR_TONES[type] || AVATAR_TONES.local)
        }
        aria-hidden="true"
      >
        {type === 'admin' ? <IconShield className="h-5 w-5" /> : initials(name)}
      </span>
      {online && (
        <span
          className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-surface"
          title="Online"
        />
      )}
    </span>
  );
}

/** "Company · Israel" or "Local agency", under a name. */
export function KindLabel({ conversation }) {
  if (!conversation || conversation.type === 'admin') return null;
  const company = conversation.type === 'foreign';

  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
      <IconBuilding className="h-3.5 w-3.5" />
      {company ? 'Company' : 'Local agency'}
      {company && conversation.country ? ' · ' + conversation.country : ''}
    </span>
  );
}

/**
 * The ticks under a message this side sent: a clock while it is on its way,
 * one grey tick sent, two grey delivered, two blue read.
 */
export function Ticks({ status, className = 'h-4 w-4' }) {
  if (status === 'pending') {
    return <IconClock className="h-3.5 w-3.5 text-gray-400" aria-label="Sending" />;
  }
  if (status === 'read') {
    return <IconTicks double className={className + ' text-sky-500'} aria-label="Read" />;
  }
  if (status === 'delivered') {
    return <IconTicks double className={className + ' text-gray-400'} aria-label="Delivered" />;
  }
  if (status === 'sent') {
    return <IconTicks className={className + ' text-gray-400'} aria-label="Sent" />;
  }
  return null;
}
