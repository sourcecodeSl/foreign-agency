import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Table from '../components/ui/Table';

const columns = [
  { key: 'name', header: 'Name' },
  { key: 'code', header: 'Code' },
];

const rows = (count) =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, name: 'Row ' + (i + 1), code: 'C-' + (i + 1) }));

const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('reading a long table a page at a time', () => {
  it('shows the first page, walks to the next and back', async () => {
    const user = userEvent.setup();
    render(<Table columns={columns} rows={rows(23)} />);

    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText('1-10 of 23 records')).toBeTruthy();
    expect(screen.getByRole('button', { name: /previous/i }).disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(bodyRows()[0].textContent).toContain('Row 11');
    expect(screen.getByText('Page 2 of 3')).toBeTruthy();

    // The last page holds what is left over.
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByRole('button', { name: /next/i }).disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(bodyRows()).toHaveLength(10);
  });

  it('takes the rows per page the reader chooses, back at the first page', async () => {
    const user = userEvent.setup();
    render(<Table columns={columns} rows={rows(23)} />);

    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.selectOptions(screen.getByLabelText('Rows per page'), '25');

    expect(bodyRows()).toHaveLength(23);
    expect(screen.getByText('1-23 of 23 records')).toBeTruthy();
  });

  it('leaves the bar off a table that fits on one page', () => {
    render(<Table columns={columns} rows={rows(10)} />);

    expect(screen.queryByLabelText('Rows per page')).toBeNull();
    expect(bodyRows()).toHaveLength(10);
  });
});
