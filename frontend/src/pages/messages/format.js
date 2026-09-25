/** Times and labels the chat shows, in the reader's own locale and clock. */

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole days between the date and today: 0 today, 1 yesterday. */
function daysAgo(iso, now = Date.now()) {
  return Math.round((startOfDay(now) - startOfDay(iso)) / DAY_MS);
}

/** 10:32 */
export function clockTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** The divider between days: Today, Yesterday, Monday, or the date. */
export function dayLabel(iso, now = Date.now()) {
  const days = daysAgo(iso, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return new Date(iso).toLocaleDateString(undefined, { weekday: 'long' });
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** The time beside a conversation in the list. */
export function listTime(iso, now = Date.now()) {
  if (!iso) return '';
  const days = daysAgo(iso, now);
  if (days === 0) return clockTime(iso);
  if (days === 1) return 'Yesterday';
  if (days < 7) return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' });
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });
}

/** "online", "last seen today at 10:32", or nothing known. */
export function presenceLabel(person, now = Date.now()) {
  if (!person) return '';
  if (person.online) return 'online';
  if (!person.lastSeenAt) return 'offline';

  const days = daysAgo(person.lastSeenAt, now);
  const at = clockTime(person.lastSeenAt);
  if (days === 0) return 'last seen today at ' + at;
  if (days === 1) return 'last seen yesterday at ' + at;
  return (
    'last seen ' +
    new Date(person.lastSeenAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
    ' at ' +
    at
  );
}

export function sameDay(a, b) {
  return Boolean(a && b) && startOfDay(a) === startOfDay(b);
}

export function initials(name) {
  return (
    String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

export function fileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}
