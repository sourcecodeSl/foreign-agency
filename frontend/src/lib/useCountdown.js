import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Counts down from `seconds` to 0, once per second.
 *
 * Returns { secondsLeft, isRunning, restart, formatted } where `formatted` is
 * mm:ss, e.g. 59 -> "00:59".
 *
 * The interval is cleared on unmount and whenever it is restarted, so leaving
 * the OTP screen mid-countdown never leaves a timer behind.
 */
export default function useCountdown(seconds = 59, { autoStart = true } = {}) {
  const [secondsLeft, setSecondsLeft] = useState(autoStart ? seconds : 0);
  const intervalRef = useRef(null);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const start = useCallback(
    (from = seconds) => {
      stop();
      setSecondsLeft(from);
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [seconds, stop]
  );

  useEffect(() => {
    if (autoStart) start(seconds);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pad = (n) => String(n).padStart(2, '0');

  return {
    secondsLeft,
    isRunning: secondsLeft > 0,
    restart: start,
    stop,
    formatted: pad(Math.floor(secondsLeft / 60)) + ':' + pad(secondsLeft % 60),
  };
}
