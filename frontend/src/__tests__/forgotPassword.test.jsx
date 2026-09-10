import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Login from '../pages/auth/Login';
import ForgotPassword from '../pages/auth/ForgotPassword';

// The adapter is stubbed so the assertions are about what the page asks for.
const forgotPassword = vi.fn();
const verifyResetCode = vi.fn();
const resendResetCode = vi.fn();
const resetPassword = vi.fn();

vi.mock('../lib/api', () => ({
  authApi: {
    forgotPassword: (...args) => forgotPassword(...args),
    verifyResetCode: (...args) => verifyResetCode(...args),
    resendResetCode: (...args) => resendResetCode(...args),
    resetPassword: (...args) => resetPassword(...args),
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn() }),
}));

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('forgotten password', () => {
  beforeEach(() => {
    forgotPassword.mockReset();
    verifyResetCode.mockReset();
    resendResetCode.mockReset();
    resetPassword.mockReset();
  });

  it('is reached from the sign-in screen', async () => {
    const user = userEvent.setup();
    renderAt('/login');

    await user.click(screen.getByRole('link', { name: /forgot password/i }));

    expect(await screen.findByText('Forgot your password?')).toBeTruthy();
  });

  it('finds the account, shows the emailed code, then takes a new password', async () => {
    const user = userEvent.setup();
    forgotPassword.mockResolvedValue({
      data: { challengeId: 'chg_r', username: 'mainadmin', maskedEmail: 'ad***@example.com', devCode: '731904' },
    });
    verifyResetCode.mockResolvedValue({ data: { resetToken: 'chg_ready' } });
    resetPassword.mockResolvedValue({ data: { username: 'mainadmin' } });
    renderAt('/forgot-password');

    // --- step 1: the username identifies the account and its email ---
    await user.type(screen.getByLabelText(/username/i), 'mainadmin');
    await user.click(screen.getByRole('button', { name: /send verification code/i }));
    expect(forgotPassword).toHaveBeenCalledWith({ username: 'mainadmin' });

    // --- step 2: the code is shown on the page while delivery is not set up ---
    expect(await screen.findByText('ad***@example.com')).toBeTruthy();
    expect(screen.getByText('731904')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /autofill/i }));
    await user.click(screen.getByRole('button', { name: /verify code/i }));
    await waitFor(() =>
      expect(verifyResetCode).toHaveBeenCalledWith({ challengeId: 'chg_r', code: '731904' })
    );

    // --- step 3: a weak password never reaches the API ---
    const password = await screen.findByLabelText(/^new password/i);
    const confirm = screen.getByLabelText(/confirm new password/i);
    await user.type(password, 'weak');
    await user.type(confirm, 'weak');
    await user.click(screen.getByRole('button', { name: /update password/i }));
    expect(await screen.findByText(/use at least 8 characters/i)).toBeTruthy();
    expect(resetPassword).not.toHaveBeenCalled();

    await user.clear(password);
    await user.type(password, 'NewPass123');
    await user.clear(confirm);
    await user.type(confirm, 'NewPass123');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith({
        resetToken: 'chg_ready',
        password: 'NewPass123',
        passwordConfirmation: 'NewPass123',
      })
    );
    expect(await screen.findByText('Password updated')).toBeTruthy();

    // Back on the sign-in screen with the username already filled in.
    await user.click(screen.getByRole('button', { name: /back to sign in/i }));
    expect(await screen.findByText('Sign in to your account')).toBeTruthy();
    expect(screen.getByLabelText(/username/i).value).toBe('mainadmin');
  });

  it('says so when no account has that username', async () => {
    const user = userEvent.setup();
    const message = 'No account was found with that username.';
    forgotPassword.mockRejectedValue(
      Object.assign(new Error(message), { status: 404, errors: { username: message } })
    );
    renderAt('/forgot-password');

    await user.type(screen.getByLabelText(/username/i), 'ghost');
    await user.click(screen.getByRole('button', { name: /send verification code/i }));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText('Check your email')).toBeNull();
  });
});
