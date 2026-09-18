import { useEffect, useState } from 'react';
import { subscribeToLoading } from '../../lib/loading';

/**
 * A thin bar along the top of the screen while any request is on its way,
 * so every screen shows it is loading without each one drawing its own.
 * It waits a moment before appearing, so instant answers do not flicker.
 */
export default function TopLoader() {
  const [pending, setPending] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeToLoading(setPending), []);

  useEffect(() => {
    if (pending === 0) {
      setVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(timer);
  }, [pending]);

  if (!visible) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-1 overflow-hidden bg-primary-100"
    >
      <div className="top-loader-bar h-full w-1/3 rounded-r-full bg-primary-600" />
    </div>
  );
}
