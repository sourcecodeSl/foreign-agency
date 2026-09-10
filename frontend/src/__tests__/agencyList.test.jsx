import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import AgencyList, { REFRESH_MS } from '../pages/agency/AgencyList';
import { agencyApi } from '../lib/api';

function renderList() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AgencyList />
      </ToastProvider>
    </MemoryRouter>
  );
}

/** Waits for the listing to finish its first load. */
async function waitForRows() {
  await screen.findByRole('button', { name: /BlueWave Media/i }, { timeout: 4000 });
}

describe('agency listing', () => {
  it('opens a detail card holding every field when an agency name is clicked', async () => {
    const user = userEvent.setup();
    renderList();
    await waitForRows();

    await user.click(screen.getByRole('button', { name: /BlueWave Media/i }));

    const card = await screen.findByRole('dialog');

    // Identity, and the fields the table itself never shows.
    expect(within(card).getByText('AG-1042 · BLW-1042')).toBeTruthy();
    expect(within(card).getByText('Rehan Silva')).toBeTruthy();
    expect(within(card).getByText('hello@bluewave.lk')).toBeTruthy();
    expect(within(card).getByText('17 Marine Drive, Galle')).toBeTruthy();
    expect(within(card).getByText('bluewave.admin')).toBeTruthy();

    await user.click(within(card).getByRole('button', { name: /^close$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps an open detail card current without a reload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // The first read finds two candidates; by the next one the agency has
    // removed one.
    const get = vi
      .spyOn(agencyApi, 'get')
      .mockResolvedValueOnce({ data: { id: 'AG-1042', phone: '0770000000', users: 1, candidates: 2 } })
      .mockResolvedValue({ data: { id: 'AG-1042', phone: '0770000000', users: 1, candidates: 1 } });

    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderList();
      await waitForRows();

      await user.click(screen.getByRole('button', { name: /BlueWave Media/i }));
      const card = await screen.findByRole('dialog');
      const candidates = () => within(card).getByText('Candidates').parentElement;

      await waitFor(() => expect(within(candidates()).getByText('2')).toBeTruthy());

      await vi.advanceTimersByTimeAsync(REFRESH_MS);

      await waitFor(() => expect(within(candidates()).getByText('1')).toBeTruthy());
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      get.mockRestore();
      vi.useRealTimers();
    }
  });

  it('asks for confirmation before deleting and then drops the row', async () => {
    const user = userEvent.setup();
    renderList();
    await waitForRows();

    const rows = screen.getAllByRole('button', { name: /delete/i });
    await user.click(rows[0]);

    const confirm = await screen.findByRole('dialog');
    expect(within(confirm).getByText(/cannot be undone/i)).toBeTruthy();

    // Cancelling leaves the agency alone.
    await user.click(within(confirm).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: /BlueWave Media/i })).toBeTruthy();

    // Confirming removes it from the listing.
    await user.click(screen.getAllByRole('button', { name: /delete/i })[0]);
    const again = await screen.findByRole('dialog');
    await user.click(within(again).getByRole('button', { name: /delete agency/i }));

    await waitFor(
      () => expect(screen.queryByRole('button', { name: /BlueWave Media/i })).toBeNull(),
      { timeout: 4000 }
    );
  });
});
