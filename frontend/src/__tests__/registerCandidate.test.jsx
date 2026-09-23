import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import RegisterCandidate from '../pages/candidates/RegisterCandidate';

const createCandidate = vi.hoisted(() => vi.fn());
const listRoles = vi.hoisted(() => vi.fn());
const listAgencies = vi.hoisted(() => vi.fn());
const createRole = vi.hoisted(() => vi.fn());
const removeRole = vi.hoisted(() => vi.fn());
const listCompanies = vi.hoisted(() => vi.fn());

vi.mock('../lib/api', () => ({
  candidateApi: { create: (...args) => createCandidate(...args) },
  jobRoleApi: {
    list: (...args) => listRoles(...args),
    create: (...args) => createRole(...args),
    remove: (...args) => removeRole(...args),
  },
  agencyApi: {
    list: (...args) => listAgencies(...args),
    foreignOptions: (...args) => listCompanies(...args),
  },
}));

let roleSlug = 'agency_owner';
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ admin: { roleSlug } }),
  isGlobalRole: (slug) => ['main_admin', 'auditor', 'coordinator'].includes(slug),
}));

function renderForm(entry = '/candidates/register') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <RegisterCandidate />
      </ToastProvider>
    </MemoryRouter>
  );
}

/** Everything except the job category and the test index. */
async function fillBasics(user, { nic = '901234567V' } = {}) {
  await user.type(screen.getByLabelText(/first name/i), 'Kamal');
  await user.type(screen.getByLabelText(/last name/i), 'Perera');
  await user.type(screen.getByLabelText(/father's name/i), 'Sunil Perera');
  await user.type(screen.getByLabelText(/passport number/i), 'N7788990');
  await user.type(screen.getByLabelText(/passport validity/i), '01/05/2031');
  if (nic) await user.type(screen.getByLabelText(/nic number/i), nic);
  await user.type(screen.getByLabelText(/address/i), '12 Temple Road, Negombo');
  await user.type(screen.getByLabelText(/mobile number/i), '0771234567');
  await user.selectOptions(await screen.findByLabelText(/foreign company/i), 'AG-9100');
}

describe('registering a candidate', () => {
  beforeEach(() => {
    roleSlug = 'agency_owner';
    listAgencies.mockReset().mockResolvedValue({
      data: [
        { id: 'AG-1041', name: 'Skyline Marketing' },
        { id: 'AG-1042', name: 'BlueWave Media', type: 'foreign' },
      ],
    });
    createCandidate.mockReset().mockResolvedValue({ data: { candidate: { id: 7 } } });
    listCompanies.mockReset().mockResolvedValue({
      data: [
        { id: 'AG-9100', name: 'Herzl Construction', country: 'Israel' },
        { id: 'AG-9101', name: 'Negev Builders', country: 'Israel' },
      ],
    });
    listRoles.mockReset().mockResolvedValue({
      data: [
        { id: 1, name: 'Tiler' },
        { id: 2, name: 'Shuttering Carpenter' },
      ],
    });
  });

  it('sends every ticked job category and the test index number', async () => {
    const user = userEvent.setup();
    renderForm();

    await screen.findByRole('checkbox', { name: 'Tiler' });

    await fillBasics(user);
    await user.click(screen.getByRole('checkbox', { name: 'Tiler' }));
    await user.click(screen.getByRole('checkbox', { name: 'Shuttering Carpenter' }));
    await user.type(screen.getByLabelText(/test index no/i), 'TI-2026-0148');

    await user.click(screen.getByRole('button', { name: /^register candidate$/i }));

    await waitFor(() => expect(createCandidate).toHaveBeenCalledTimes(1));
    expect(createCandidate.mock.calls[0][0]).toMatchObject({
      firstName: 'Kamal',
      lastName: 'Perera',
      fatherName: 'Sunil Perera',
      passportExpiry: '2031-05-01',
      passportNo: 'N7788990',
      nicNo: '901234567V',
      jobRoleIds: [1, 2],
      testIndexNo: 'TI-2026-0148',
      // Whose test they sit; the company records the result on its own list.
      companyAgencyId: 'AG-9100',
    });
    // The profession is not typed in: passing a test sets it.
    expect(screen.queryByLabelText(/profession/i)).toBeNull();
    expect(createCandidate.mock.calls[0][0].profession).toBeUndefined();
    // An agency files under itself, so no agency is sent or asked for.
    expect(createCandidate.mock.calls[0][0]).not.toHaveProperty('agencyId');
    expect(screen.queryByLabelText(/^agency/i)).toBeNull();
    expect(listAgencies).not.toHaveBeenCalled();
  });

  it("lets a coordinator register on an agency's behalf", async () => {
    roleSlug = 'coordinator';
    const user = userEvent.setup();
    renderForm('/candidates/register?agencyId=AG-1042');

    // The agency picked on the list arrives already chosen.
    const agency = await screen.findByLabelText(/^agency\s*\*?$/i);
    await waitFor(() => expect(screen.getByRole('option', { name: /BlueWave Media/ })).toBeTruthy());
    expect(agency.value).toBe('AG-1042');

    await screen.findByRole('checkbox', { name: 'Tiler' });
    await fillBasics(user);
    await user.click(screen.getByRole('checkbox', { name: 'Tiler' }));
    await user.click(screen.getByRole('button', { name: /^register candidate$/i }));

    await waitFor(() => expect(createCandidate).toHaveBeenCalledTimes(1));
    expect(createCandidate.mock.calls[0][0]).toMatchObject({ agencyId: 'AG-1042', firstName: 'Kamal' });
  });

  it('asks a coordinator which agency the candidate belongs to', async () => {
    roleSlug = 'coordinator';
    const user = userEvent.setup();
    renderForm();

    await screen.findByLabelText(/^agency\s*\*?$/i);
    await screen.findByRole('checkbox', { name: 'Tiler' });
    await fillBasics(user);
    await user.click(screen.getByRole('checkbox', { name: 'Tiler' }));
    await user.click(screen.getByRole('button', { name: /^register candidate$/i }));

    expect(await screen.findByText('Choose local or foreign.')).toBeTruthy();
    expect(screen.getByText('Choose the agency this candidate is registered with.')).toBeTruthy();
    expect(createCandidate).not.toHaveBeenCalled();
  });

  it('will not register without a NIC number', async () => {
    const user = userEvent.setup();
    renderForm();

    await screen.findByRole('checkbox', { name: 'Tiler' });
    await fillBasics(user, { nic: '' });
    await user.click(screen.getByRole('checkbox', { name: 'Tiler' }));
    await user.click(screen.getByRole('button', { name: /^register candidate$/i }));

    expect(await screen.findByText('NIC number is required.')).toBeTruthy();
    expect(createCandidate).not.toHaveBeenCalled();
  });

  it('says so when the person has passed with another agency', async () => {
    const user = userEvent.setup();
    const message =
      'The candidate with NIC 901234567V has already passed with another agency, so they cannot be registered with another agency.';
    createCandidate.mockRejectedValue(
      Object.assign(new Error(message), { status: 409, errors: { nicNo: message } })
    );
    renderForm();

    await screen.findByRole('checkbox', { name: 'Tiler' });
    await fillBasics(user);
    await user.click(screen.getByRole('checkbox', { name: 'Tiler' }));
    await user.click(screen.getByRole('button', { name: /^register candidate$/i }));

    // A SweetAlert dialog, and the NIC field marked as the reason.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Cannot register this candidate')).toBeTruthy();
    expect(within(dialog).getByText(message)).toBeTruthy();
  });

  it('will not register without a job category', async () => {
    const user = userEvent.setup();
    renderForm();

    await screen.findByRole('checkbox', { name: 'Tiler' });
    await fillBasics(user);

    await user.click(screen.getByRole('button', { name: /^register candidate$/i }));

    expect(await screen.findByText('Choose at least one job category.')).toBeTruthy();
    expect(createCandidate).not.toHaveBeenCalled();
  });

  it('lets a coordinator add a job category, ticked for this candidate', async () => {
    roleSlug = 'coordinator';
    createRole.mockReset().mockResolvedValue({ data: { id: 9, name: 'Scaffolder' }, message: 'Scaffolder has been added.' });
    const user = userEvent.setup();
    renderForm();

    await screen.findByRole('checkbox', { name: 'Tiler' });
    await user.click(screen.getByRole('button', { name: /add category/i }));
    await user.type(screen.getByLabelText(/new job category/i), 'Scaffolder{Enter}');

    await waitFor(() => expect(createRole).toHaveBeenCalledWith('Scaffolder'));
    const added = await screen.findByRole('checkbox', { name: 'Scaffolder' });
    expect(added.checked).toBe(true);
  });

  it('lets a coordinator remove a job category after confirming', async () => {
    roleSlug = 'coordinator';
    removeRole.mockReset().mockResolvedValue({ message: 'Tiler has been removed from the list.' });
    const user = userEvent.setup();
    renderForm();

    await screen.findByRole('checkbox', { name: 'Tiler' });
    await user.click(screen.getByRole('button', { name: 'Remove Tiler' }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(removeRole).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Tiler' })).toBeNull());
  });

  it('gives an agency no way to change the categories', async () => {
    renderForm();

    await screen.findByRole('checkbox', { name: 'Tiler' });
    expect(screen.queryByRole('button', { name: /add category/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove Tiler' })).toBeNull();
  });

  it('narrows the agency list to local or foreign', async () => {
    roleSlug = 'coordinator';
    const user = userEvent.setup();
    renderForm();

    const type = await screen.findByLabelText(/agency type/i);
    await waitFor(() => expect(listAgencies).toHaveBeenCalled());

    await user.selectOptions(type, 'local');
    expect(screen.getByRole('option', { name: 'Skyline Marketing' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'BlueWave Media' })).toBeNull();

    await user.selectOptions(screen.getByLabelText(/^agency\s*\*?$/i), 'AG-1041');
    await user.selectOptions(type, 'foreign');
    expect(screen.getByRole('option', { name: 'BlueWave Media' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Skyline Marketing' })).toBeNull();
    // The local agency picked before is cleared.
    expect(screen.getByLabelText(/^agency\s*\*?$/i).value).toBe('');
  });

  it('fills in the date of birth from the NIC', async () => {
    const user = userEvent.setup();
    renderForm();

    await screen.findByRole('checkbox', { name: 'Tiler' });
    expect(screen.getByTestId('date-of-birth').textContent).toContain('Filled in from the NIC');

    // Day 522: a woman born on 22 January 1990.
    await user.type(screen.getByLabelText(/nic number/i), '905223456V');
    expect(screen.getByTestId('date-of-birth').textContent).toMatch(/1990/);
    expect(screen.getByTestId('date-of-birth').textContent).toMatch(/22/);
  });
});
