import { useEffect, useRef, useState } from 'react';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.css';
import { IconCalendar } from './Icons';

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

/** A day picked on the calendar, as an ISO date, in local time. */
const isoOf = (date) =>
  date
    ? date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
    : '';

/** An ISO date as a local Date for the calendar, or null. */
const dateOf = (iso) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};

/**
 * A date written the way it is read here: dd/mm/yyyy.
 *
 * Picked on a calendar (flatpickr) or typed, with the slashes put in as the
 * digits go. The browser's own date box follows the language the browser is
 * set to, which puts the month first for most people here, so it is not
 * used. The value handed up and taken in is the ISO date the API speaks
 * (2031-05-01), so a form using this reads like any other field: `onChange`
 * is called with { target: { name, value } }.
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
  const inputRef = useRef(null);
  const pickerRef = useRef(null);
  // The calendar is made once; it reads the latest props through here.
  const latest = useRef({});
  latest.current = { name, onChange };

  useEffect(() => {
    const picker = flatpickr(inputRef.current, {
      dateFormat: 'd/m/Y',
      // Typing stays open; the calendar is there for whoever wants it.
      allowInput: true,
      // The phone's own picker would bring the month-first format back.
      disableMobile: true,
      defaultDate: dateOf(value),
      minDate: dateOf(min),
      maxDate: dateOf(max),
      onChange: ([date]) => {
        // Text that is not a date yet stays as typed; only a real day is shown back.
        if (date) setText(toDisplay(isoOf(date)));
        latest.current.onChange?.({ target: { name: latest.current.name, value: isoOf(date) } });
      },
    });
    pickerRef.current = picker;

    return () => {
      picker.destroy();
      pickerRef.current = null;
    };
    // Made once; later changes reach it through the effects below.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    pickerRef.current?.set('minDate', dateOf(min));
    pickerRef.current?.set('maxDate', dateOf(max));
  }, [min, max]);

  // A value set from elsewhere - a file reloaded, a form reset - shows here,
  // and on the calendar.
  useEffect(() => {
    setText((typed) => (toIso(typed, { min, max }) === (value || '') ? typed : toDisplay(value)));

    const picker = pickerRef.current;
    if (picker && isoOf(picker.selectedDates[0]) !== (value || '')) {
      picker.setDate(dateOf(value), false);
    }
  }, [value, min, max]);

  const type = (next) => {
    const shown = format(next);
    setText(shown);
    const iso = toIso(shown, { min, max });
    // The calendar follows a typed day, without calling back again.
    if (iso) pickerRef.current?.setDate(dateOf(iso), false);
    // Half a date is no date: the field stays empty until it is a real day.
    onChange?.({ target: { name, value: iso } });
  };

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="field-label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          name={name}
          value={text}
          inputMode="numeric"
          placeholder="dd/mm/yyyy"
          autoComplete="off"
          onChange={(e) => type(e.target.value)}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          className={'field-input pr-10 ' + (error ? 'field-input-error' : '')}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Pick from the calendar"
          onClick={() => pickerRef.current?.open()}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 hover:text-primary-600"
        >
          <IconCalendar className="h-4 w-4" />
        </button>
      </div>
      {error ? <p className="field-error">{error}</p> : hint && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
