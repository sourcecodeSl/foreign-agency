import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import CandidatesList from '../pages/candidates/CandidatesList';

// candidateApi talks to the live API only, so the adapter is stubbed here and
// the assertions are about what the page asks it for.
const listCandidates = vi.fn();
const removeCandidate = vi.fn();

vi.mock('../lib/api', () => ({
  candidateApi: {
    list: (...args) => listCandidates(...args),
    remove: (...args) => removeCandidate(...args),
  },
  agencyApi: {
    list: async () => ({
      data: [
        { id: 'AG-1041', name: 'Skyline Marketing' },
        { id: 'AG-1042', name: 'BlueWave Media' },
      ],
    }),
  },
}));

let roleSlug = 'main_admin';
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ admin: { roleSlug } }),
  isGlobalRole: (slug) => ['main_admin', 'auditor'].includes(slug),
}));

const KAMAL = {
  id: 1,
  name: 'Kamal Perera',
  passportNo: 'N7788990',
  mobile: '0771234567',
  email: 'kamal@example.com',
  status: 'draft',
  missingDocuments: ['medical'],
};

function renderList() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <CandidatesList />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('candidates for a cross-agency reader', () => {
  beforeEach(() => {
    roleSlug = 'main_admin';
    listCandidates.mockReset().mockResolvedValue({ data: [KAMAL] });
    removeCandidate.mockReset().mockResolvedValue({});
  });

  it('shows no candidates and asks for nothing until an agency is picked', async () => {
    renderList();

    expect(await screen.findByText(/no agency selected/i)).toBeTruthy();
    // The whole point: no candidate is fetched before a choice is made.
    expect(listCandidates).not.toHaveBeenCalled();
  });

  it('loads one agency once it is chosen', async () => {
    const user = userEvent.setup();
    renderList();

    await screen.findByText(/no agency selected/i);
    await user.selectOptions(await screen.findByLabelText('Agency'), 'AG-1042');

    expect(await screen.findByText('Kamal Perera')).toBeTruthy();
    await waitFor(() =>
      expect(listCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ agencyId: 'AG-1042' })
      )
    );

    // Registering belongs to the agency, so a reviewer is not offered it.
    expect(screen.queryByRole('link', { name: /register candidate/i })).toBeNull();
  });
});

describe('candidates for the owning agency', () => {
  beforeEach(() => {
    roleSlug = 'agency_owner';
    listCandidates.mockReset().mockResolvedValue({ data: [KAMAL] });
    removeCandidate.mockReset().mockResolvedValue({});
  });

  it('loads straight away with no agency picker', async () => {
    renderList();

    expect(await screen.findByText('Kamal Perera')).toBeTruthy();
    expect(screen.queryByLabelText('Agency')).toBeNull();
    expect(screen.getByRole('link', { name: /register candidate/i })).toBeTruthy();
  });

  it('confirms before removing a candidate', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Kamal Perera');

    await user.click(screen.getByRole('button', { name: /delete/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('N7788990')).toBeTruthy();

    // Cancelling asks the API for nothing.
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(removeCandidate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /delete/i }));
    const again = await screen.findByRole('dialog');
    await user.click(within(again).getByRole('button', { name: /remove candidate/i }));

    await waitFor(() => expect(removeCandidate).toHaveBeenCalledWith(1));
  });
});
