import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import CandidatesList from '../pages/candidates/CandidatesList';

const AGENCIES = [
  { id: 'AG-1041', name: 'Skyline Marketing', type: 'local' },
  { id: 'AG-1050', name: 'Horizon Manpower', type: 'foreign' },
];

const listAgencies = vi.hoisted(() => vi.fn());
const listCandidates = vi.hoisted(() => vi.fn());

vi.mock('../lib/api', () => ({
  candidateApi: { list: (...args) => listCandidates(...args), remove: vi.fn() },
  agencyApi: { list: (...args) => listAgencies(...args) },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ admin: { roleSlug: 'main_admin' } }),
  isGlobalRole: () => true,
}));

function renderList() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <CandidatesList />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('candidates by agency', () => {
  beforeEach(() => {
    listCandidates.mockReset().mockResolvedValue({ data: [] });
    listAgencies.mockReset().mockImplementation(async ({ type = 'all' } = {}) => ({
      data: type === 'all' ? AGENCIES : AGENCIES.filter((a) => a.type === type),
    }));
  });

  it('narrows the agency picker to local or foreign', async () => {
    const user = userEvent.setup();
    renderList();

    const picker = await screen.findByLabelText('Agency');
    await waitFor(() => expect(within(picker).getByText(/skyline marketing/i)).toBeTruthy());
    expect(within(picker).getByText(/horizon manpower/i)).toBeTruthy();

    // Foreign only: the picker drops the local agency and says what it wants.
    await user.selectOptions(screen.getByLabelText(/agency type/i), 'foreign');

    await waitFor(() => expect(within(picker).queryByText(/skyline marketing/i)).toBeNull());
    expect(within(picker).getByText(/horizon manpower/i)).toBeTruthy();
    expect(within(picker).getByText('Select a foreign agency...')).toBeTruthy();
    expect(listAgencies).toHaveBeenLastCalledWith({ status: 'all', type: 'foreign' });
  });

  it('drops a chosen agency that is not of the kind now shown', async () => {
    const user = userEvent.setup();
    renderList();

    const picker = await screen.findByLabelText('Agency');
    await waitFor(() => expect(within(picker).getByText(/skyline marketing/i)).toBeTruthy());

    await user.selectOptions(picker, 'AG-1041');
    await waitFor(() =>
      expect(listCandidates).toHaveBeenLastCalledWith(
        expect.objectContaining({ agencyId: 'AG-1041' })
      )
    );

    await user.selectOptions(screen.getByLabelText(/agency type/i), 'foreign');

    // Nothing is listed until a foreign agency is picked.
    await waitFor(() => expect(picker.value).toBe(''));
    expect(await screen.findByText(/no agency selected/i)).toBeTruthy();
  });
});
