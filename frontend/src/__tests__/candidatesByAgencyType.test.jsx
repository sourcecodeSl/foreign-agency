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
    expect(within(picker).getByText('Select a foreign company...')).toBeTruthy();
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

    // Nothing is listed until a foreign company is picked.
    await waitFor(() => expect(picker.value).toBe(''));
    expect(await screen.findByText(/no agency selected/i)).toBeTruthy();
  });

  it("lists who local agencies registered for a foreign company, with their numbers", async () => {
    listCandidates.mockImplementation(async ({ companyAgencyId } = {}) => ({
      data: companyAgencyId
        ? [
            {
              id: 7,
              name: 'Nimal Silva',
              passportNo: 'N1122334',
              nicNo: '901234567V',
              agencyId: 'AG-1041',
              agencyName: 'Skyline Marketing',
              status: 'draft',
              policeReport: { status: 'applied' },
              registration: {
                id: 3,
                approval: 'approved',
                state: 'open',
                jobRoles: [{ id: 1, name: 'Tiler', testIndexNo: 'TL00001' }],
                results: [],
              },
            },
            {
              id: 8,
              name: 'Sunil Perera',
              passportNo: 'N5566778',
              agencyId: 'AG-1041',
              agencyName: 'Skyline Marketing',
              status: 'draft',
              registration: { id: 4, approval: 'pending', state: 'open', jobRoles: [{ id: 2, name: 'Mason' }], results: [] },
            },
          ]
        : [],
    }));
    const user = userEvent.setup();
    renderList();

    await user.selectOptions(screen.getByLabelText(/agency type/i), 'foreign');
    const picker = screen.getByLabelText('Agency');
    await waitFor(() => expect(within(picker).getByText(/horizon manpower/i)).toBeTruthy());
    await user.selectOptions(picker, 'AG-1050');

    // Read as the company's list, not as candidates the company itself registered.
    await waitFor(() =>
      expect(listCandidates).toHaveBeenLastCalledWith(
        expect.objectContaining({ agencyId: 'all', companyAgencyId: 'AG-1050' })
      )
    );

    const row = (await screen.findByText('Nimal Silva')).closest('tr');
    expect(within(row).getByText('Skyline Marketing')).toBeTruthy();
    expect(within(row).getByText('Tiler · TL00001')).toBeTruthy();
    expect(within(row).getByText('Applied')).toBeTruthy();
    // Still waiting for a coordinator, and said so.
    const waiting = screen.getByText('Sunil Perera').closest('tr');
    expect(within(waiting).getByText('Waiting for approval')).toBeTruthy();
    expect(screen.getByText(/registered for Horizon Manpower/)).toBeTruthy();
    // Nobody is registered under a company.
    expect(screen.queryByRole('button', { name: /register candidate/i })).toBeNull();
  });
});
