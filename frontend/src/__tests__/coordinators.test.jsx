import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../components/ui/Toast';
import Coordinators from '../pages/users/Coordinators';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setStatus: vi.fn(),
  resetPassword: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../lib/api', () => ({ coordinatorApi: api }));

const PAGES = [
  { key: 'dashboard', label: 'Dashboard', section: 'Overview', description: 'Totals, and the agencies waiting for approval.' },
  { key: 'agencies', label: 'Agency List', section: 'Agency Management', description: 'Every agency: approve or deactivate it.' },
  { key: 'agencies.create', label: 'Create Agency', section: 'Agency Management', description: 'Register a new agency and issue its login.' },
  { key: 'candidates', label: 'Candidates by Agency', section: 'Candidates', description: "Read any agency's candidate files." },
  { key: 'verification', label: 'Email Verification', section: 'Verification', description: 'Which agencies have confirmed their phone and email.' },
];

const KASUN = {
  id: 12,
  name: 'Kasun Jayawardena',
  username: 'kasun.coord',
  email: 'kasun@example.lk',
  phone: '0715550101',
  status: 'active',
  pages: ['agencies', 'candidates'],
  phoneVerifiedAt: null,
  emailVerifiedAt: null,
  lastLogin: null,
};

function renderPage() {
  return render(
    <ToastProvider>
      <Coordinators />
    </ToastProvider>
  );
}

describe('coordinators and page access', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.list.mockResolvedValue({ data: { coordinators: [KASUN], pages: PAGES } });
  });

  it('lists each coordinator with the pages opened to them', async () => {
    renderPage();

    const row = (await screen.findByText('Kasun Jayawardena')).closest('tr');
    expect(within(row).getByText('Agency List')).toBeTruthy();
    expect(within(row).getByText('Candidates by Agency')).toBeTruthy();
    expect(within(row).queryByText('Create Agency')).toBeNull();
    expect(within(row).getByText('Never')).toBeTruthy();
  });

  it('adds a coordinator with the ticked pages and shows the password once', async () => {
    const user = userEvent.setup();
    api.create.mockResolvedValue({
      data: {
        ...KASUN,
        id: 13,
        name: 'Nimali Fernando',
        username: 'nimali.coord',
        pages: ['dashboard', 'verification'],
        credentials: { username: 'nimali.coord', password: 'Gen3rated!Pw' },
      },
      message: 'Nimali Fernando can now sign in.',
    });

    renderPage();
    await screen.findByText('Kasun Jayawardena');

    await user.click(screen.getByRole('button', { name: /add coordinator/i }));
    const dialog = await screen.findByRole('dialog', { name: /add coordinator/i });

    await user.type(within(dialog).getByLabelText(/full name/i), 'Nimali Fernando');
    await user.type(within(dialog).getByLabelText(/^username/i), 'nimali.coord');
    await user.type(within(dialog).getByLabelText(/^email address/i), 'nimali@example.lk');
    await user.type(within(dialog).getByLabelText(/^phone number/i), '0715550202');
    // Ticked out of menu order; they are sent in menu order.
    await user.click(within(dialog).getByLabelText(/^email verification/i));
    await user.click(within(dialog).getByLabelText(/^dashboard/i));
    await user.click(within(dialog).getByRole('button', { name: /^add coordinator$/i }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0][0]).toMatchObject({
      name: 'Nimali Fernando',
      username: 'nimali.coord',
      email: 'nimali@example.lk',
      phone: '0715550202',
      pages: ['dashboard', 'verification'],
    });

    const shown = await screen.findByRole('dialog', { name: /nimali fernando can now sign in/i });
    expect(within(shown).getByText('Gen3rated!Pw')).toBeTruthy();
  });

  it('does not send a form with missing details', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Kasun Jayawardena');

    await user.click(screen.getByRole('button', { name: /add coordinator/i }));
    const dialog = await screen.findByRole('dialog', { name: /add coordinator/i });
    await user.click(within(dialog).getByRole('button', { name: /^add coordinator$/i }));

    expect(within(dialog).getByText('Full name is required.')).toBeTruthy();
    expect(within(dialog).getByText('Username is required.')).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();
  });
});
