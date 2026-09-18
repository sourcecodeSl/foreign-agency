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
const setPassed = vi.fn();
const updateStatus = vi.fn();

vi.mock('../lib/api', () => ({
  candidateApi: {
    list: (...args) => listCandidates(...args),
    remove: (...args) => removeCandidate(...args),
    setPassed: (...args) => setPassed(...args),
    updateStatus: (...args) => updateStatus(...args),
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
  isGlobalRole: (slug) => ['main_admin', 'auditor', 'coordinator'].includes(slug),
}));

const KAMAL = {
  id: 1,
  name: 'Kamal Perera',
  passportNo: 'N7788990',
  mobile: '0771234567',
  email: 'kamal@example.com',
  status: 'draft',
  poolStatus: 'pool',
  missingDocuments: ['medical'],
  registeredBy: { source: 'agency', label: 'Agency', name: 'Nadia Perera' },
};

// Put on the agency's register by a coordinator, and already passed.
const NIMAL = {
  id: 2,
  name: 'Nimal Silva',
  passportNo: 'N1122334',
  mobile: '0772223344',
  status: 'draft',
  poolStatus: 'passed',
  missingDocuments: [],
  registeredBy: { source: 'coordinator', label: 'Coordinator', name: 'Kasun Coordinator' },
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

    // The Main Admin may register on the chosen agency's behalf.
    expect(screen.getByRole('link', { name: /register candidate/i }).getAttribute('href')).toBe(
      '/candidates/register?agencyId=AG-1042'
    );

    // The pass is the agency's switch; a reviewer only reads it.
    expect(screen.getByText('Not passed')).toBeTruthy();
    expect(screen.queryByRole('switch', { name: 'Passed: Kamal Perera' })).toBeNull();

    // Not passed, so there is nothing to submit yet.
    expect(screen.getByRole('switch', { name: 'Profile submitted: Kamal Perera' }).disabled).toBe(true);
  });

  it('submits a passed candidate whose documents are all in', async () => {
    const user = userEvent.setup();
    listCandidates.mockResolvedValue({ data: [KAMAL, NIMAL] });
    updateStatus.mockReset().mockResolvedValue({ message: "Nimal Silva's profile has been submitted." });
    renderList();

    await user.selectOptions(await screen.findByLabelText('Agency'), 'AG-1041');
    const submit = await screen.findByRole('switch', { name: 'Profile submitted: Nimal Silva' });
    expect(submit.disabled).toBe(false);

    await user.click(submit);
    await waitFor(() => expect(updateStatus).toHaveBeenCalledWith(2, 'submitted'));
  });

  it('offers the auditor no way to register', async () => {
    roleSlug = 'auditor';
    renderList();

    await screen.findByText(/no agency selected/i);
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
    // Submitting is the coordinator's switch, not the agency's.
    expect(screen.queryByRole('switch', { name: /profile submitted/i })).toBeNull();
  });

  it('switches a candidate to passed from the list', async () => {
    const user = userEvent.setup();
    setPassed.mockReset().mockResolvedValue({ message: 'Kamal Perera is marked as passed.' });
    renderList();

    const toggle = await screen.findByRole('switch', { name: 'Passed: Kamal Perera' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    await user.click(toggle);

    await waitFor(() => expect(setPassed).toHaveBeenCalledWith(1, true));
    // The list is read again to show the new state.
    await waitFor(() => expect(listCandidates).toHaveBeenCalledTimes(2));
  });

  it('says who put each candidate on the register', async () => {
    listCandidates.mockResolvedValue({ data: [KAMAL, NIMAL] });
    renderList();

    await screen.findByText('Kamal Perera');
    expect(screen.getByText('Added by agency')).toBeTruthy();
    expect(screen.getByText('Added by coordinator · Kasun Coordinator')).toBeTruthy();
    expect(
      screen.getByRole('switch', { name: 'Passed: Nimal Silva' }).getAttribute('aria-checked')
    ).toBe('true');
  });

  it('marks a blocked candidate and offers no switch', async () => {
    listCandidates.mockResolvedValue({ data: [{ ...KAMAL, blocked: true, blockedBy: null }] });
    renderList();

    await screen.findByText('Kamal Perera');
    expect(screen.getByText('Blocked')).toBeTruthy();
    expect(screen.getByText('Passed with another agency')).toBeTruthy();
    expect(screen.queryByRole('switch', { name: 'Passed: Kamal Perera' })).toBeNull();
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
