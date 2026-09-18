/**
 * How many requests are on their way to the API, for the bar along the top
 * of the screen (see TopLoader). Every request the app makes is counted
 * here except the background polls nobody is waiting on.
 */
let pending = 0;
const listeners = new Set();

const emit = () => listeners.forEach((listener) => listener(pending));

/** Counts one request in; call the returned function once it is over. */
export function trackRequest() {
  pending += 1;
  emit();

  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    pending = Math.max(0, pending - 1);
    emit();
  };
}

export function subscribeToLoading(listener) {
  listeners.add(listener);
  listener(pending);
  return () => listeners.delete(listener);
}
