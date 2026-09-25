import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import PendingRegistrations from '../pages/candidates/PendingRegistrations';

const waitingForCompany = vi.fn();
const addRegistration = vi.fn();

vi.mock('../lib/api', () => ({
  candidateApi: {
    waitingForCompany: (...args) => waitingForCompany(...args),
    addRegistration: (...args) => addRegistration(...args),
  },
  agencyApi: {
    foreignOptions: async () => ({
      data: [
        { id: 'AG-9100', name: 'Herzl Construction' },
        { id: 'AG-9101', name: 'Negev Builders' },
      ],
    }),
  },
  jobRoleApi: {
    list: async () => ({
      data: [
        { id: 1, name: 'Tiler' },
        { id: 3, name: 'Mason' },
      ],
    }),
  },
}));

vi.mock('../lib/alert', async (importOriginal) => ({
  ...(await importOriginal()),
  alertError: vi.fn(),
}));

const ROW = {
  id: 7,
  candidate: {
    id: 7,
    name: 'Nimal Silva',
    fatherName: 'Sunil Silva',
    passportNo: 'N1122334',
    passportExpiry: '2031-05-01',
    passportWarning: null,
    nicNo: '901234567V',
    dateOfBirth: '1990-04-22',
    age: 36,
    address: '9 Lake Road, Kandy',
    policeReport: { status: 'applied', referenceNo: 'PR/2026/8891' },
    registeredBy: { source: 'agency', label: 'Agency', name: 'Nadia Perera' },
    jobRoles: [{ id: 1, name: 'Tiler' }],
  },
  agencyId: 'AG-9001',
  agencyName: 'Solidrow',
  requested: null,
  createdAt: '2026-09-25T10:00:00Z',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <PendingRegistrations />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('candidates waiting for a company', () => {
  beforeEach(() => {
    waitingForCompany.mockReset().mockResolvedValue({ data: [ROW] });
    addRegistration.mockReset().mockResolvedValue({ message: 'Assigned.' });
  });

  it('shows each one with the details checked before assigning', async () => {
    renderPage();

    const item = (await screen.findByText('Nimal Silva')).closest('li');
    expect(within(item).getByText(/From Solidrow/)).toBeTruthy();
    expect(within(item).getByText('Sunil Silva')).toBeTruthy();
    expect(within(item).getByText('N1122334')).toBeTruthy();
    expect(within(item).getByText('901234567V')).toBeTruthy();
    expect(within(item).getByText('Tiler')).toBeTruthy();
    expect(within(item).getByText('Applied')).toBeTruthy();
    expect(within(item).getByText('9 Lake Road, Kandy')).toBeTruthy();
  });

  it('assigns the company for the categories the agency gave, and reads the list again', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /assign company/i }));
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Negev Builders' })).toBeTruthy());
    expect(within(dialog).getByRole('checkbox', { name: /Tiler/ }).checked).toBe(true);

    await user.selectOptions(within(dialog).getByLabelText(/foreign company/i), 'AG-9101');
    await user.click(within(dialog).getByRole('checkbox', { name: /Mason/ }));
    await user.click(within(dialog).getByRole('button', { name: /^assign$/i }));

    await waitFor(() =>
      expect(addRegistration).toHaveBeenCalledWith(7, { companyAgencyId: 'AG-9101', jobRoleIds: [1, 3] })
    );
    await waitFor(() => expect(waitingForCompany).toHaveBeenCalledTimes(2));
  });

  it('starts from the company an agency asked for before, if it did', async () => {
    waitingForCompany.mockResolvedValue({
      data: [{ ...ROW, requested: { registrationId: 4, company: { id: 'AG-9100', name: 'Herzl Construction' }, jobRoleIds: [1] } }],
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/the agency asked for Herzl Construction/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /assign company/i }));
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialog).getByLabelText(/foreign company/i).value).toBe('AG-9100'));
  });

  it('narrows to one agency, keeping the first to come in at the top', async () => {
    const second = { ...ROW, id: 8, agencyId: 'AG-9002', agencyName: 'Blue Wave', candidate: { ...ROW.candidate, id: 8, name: 'Kamal Perera' } };
    const third = { ...ROW, id: 9, candidate: { ...ROW.candidate, id: 9, name: 'Ruwan Fernando' } };
    waitingForCompany.mockResolvedValue({ data: [ROW, second, third] });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Nimal Silva');
    const names = () => screen.getAllByRole('listitem').map((li) => li.querySelector('button').textContent);
    expect(names()).toEqual(['Nimal Silva', 'Kamal Perera', 'Ruwan Fernando']);

    const picker = screen.getByLabelText('Local agency');
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual(['All agencies', 'Blue Wave', 'Solidrow']);

    await user.selectOptions(picker, 'AG-9001');
    expect(names()).toEqual(['Nimal Silva', 'Ruwan Fernando']);
  });

  it('says so when nobody is waiting', async () => {
    waitingForCompany.mockResolvedValue({ data: [] });
    renderPage();

    expect(await screen.findByText('Nobody is waiting for a company')).toBeTruthy();
  });
});
