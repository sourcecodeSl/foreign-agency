import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DateInput, { toDisplay, toIso } from '../components/ui/DateInput';

describe('a date typed the way it is read here', () => {
  it('writes an ISO date as dd/mm/yyyy, and reads one back', () => {
    expect(toDisplay('2031-05-01')).toBe('01/05/2031');
    expect(toDisplay('')).toBe('');
    expect(toIso('01/05/2031')).toBe('2031-05-01');

    // Half a date is no date, and neither is a day that never happened.
    expect(toIso('01/05')).toBe('');
    expect(toIso('31/02/2031')).toBe('');
    expect(toIso('01/13/2031')).toBe('');

    // Outside what the field allows is refused too.
    expect(toIso('01/05/2031', { max: '2026-09-23' })).toBe('');
  });

  it('puts the slashes in as the digits are typed, and hands up the ISO date', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DateInput label="Passport validity" name="passportExpiry" value="" onChange={onChange} />);

    const field = screen.getByLabelText(/passport validity/i);
    await user.type(field, '01052031');

    expect(field.value).toBe('01/05/2031');
    expect(onChange).toHaveBeenLastCalledWith({
      target: { name: 'passportExpiry', value: '2031-05-01' },
    });
  });

  it('shows a date it was given, and keeps nothing while one is half typed', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DateInput label="Issued date" name="issuedDate" value="2026-06-01" onChange={onChange} />);

    const field = screen.getByLabelText(/issued date/i);
    expect(field.value).toBe('01/06/2026');

    await user.clear(field);
    await user.type(field, '0106');
    expect(field.value).toBe('01/06');
    expect(onChange).toHaveBeenLastCalledWith({ target: { name: 'issuedDate', value: '' } });
  });
});
