import { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import useCountdown from '../../lib/useCountdown';
import { IconRefresh } from '../ui/Icons';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 59;

/**
 * Six-box OTP entry with a 59-second resend countdown.
 *
 * Shared by the phone and email verification steps - the only differences are
 * the icon, the destination label and which API call runs on submit.
 *
 * @param {(code: string) => Promise<any>} onVerify  resolves to continue, throws to show an error
 * @param {() => Promise<any>} onResend              re-sends the code
 * @param {string} [devCode]                         shown on screen while delivery is not configured
 */
export default function OtpForm({
  icon: Icon,
  destination,
  destinationLabel = 'Code sent to',
  devCode,
  onVerify,
  onResend,
  submitLabel = 'Verify & Continue',
}) {
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputsRef = useRef([]);

  const { secondsLeft, isRunning, restart, formatted } = useCountdown(RESEND_SECONDS);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  // A new destination means a new step - clear whatever was typed before.
  useEffect(() => {
    setDigits(Array(OTP_LENGTH).fill(''));
    setError('');
    setNotice('');
    inputsRef.current[0]?.focus();
  }, [destination]);

  const setDigitAt = (index, value) => {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleChange = (index, raw) => {
    const value = raw.replace(/\D/g, '');
    setError('');

    if (!value) return setDigitAt(index, '');

    // Handle a multi-character paste or fast typing by spreading forward.
    if (value.length > 1) {
      const chars = value.slice(0, OTP_LENGTH - index).split('');
      setDigits((prev) => {
        const next = [...prev];
        chars.forEach((c, i) => {
          next[index + i] = c;
        });
        return next;
      });
      inputsRef.current[Math.min(index + chars.length, OTP_LENGTH - 1)]?.focus();
      return;
    }

    setDigitAt(index, value);
    if (index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
      setDigitAt(index - 1, '');
    }
    if (e.key === 'ArrowLeft' && index > 0) inputsRef.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!text) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill('');
    text.split('').forEach((c, i) => {
      next[i] = c;
    });
    setDigits(next);
    inputsRef.current[Math.min(text.length, OTP_LENGTH - 1)]?.focus();
  };

  /** Drops the displayed demo code straight into the six boxes. */
  const fillDevCode = () => {
    const dev = String(devCode || '').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (dev.length !== OTP_LENGTH) return;
    setError('');
    setDigits(dev.split(''));
    inputsRef.current[OTP_LENGTH - 1]?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setNotice('');

    const code = digits.join('');
    if (code.length !== OTP_LENGTH) {
      setError('Please enter all ' + OTP_LENGTH + ' digits.');
      return;
    }

    setLoading(true);
    try {
      await onVerify(code);
    } catch (err) {
      setError(err.message || 'Verification failed.');
      setDigits(Array(OTP_LENGTH).fill(''));
      inputsRef.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (isRunning || resending) return;
    setResending(true);
    setError('');
    try {
      await onResend();
      setNotice('A new verification code has been sent.');
      setDigits(Array(OTP_LENGTH).fill(''));
      inputsRef.current[0]?.focus();
      restart(RESEND_SECONDS); // start the 59s cooldown again
    } catch (err) {
      setError(err.message || 'Could not resend the code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-3 rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary-800 ring-1 ring-inset ring-primary-100">
        {Icon && <Icon className="h-5 w-5 shrink-0 text-primary-600" />}
        <p>
          {destinationLabel} <span className="font-semibold">{destination}</span>
        </p>
      </div>

      {/*
        Development helper: real delivery is not wired up yet, so the code is
        shown here. The backend omits `devCode` when NODE_ENV=production,
        which makes this whole block disappear on its own.
      */}
      {devCode && (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Demo mode - your code
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-amber-900">
                {devCode}
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={fillDevCode}>
              Autofill
            </Button>
          </div>
          <p className="mt-2 text-xs text-amber-700">
            Shown because delivery is not configured. Hidden automatically in production.
          </p>
        </div>
      )}

      <div>
        <label className="field-label">Verification code</label>
        <div className="flex gap-2 sm:gap-3" onPaste={handlePaste}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputsRef.current[index] = el)}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={OTP_LENGTH}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onFocus={(e) => e.target.select()}
              aria-label={'Digit ' + (index + 1)}
              className={
                'h-14 w-full rounded-lg border text-center text-xl font-semibold text-gray-900 ' +
                'transition focus:outline-none focus:ring-4 ' +
                (error
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                  : digit
                  ? 'border-primary-400 bg-primary-50/40 focus:border-primary-500 focus:ring-primary-100'
                  : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100')
              }
            />
          ))}
        </div>

        {error && <p className="field-error">{error}</p>}
        {notice && !error && <p className="mt-1.5 text-xs font-medium text-emerald-600">{notice}</p>}
      </div>

      <Button type="submit" size="lg" className="w-full" loading={loading}>
        {loading ? 'Verifying...' : submitLabel}
      </Button>

      {/* Resend with 59s countdown */}
      <div className="text-center text-sm">
        {isRunning ? (
          <p className="text-gray-500">
            Didn&apos;t receive the code? Resend in{' '}
            <span className="inline-flex min-w-[3.25rem] justify-center rounded-md bg-gray-100 px-2 py-0.5 font-mono font-semibold text-gray-700 tabular-nums">
              {formatted}
            </span>
          </p>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="inline-flex items-center gap-1.5 font-semibold text-primary-600 hover:text-primary-700 disabled:opacity-60"
          >
            <IconRefresh className={'h-4 w-4 ' + (resending ? 'animate-spin' : '')} />
            {resending ? 'Sending...' : 'Resend Code'}
          </button>
        )}

        <div className="mx-auto mt-3 h-1 w-40 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-primary-500 transition-all duration-1000 ease-linear"
            style={{ width: (secondsLeft / RESEND_SECONDS) * 100 + '%' }}
          />
        </div>
      </div>
    </form>
  );
}
