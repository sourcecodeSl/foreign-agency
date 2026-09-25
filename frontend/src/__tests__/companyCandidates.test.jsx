import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import CompanyCandidates from '../pages/candidates/CompanyCandidates';

const list = vi.fn();
const recordTestResult = vi.fn();
const foreignOptions = vi.fn();

vi.mock('../lib/api', () => ({
  candidateApi: {
    list: (...args) => list(...args),
    recordTestResult: (...args) => recordTestResult(...args),
  },
  agencyApi: { foreignOptions: (...args) => foreignOptions(...args) },
}));

// Signed in as the foreign company itself.
let account = { roleSlug: 'agency_owner', agency: { id: 'AG-9100', name: 'Herzl', type: 'foreign' } };
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ admin: account }),
  isGlobalRole: (slug) => ['main_admin', 'auditor', 'coordinator'].includes(slug),
}));

vi.mock('../lib/alert', async (importOriginal) => ({
  ...(await importOriginal()),
  alertError: vi.fn(),
}));

const CANDIDATE = {
  id: 7,
  name: 'Kamal Perera',
  agencyId: 'AG-9001',
  agencyName: 'Solidrow',
  passportNo: 'N7788990',
  createdAt: '2026-09-20',
  jobRoles: [
    { id: 1, name: 'Tiler' },
    { id: 2, name: 'Mason' },
  ],
  testResult: null,
  // This company's own registration: the categories it tests them in.
  registration: {
    id: 3,
    company: { id: 'AG-9100', name: 'Herzl' },
    state: 'open',
    jobRoles: [
      { id: 1, name: 'Tiler', testIndexNo: 'TL00001' },
      { id: 2, name: 'Mason', testIndexNo: 'MS00004' },
    ],
    results: [],
  },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/candidates']}>
      <ToastProvider>
        <CompanyCandidates />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("a foreign company's own candidates", () => {
  beforeEach(() => {
    account = { roleSlug: 'agency_owner', agency: { id: 'AG-9100', name: 'Herzl', type: 'foreign' } };
    list.mockReset().mockResolvedValue({ data: [CANDIDATE] });
    recordTestResult.mockReset().mockResolvedValue({ message: 'Kamal Perera passed as Mason.' });
    foreignOptions.mockReset().mockResolvedValue({ data: [] });
  });

  it('lists who a local agency registered for it, naming that agency', async () => {
    renderPage();

    // Its own list: the company is not asked which company to read.
    await waitFor(() => expect(list).toHaveBeenCalledWith({ companyAgencyId: undefined, agencyId: 'all', search: '' }));
    expect(screen.queryByLabelText('Foreign company')).toBeNull();

    const row = (await screen.findByText('Kamal Perera')).closest('tr');
    expect(within(row).getByText('Solidrow')).toBeTruthy();
    // Each category with the test index number the result is recorded against.
    expect(within(row).getByText('TL00001').closest('li').textContent).toBe('TL00001Tiler');
    expect(within(row).getByText('MS00004').closest('li').textContent).toBe('MS00004Mason');
    expect(within(row).getByText('No result yet')).toBeTruthy();
  });

  it('records a pass against the trade it was sat in', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /record result/i }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/^passed/i));
    await user.selectOptions(within(dialog).getByLabelText(/^job category/i), '2');
    await user.click(within(dialog).getByRole('button', { name: /save result/i }));

    await waitFor(() =>
      expect(recordTestResult).toHaveBeenCalledWith(7, {
        result: 'pass',
        jobRoleId: 2,
        note: undefined,
        companyAgencyId: 'AG-9100',
      })
    );
    // The list is read again, so the new result shows.
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('names the job category a fail was in, for the local agency', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /record result/i }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/^did not pass/i));
    await user.selectOptions(within(dialog).getByLabelText(/^job category/i), '1');
    await user.type(within(dialog).getByLabelText(/note for the local agency/i), 'Cutting not accurate');
    await user.click(within(dialog).getByRole('button', { name: /save result/i }));

    await waitFor(() =>
      expect(recordTestResult).toHaveBeenCalledWith(7, {
        result: 'fail',
        jobRoleId: 1,
        note: 'Cutting not accurate',
        companyAgencyId: 'AG-9100',
      })
    );
  });

  it('shows the result recorded for each job category', async () => {
    list.mockResolvedValue({
      data: [
        {
          ...CANDIDATE,
          registration: {
            ...CANDIDATE.registration,
            results: [
              { id: 1, jobRoleId: 1, jobRole: 'Tiler', result: 'fail' },
              { id: 2, jobRoleId: 2, jobRole: 'Mason', result: 'pass' },
            ],
          },
        },
      ],
    });
    renderPage();

    const row = (await screen.findByText('Kamal Perera')).closest('tr');
    expect(within(row).getByText('Did not pass - Tiler')).toBeTruthy();
    expect(within(row).getByText('Passed - Mason')).toBeTruthy();
  });

  it('offers nothing to record once the candidate passed with another company', async () => {
    list.mockResolvedValue({
      data: [{ ...CANDIDATE, registration: { ...CANDIDATE.registration, state: 'void' } }],
    });
    renderPage();

    const row = (await screen.findByText('Kamal Perera')).closest('tr');
    expect(within(row).getByText('Passed with another company')).toBeTruthy();
    expect(within(row).queryByRole('button', { name: /record result/i })).toBeNull();
  });

  it('narrows the list to one agency', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Kamal Perera');
    await user.selectOptions(screen.getByLabelText('Agency'), 'AG-9001');

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({ companyAgencyId: undefined, agencyId: 'AG-9001', search: '' })
    );
  });

  it('makes the admin pick a company first', async () => {
    account = { roleSlug: 'main_admin' };
    foreignOptions.mockResolvedValue({ data: [{ id: 'AG-9100', name: 'Herzl Construction' }] });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/pick a company/i)).toBeTruthy();
    expect(list).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText('Foreign company'), 'AG-9100');
    await waitFor(() => expect(list).toHaveBeenCalledWith({ companyAgencyId: 'AG-9100', agencyId: 'all', search: '' }));
  });

  it('searches by test index number or NIC', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Kamal Perera');
    await user.type(screen.getByLabelText(/search by test index number/i), 'TL00001');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({ companyAgencyId: undefined, agencyId: 'all', search: 'TL00001' })
    );
  });
});
