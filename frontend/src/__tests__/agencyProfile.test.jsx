import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import AgencyProfile from '../pages/agency/AgencyProfile';

// agencyProfileApi talks to the live API only, so the adapter is stubbed here
// and the assertions are about what the page asks it for.
const getProfile = vi.fn();
const updateProfile = vi.fn();
const requestChange = vi.fn();
const resendCode = vi.fn();
const verifyChange = vi.fn();

vi.mock('../lib/api', () => ({
  agencyProfileApi: {
    get: (...args) => getProfile(...args),
    update: (...args) => updateProfile(...args),
    requestContactChange: (...args) => requestChange(...args),
    resendContactCode: (...args) => resendCode(...args),
    verifyContactChange: (...args) => verifyChange(...args),
  },
}));

const refresh = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ refresh: (...args) => refresh(...args) }),
}));

const PROFILE = {
  id: 'AG-9001',
  name: 'Skyline Manpower',
  code: 'SKY-9001',
  username: 'skyline.owner',
  contact: 'Nadia Perera',
  address: '221B Baker Street, Colombo 03',
  email: 'owner@skyline.lk',
  phone: '0712000001',
  status: 'active',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AgencyProfile />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('agency details', () => {
  beforeEach(() => {
    getProfile.mockReset().mockResolvedValue({ data: PROFILE });
    updateProfile.mockReset();
    requestChange.mockReset();
    resendCode.mockReset();
    verifyChange.mockReset();
    refresh.mockReset().mockResolvedValue({});
  });

  it('saves the edited details', async () => {
    const user = userEvent.setup();
    updateProfile.mockResolvedValue({
      data: { ...PROFILE, name: 'Skyline Global' },
      message: 'Agency details saved.',
    });
    renderPage();

    const name = await screen.findByLabelText(/agency name/i);
    await user.clear(name);
    await user.type(name, 'Skyline Global');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        name: 'Skyline Global',
        contact: 'Nadia Perera',
        address: '221B Baker Street, Colombo 03',
      })
    );
    // The sidebar shows the agency name, so the session is re-read.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('shows the code on the page and saves the phone only once it is entered', async () => {
    const user = userEvent.setup();
    requestChange.mockResolvedValue({
      data: { challengeId: 'chg_1', destination: '0779998888', devCode: '482913' },
    });
    verifyChange.mockResolvedValue({
      data: { ...PROFILE, phone: '0779998888' },
      message: 'Phone number updated.',
    });
    renderPage();

    const phone = await screen.findByRole('region', { name: 'Phone number' });
    await user.click(within(phone).getByRole('button', { name: /change/i }));
    await user.type(within(phone).getByLabelText(/new phone number/i), '0779998888');
    await user.click(within(phone).getByRole('button', { name: /send code/i }));

    expect(requestChange).toHaveBeenCalledWith('phone', '0779998888');
    // Delivery is not wired up yet, so the code is displayed right here.
    expect(await within(phone).findByText('482913')).toBeTruthy();
    expect(verifyChange).not.toHaveBeenCalled();

    await user.click(within(phone).getByRole('button', { name: /autofill/i }));
    await user.click(within(phone).getByRole('button', { name: /verify & save/i }));

    await waitFor(() => expect(verifyChange).toHaveBeenCalledWith('chg_1', '482913'));
    await waitFor(() =>
      expect(within(phone).queryByRole('button', { name: /verify & save/i })).toBeNull()
    );
    expect(within(phone).getByText('0779998888')).toBeTruthy();
  });

  it('checks the new email before asking for a code', async () => {
    const user = userEvent.setup();
    renderPage();

    const email = await screen.findByRole('region', { name: 'Email address' });
    await user.click(within(email).getByRole('button', { name: /change/i }));
    await user.type(within(email).getByLabelText(/new email address/i), 'not-an-email');
    await user.click(within(email).getByRole('button', { name: /send code/i }));

    expect(await within(email).findByText('Enter a valid email address.')).toBeTruthy();
    expect(requestChange).not.toHaveBeenCalled();
  });
});
