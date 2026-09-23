import { useCallback, useEffect, useState } from 'react';
import Button from './Button';
import { countryApi } from '../../lib/api';
import { alertError, confirmAction } from '../../lib/alert';

/**
 * The country a foreign company is registered in, picked from the list the
 * Main Admin and coordinators keep.
 *
 * `manage` adds the admin's own controls to it: a country can be added to the
 * list, or the picked one taken off it. The registration screen, which
 * nobody is signed in on, leaves them out.
 */
export default function CountrySelect({ value, onChange, error, hint, manage = false, id = 'country' }) {
  const [countries, setCountries] = useState(null);
  const [adding, setAdding] = useState(null); // null while the add field is closed
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    (picked) =>
      countryApi
        .list()
        .then(({ data }) => {
          const rows = Array.isArray(data) ? data : [];
          setCountries(rows);
          if (picked) onChange(picked);
        })
        .catch(() => setCountries([])),
    [onChange]
  );

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const name = (adding || '').trim();
    if (name.length < 2) {
      alertError('Enter a country name of at least 2 characters.', 'Country not added');
      return;
    }

    setBusy(true);
    try {
      const { data } = await countryApi.create(name);
      await load(data.name);
      setAdding(null);
    } catch (err) {
      alertError(err.errors?.name || err.message || 'Could not add the country.', 'Country not added');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const country = (countries || []).find((c) => c.name === value);
    if (!country) return;

    const sure = await confirmAction({
      title: 'Remove ' + country.name + '?',
      text: 'It is no longer offered here. Companies already registered in it keep it.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!sure) return;

    setBusy(true);
    try {
      await countryApi.remove(country.id);
      onChange('');
      await load();
    } catch (err) {
      alertError(err.message || 'Could not remove the country.', 'Country not removed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label htmlFor={id} className="field-label">
        Country <span className="text-red-500">*</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={id}
          name="country"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={countries === null}
          className={'field-input flex-1 ' + (error ? 'field-input-error' : '')}
        >
          <option value="">{countries === null ? 'Loading...' : 'Select a country...'}</option>
          {(countries || []).map((country) => (
            <option key={country.id} value={country.name}>
              {country.name}
            </option>
          ))}
          {/* A company registered in a country since taken off the list keeps it. */}
          {value && !(countries || []).some((c) => c.name === value) && <option value={value}>{value}</option>}
        </select>

        {manage && (
          <>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setAdding('')}>
              Add
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy || !value} onClick={remove}>
              Remove
            </Button>
          </>
        )}
      </div>

      {manage && adding !== null && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            aria-label="New country"
            value={adding}
            autoFocus
            placeholder="e.g. Romania"
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            className="field-input flex-1"
          />
          <Button type="button" size="sm" loading={busy} onClick={add}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setAdding(null)}>
            Cancel
          </Button>
        </div>
      )}

      {error ? (
        <p className="field-error">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>
      )}
    </div>
  );
}
