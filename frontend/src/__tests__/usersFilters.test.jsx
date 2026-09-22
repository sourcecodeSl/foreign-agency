import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../components/ui/Toast';
import UsersList from '../pages/users/UsersList';

const listUsers = vi.fn();
const listAgencies = vi.fn();

vi.mock('../lib/api', () => ({
  userApi: { list: (...args) => listUsers(...args) },
  roleApi: {
    list: async () => ({ data: [{ id: 'RL-02', name: 'Agency Owner', slug: 'agency_owner' }] }),
  },
  agencyApi: { list: (...args) => listAgencies(...args) },
}));

const USERS = [
  { id: 1, name: 'nadil perera', email: 'n@x.com', role: 'Agency Owner', agency: 'foree', agencyType: 'foreign', status: 'active' },
  { id: 2, name: 'anjalika', email: 'a@x.com', role: 'Agency Owner', agency: 'local', agencyType: 'local', status: 'active' },
  { id: 3, name: 'Main Admin', email: 'm@x.com', role: 'Main Admin', agency: null, agencyType: null, status: 'active' },
];

function renderPage() {
  return render(
    <ToastProvider>
      <UsersList />
    </ToastProvider>
  );
}

describe('the Users list, by where each login belongs', () => {
  beforeEach(() => {
    listUsers.mockReset().mockResolvedValue({ data: USERS });
    listAgencies.mockReset().mockResolvedValue({ data: [{ id: 'AG-1052', name: 'foree', code: 'FOR-1052' }] });
  });

  it('says whether each agency is local or foreign', async () => {
    renderPage();

    expect(await screen.findByText('Foreign company')).toBeTruthy();
    expect(screen.getByText('Local agency')).toBeTruthy();
    expect(screen.getByText('Main system', { selector: 'span' })).toBeTruthy();
  });

  it('narrows to foreign companies, then to one of them', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('nadil perera');

    // No agency to choose until a kind is picked.
    expect(screen.queryByLabelText('Filter by foreign company')).toBeNull();

    await user.selectOptions(screen.getByLabelText('Filter by agency type'), 'foreign');
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ agencyType: 'foreign', agency: 'all' })));
    expect(listAgencies).toHaveBeenCalledWith({ type: 'foreign' });

    await user.selectOptions(await screen.findByLabelText('Filter by foreign company'), 'AG-1052');
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ agencyType: 'foreign', agency: 'AG-1052' })));

    // Switching kind starts again from all of its agencies.
    await user.selectOptions(screen.getByLabelText('Filter by agency type'), 'local');
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ agencyType: 'local', agency: 'all' })));
  });

  it('filters by the role the server knows: its slug', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('option', { name: 'Agency Owner' });

    await user.selectOptions(screen.getByLabelText('Filter by role'), 'agency_owner');
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'agency_owner' })));
  });
});
