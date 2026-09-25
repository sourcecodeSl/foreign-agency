import { confirmAction } from './alert';

/**
 * A pop-up for the local agency when a foreign company adds a line to one of
 * its candidates' test documents - on top of the bell, which lists it too.
 *
 * Each line pops up once per login in this browser. Storage can be
 * unavailable, in which case it may pop up again on the next visit rather
 * than not at all.
 */
const PREFIX = 'test-line-';
const key = (accountId) => 'aa.testLines.alerted.' + accountId;

function readAlerted(accountId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key(accountId)) || '[]'));
  } catch {
    return new Set();
  }
}

function writeAlerted(accountId, ids) {
  try {
    // The newest few hundred are plenty; the bell never lists more than a page.
    localStorage.setItem(key(accountId), JSON.stringify([...ids].slice(-300)));
  } catch {
    /* nothing to remember it in */
  }
}

// One dialog at a time, however often the bell refreshes.
let showing = false;

/**
 * Pops up the test lines on the bell that have not popped up yet. Resolves
 * to the item the person chose to open, or null.
 */
export async function alertNewTestLines(items, accountId) {
  if (showing) return null;

  const alerted = readAlerted(accountId);
  const fresh = (items || []).filter((item) => String(item.id).startsWith(PREFIX) && !alerted.has(item.id));
  if (fresh.length === 0) return null;

  fresh.forEach((item) => alerted.add(item.id));
  writeAlerted(accountId, alerted);

  // The bell lists newest first.
  const latest = fresh[0];
  showing = true;
  try {
    const open = await confirmAction({
      icon: 'info',
      title: fresh.length === 1 ? 'New test line' : fresh.length + ' new test lines',
      text:
        fresh.length === 1
          ? latest.title + ': ' + latest.body
          : fresh.map((item) => item.title).join('. ') + '.',
      confirmText: fresh.length === 1 ? 'View test' : 'View latest',
      cancelText: 'Later',
    });
    return open ? latest : null;
  } finally {
    showing = false;
  }
}
