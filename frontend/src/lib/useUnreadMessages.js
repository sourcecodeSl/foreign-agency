import { useEffect, useState } from 'react';
import { messagesApi } from './api';

// How often the menu badge asks again while the page is in view.
const REFRESH_MS = 15000;

/** Fired by the messages screen once it has read a conversation, so the badge drops at once. */
export const MESSAGES_READ_EVENT = 'aa:messages-read';

export function announceMessagesRead() {
  window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
}

/**
 * How many messages wait for whoever is signed in. Asking also tells the
 * server the messages reached this person's screen - the second grey tick.
 * A failed call leaves the last count in place.
 */
export default function useUnreadMessages(enabled) {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setTotal(0);
      return undefined;
    }

    let alive = true;
    const load = async () => {
      try {
        const { data } = await messagesApi.unread();
        if (alive) setTotal(Number(data?.total) || 0);
      } catch {
        /* the badge keeps its last count */
      }
    };

    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    window.addEventListener(MESSAGES_READ_EVENT, load);

    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(MESSAGES_READ_EVENT, load);
    };
  }, [enabled]);

  return total;
}
