import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../components/ui/Toast';
import EmailVerification from '../pages/auth/EmailVerification';

// The agency rows are stubbed; the confirmation-link list below them is empty.
const agencies = vi.fn();
vi.mock('../lib/api', () => ({
  verificationApi: {
    agencies: (...args) => agencies(...args),
    listEmails: async () => ({ data: [] }),
    resendEmail: vi.fn(),
    markVerified: vi.fn(),
    removeEmail: vi.fn(),
  },
}));

const at = '2026-09-10T06:44:40+00:00';

const ROWS = [
  {
    id: 'AG-1048',
    name: 'evoo',
    code: 'EVO-1048',
    status: 'active',
    createdAt: '2026-09-09',
    owner: { name: 'hirusha perera', username: 'evoo', email: 'evoo@gmail.com', phone: '0781311808' },
    steps: { approved: true, phoneVerifiedAt: at, emailVerifiedAt: null, signedInAt: null },
    state: 'partial',
    pending: ['Verify the email address', 'Sign in for the first time'],
    nextSignInAsks: ['email'],
  },
  {
    id: 'AG-1049',
    name: 'cleo',
    code: 'CLE-1049',
    status: 'pending',
    createdAt: '2026-09-10',
    owner: { name: 'nadil perera', username: 'cleo', email: 'viruleksan@gmail.com', phone: '0773306100' },
    steps: { approved: false, phoneVerifiedAt: null, emailVerifiedAt: null, signedInAt: null },
    state: 'awaiting_approval',
    pending: [
      'Approve the agency',
      'Verify the phone number',
      'Verify the email address',
      'Sign in for the first time',
    ],
    nextSignInAsks: ['phone', 'email'],
  },
  {
    id: 'AG-1050',
    name: 'skyline',
    code: 'SKY-1050',
    status: 'active',
    createdAt: '2026-09-01',
    owner: { name: 'Nadia Perera', username: 'skyline', email: 'owner@skyline.lk', phone: '0771234567' },
    steps: { approved: true, phoneVerifiedAt: at, emailVerifiedAt: at, signedInAt: at },
    state: 'verified',
    pending: [],
    nextSignInAsks: [],
  },
];

function renderPage() {
  return render(
    <ToastProvider>
      <EmailVerification />
    </ToastProvider>
  );
}

async function panel() {
  const region = await screen.findByRole('region', { name: /agency sign-in verification/i });
  await within(region).findByText('evoo');
  return region;
}

describe('agency sign-in verification', () => {
  beforeEach(() => {
    agencies.mockReset().mockResolvedValue({ data: ROWS });
  });

  it('shows which contact details each agency has confirmed and what is still left', async () => {
    renderPage();
    const region = await panel();

    // Phone confirmed, then it stopped before the email.
    const evoo = within(region).getByText('evoo').closest('tr');
    expect(within(evoo).getByText('Partly verified')).toBeTruthy();
    expect(within(evoo).getByText('0781311808')).toBeTruthy();
    expect(within(evoo).getByTitle(/^phone: verified /i)).toBeTruthy();
    expect(within(evoo).getByText('evoo@gmail.com')).toBeTruthy();
    expect(within(evoo).getByTitle(/^email: not verified yet$/i)).toBeTruthy();
    expect(within(evoo).getByText(/verify the email address/i)).toBeTruthy();
    expect(within(evoo).getByText('Next sign-in: email code')).toBeTruthy();
    expect(within(evoo).getByText('Never')).toBeTruthy();

    const cleo = within(region).getByText('cleo').closest('tr');
    expect(within(cleo).getByText('Awaiting approval')).toBeTruthy();
    expect(within(cleo).getByText(/approve the agency/i)).toBeTruthy();
    expect(within(cleo).getByText('Next sign-in: phone and email codes')).toBeTruthy();

    // Both confirmed: never asked again.
    const skyline = within(region).getByText('skyline').closest('tr');
    expect(within(skyline).getByTitle(/^phone: verified /i)).toBeTruthy();
    expect(within(skyline).getByTitle(/^email: verified /i)).toBeTruthy();
    expect(within(skyline).getByText('Next sign-in: password only')).toBeTruthy();

    // The summary cards count the same rows.
    await waitFor(() =>
      expect(within(screen.getByText('Still to verify').parentElement).getByText('2')).toBeTruthy()
    );
    expect(within(screen.getByText('Fully verified').parentElement).getByText('1')).toBeTruthy();
  });

  it('filters by where each agency stands', async () => {
    const user = userEvent.setup();
    renderPage();
    const region = await panel();

    await user.click(within(region).getByRole('button', { name: /^verified/i }));
    expect(within(region).getByText('skyline')).toBeTruthy();
    expect(within(region).queryByText('evoo')).toBeNull();

    await user.click(within(region).getByRole('button', { name: /^partly verified/i }));
    expect(within(region).getByText('evoo')).toBeTruthy();
    expect(within(region).queryByText('skyline')).toBeNull();
  });

  it('finds an agency by its owner email or phone', async () => {
    const user = userEvent.setup();
    renderPage();
    const region = await panel();

    const search = within(region).getByLabelText(/search agencies/i);
    await user.type(search, 'viruleksan');

    expect(within(region).getByText('cleo')).toBeTruthy();
    expect(within(region).queryByText('evoo')).toBeNull();

    await user.clear(search);
    await user.type(search, '0781311808');

    expect(within(region).getByText('evoo')).toBeTruthy();
    expect(within(region).queryByText('cleo')).toBeNull();
  });
});
