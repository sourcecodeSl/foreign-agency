import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import AgencyList from '../pages/agency/AgencyList';

function renderList(entry = '/agencies') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <AgencyList />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('agency listing by type', () => {
  it('names what is listed when the type filter changes', async () => {
    const user = userEvent.setup();
    renderList();

    // Every kind, so the heading stays general.
    expect(await screen.findByText('Agencies')).toBeTruthy();

    const filter = screen.getByLabelText(/agency type/i);

    await user.selectOptions(filter, 'local');
    expect(await screen.findByText('Local Agencies')).toBeTruthy();
    expect(screen.queryByText('Agencies')).toBeNull();

    await user.selectOptions(filter, 'foreign');
    expect(await screen.findByText('Foreign Companies')).toBeTruthy();

    // The demo rows are all local, so the tab is empty and says so.
    expect(await screen.findByText('No pending foreign companies found.')).toBeTruthy();
  });

  it('opens on the kind the menu link asked for', async () => {
    renderList('/agencies?type=foreign');

    expect(await screen.findByText('Foreign Companies')).toBeTruthy();
    expect(screen.getByLabelText(/agency type/i).value).toBe('foreign');
  });
});
