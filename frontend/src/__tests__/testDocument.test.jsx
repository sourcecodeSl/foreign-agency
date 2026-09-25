import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestDocument from '../pages/candidates/TestDocument';

const list = vi.fn();
const add = vi.fn();

vi.mock('../lib/api', () => ({
  testLineApi: {
    list: (...a) => list(...a),
    add: (...a) => add(...a),
  },
}));

vi.mock('../lib/alert', async (importOriginal) => ({
  ...(await importOriginal()),
  notify: vi.fn(),
}));

const LINE = (id, body) => ({
  id,
  body,
  company: { id: 'AG-9100', name: 'Herzl Construction' },
  recordedBy: 'Herzl Owner',
  at: '2026-09-25T10:00:00+00:00',
});

beforeEach(() => vi.clearAllMocks());

describe('TestDocument', () => {
  it('lets the testing company add a line, shown after the others', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({ data: { lines: [LINE(1, 'Practical: 8/10')], canAdd: true } });
    add.mockResolvedValue({ data: LINE(2, 'Theory: passed'), message: 'Test line saved. Solidrow has been notified.' });

    render(<TestDocument candidate={{ id: 7, name: 'Nimal Silva' }} onClose={() => {}} />);

    expect(await screen.findByText('Practical: 8/10')).toBeInTheDocument();
    await user.type(screen.getByLabelText('New test line'), 'Theory: passed');
    await user.click(screen.getByRole('button', { name: 'Save line' }));

    await waitFor(() => expect(add).toHaveBeenCalledWith(7, 'Theory: passed'));
    expect(await screen.findByText('Theory: passed')).toBeInTheDocument();
    expect(screen.getByText('2 lines')).toBeInTheDocument();
  });

  it('is read only for the agency', async () => {
    list.mockResolvedValue({ data: { lines: [LINE(1, 'Practical: 8/10')], canAdd: false } });

    render(<TestDocument candidate={{ id: 7, name: 'Nimal Silva' }} onClose={() => {}} />);

    expect(await screen.findByText('Practical: 8/10')).toBeInTheDocument();
    expect(screen.getByText('Read only')).toBeInTheDocument();
    expect(screen.queryByLabelText('New test line')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save line' })).not.toBeInTheDocument();
  });
});
