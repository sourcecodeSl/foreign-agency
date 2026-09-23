import { useEffect, useState } from 'react';

/** An ISO date (2031-05-01) as the screen writes it: 01/05/2031. */
export function toDisplay(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));

  return match ? match[3] + '/' + match[2] + '/' + match[1] : '';
}

/** A real day, so 31/02/2031 is refused rather than rolled into March. */
function realDay(day, month, year) {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * A typed dd/mm/yyyy as an ISO date, or '' while it is not a date yet.
 * Within `min` and `max` when they are given, both ISO.
 */
export function toIso(text, { min, max } = {}) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return '';

  const [, day, month, year] = match.map(Number);
  if (month < 1 || month > 12 || day < 1 || !realDay(day, month, year)) return '';

  const iso = match[3] + '-' + match[2] + '-' + match[1];
  if ((min && iso < min) || (max && iso > max)) return '';

  return iso;
}

/** Digits as they are typed, with the slashes put in: 01052031 -> 01/05/2031. */
function format(text) {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);

  return parts.join('/');
}

/**
 * A date written the way it is read here: dd/mm/yyyy.
 *
 * The browser's own date box follows the language the browser is set to,
 * which puts the month first for most people here, so the date is typed into
 * a plain field instead. The value handed up and taken in is the ISO date the
 * API speaks (2031-05-01), so a form using this reads like any other field:
 * `onChange` is called with { target: { name, value } }.
 */
export default function DateInput({
  label,
  name,
  value,
  onChange,
  onBlur,
  error,
  hint,
  required,
  min,
  max,
  className = '',
  id = name,
}) {
  const [text, setText] = useState(() => toDisplay(value));

  // A value set from elsewhere - a file reloaded, a form reset - shows here.
  useEffect(() => {
    setText((typed) => (toIso(typed, { min, max }) === (value || '') ? typed : toDisplay(value)));
  }, [value, min, max]);

  const type = (next) => {
    const shown = format(next);
    setText(shown);
    // Half a date is no date: the field stays empty until it is a real day.
    onChange?.({ target: { name, value: toIso(shown, { min, max }) } });
  };

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="field-label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <input
        id={id}
        name={name}
        value={text}
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        autoComplete="off"
        onChange={(e) => type(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        className={'field-input ' + (error ? 'field-input-error' : '')}
      />
      {error ? <p className="field-error">{error}</p> : hint && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
