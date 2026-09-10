import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { notificationsApi } from '../../lib/api';
import { IconBell, IconCheck } from '../ui/Icons';

// How often the list is re-read while the page is in view.
const REFRESH_MS = 60000;
// Long enough to cross the gap between the bell and the card.
const CLOSE_DELAY_MS = 150;

const TONES = {
  warning: 'bg-amber-500',
  info: 'bg-primary-500',
  success: 'bg-emerald-500',
  danger: 'bg-red-500',
  neutral: 'bg-gray-300',
};

/** "5 min ago", "3 h ago", "2 days ago", then the date itself. */
export function timeAgo(iso, now = Date.now()) {
  if (!iso) return '';
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + ' min ago';
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + ' h ago';
  const days = Math.round(hours / 24);
  if (days < 7) return days + (days === 1 ? ' day ago' : ' days ago');
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// What has been seen is remembered per account in this browser. Storage can
// be unavailable (private windows, blocked site data), so every access is
// guarded and the bell simply treats everything as new.
const seenKey = (id) => 'aa.notifications.seen.' + id;

function readSeen(id) {
  try {
    return Number(localStorage.getItem(seenKey(id))) || 0;
  } catch {
    return 0;
  }
}

function writeSeen(id, time) {
  try {
    localStorage.setItem(seenKey(id), String(time));
  } catch {
    /* nothing to remember it in */
  }
}

const timeOf = (item) => (item.at ? new Date(item.at).getTime() : 0);

/**
 * The bell in the top bar. Hovering shows the card; clicking pins it open,
 * which is also how it opens on a touch screen. The red dot means something
 * arrived since the card was last opened.
 */
export default function NotificationBell() {
  const { admin } = useAuth();
  const accountId = admin?.id ?? 'anonymous';

  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [seen, setSeen] = useState(() => readSeen(accountId));
  // Items newer than this are highlighted while the card is open.
  const [highlightSince, setHighlightSince] = useState(0);

  const wrapperRef = useRef(null);
  const closeTimer = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const load = useCallback(async () => {
    try {
      const { data } = await notificationsApi.list();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      // A failed refresh leaves the last list in place rather than putting
      // an error in the top bar.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    setSeen(readSeen(accountId));
  }, [accountId]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const unread = items.filter((item) => timeOf(item) > seen).length;

  // The newest item on the card is what counts as seen, so the dot comes
  // back only for something newer.
  const markSeen = useCallback(() => {
    const newest = itemsRef.current.reduce((max, item) => Math.max(max, timeOf(item)), 0);
    if (newest > 0) {
      writeSeen(accountId, newest);
      setSeen((prev) => Math.max(prev, newest));
    }
  }, [accountId]);

  const show = () => {
    clearTimeout(closeTimer.current);
    if (open) return;
    setHighlightSince(seen);
    setOpen(true);
    markSeen();
    load();
  };

  const close = useCallback(() => {
    clearTimeout(closeTimer.current);
    setOpen(false);
    setPinned(false);
    markSeen();
  }, [markSeen]);

  const handleLeave = () => {
    if (pinned) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(close, CLOSE_DELAY_MS);
  };

  const handleClick = () => {
    if (open && pinned) {
      close();
      return;
    }
    setPinned(true);
    show();
  };

  // A pinned card closes on Escape or a click anywhere else.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) close();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  const fresh = items.filter((item) => timeOf(item) > highlightSince).length;

  return (
    <div ref={wrapperRef} className="relative" onMouseEnter={show} onMouseLeave={handleLeave}>
      <button
        type="button"
        onClick={handleClick}
        className={
          'relative rounded-lg p-2 text-gray-600 hover:bg-gray-100 ' + (open ? 'bg-gray-100' : '')
        }
        aria-label={unread > 0 ? 'Notifications (' + unread + ' new)' : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <IconBell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        )}
      </button>

      {open && (
        // The top padding keeps the pointer inside this wrapper on its way
        // down from the bell, so the card does not close in the gap.
        <div className="absolute right-0 top-full z-30 w-[calc(100vw-2rem)] max-w-sm pt-2 sm:w-96">
          <div
            role="dialog"
            aria-label="Notifications"
            className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">Notifications</p>
              {fresh > 0 && (
                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">
                  {fresh} new
                </span>
              )}
            </div>

            {!loaded ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">Loading...</p>
            ) : items.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <IconCheck className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-medium text-gray-900">You&apos;re all caught up</p>
                <p className="mt-1 text-xs text-gray-500">
                  Anything that needs your attention will appear here.
                </p>
              </div>
            ) : (
              <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
                {items.map((item) => {
                  const isFresh = timeOf(item) > highlightSince;
                  return (
                    <li key={item.id}>
                      <Link
                        to={item.link || '#'}
                        onClick={close}
                        className={
                          'flex gap-3 px-4 py-3 transition hover:bg-gray-50 ' +
                          (isFresh ? 'bg-primary-50/40' : '')
                        }
                      >
                        <span
                          className={
                            'mt-1.5 h-2 w-2 shrink-0 rounded-full ' +
                            (TONES[item.tone] || TONES.neutral)
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-900">
                            {item.title}
                          </span>
                          {item.body && (
                            <span className="mt-0.5 block text-xs text-gray-500">{item.body}</span>
                          )}
                          <span className="mt-1 block text-xs text-gray-400">{timeAgo(item.at)}</span>
                        </span>
                        {isFresh && <span className="sr-only">(new)</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
