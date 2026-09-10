import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

/**
 * Walks the real sign-in flow the way a person does:
 * login -> phone OTP -> email OTP -> dashboard.
 */
describe('two-factor sign-in flow', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/login');
  });

  it('reaches the email step after the phone code is accepted', async () => {
    const user = userEvent.setup();
    render(<App />);

    // --- step 1: credentials ---
    await screen.findByLabelText(/username/i);
    await user.type(screen.getByLabelText(/username/i), 'main.admin');
    await user.type(screen.getByLabelText(/^password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    // --- step 2: phone OTP ---
    await screen.findByText(/verify your phone number/i, {}, { timeout: 4000 });
    const phoneCode = (await screen.findByText(/^\d{6}$/)).textContent;

    await user.click(screen.getByRole('button', { name: /autofill/i }));
    await user.click(screen.getByRole('button', { name: /verify phone/i }));

    // --- step 3: should now be on the email screen ---
    await waitFor(
      () => expect(screen.getByText(/verify your email address/i)).toBeTruthy(),
      { timeout: 4000 }
    );

    const emailCode = (await screen.findByText(/^\d{6}$/)).textContent;
    expect(emailCode).not.toEqual(phoneCode); // a fresh code for the new channel
    // Masked, and masked from a placeholder address - no real one is baked in.
    expect(screen.getByText(/ad\*+@example\.com/)).toBeTruthy();
  });

  it('signs in only after the email code is accepted', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByLabelText(/username/i);
    await user.type(screen.getByLabelText(/username/i), 'main.admin');
    await user.type(screen.getByLabelText(/^password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await screen.findByText(/verify your phone number/i, {}, { timeout: 4000 });
    await user.click(screen.getByRole('button', { name: /autofill/i }));
    await user.click(screen.getByRole('button', { name: /verify phone/i }));

    await screen.findByText(/verify your email address/i, {}, { timeout: 4000 });
    expect(localStorage.getItem('aa.token')).toBeNull(); // no session yet

    await user.click(screen.getByRole('button', { name: /autofill/i }));
    await user.click(screen.getByRole('button', { name: /verify email & sign in/i }));

    await waitFor(() => expect(localStorage.getItem('aa.token')).toBeTruthy(), { timeout: 4000 });
  });
});

describe('stale session from an earlier sign-in', () => {
  beforeEach(() => {
    localStorage.clear();
    // A token left behind by a previous session - exactly what a developer
    // who signed in before has sitting in their browser.
    localStorage.setItem('aa.token', 'mock.jwt.token');
    window.history.pushState({}, '', '/login');
  });

  it('still forces the email step instead of jumping to the dashboard', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByLabelText(/username/i, {}, { timeout: 4000 });
    await user.type(screen.getByLabelText(/username/i), 'main.admin');
    await user.type(screen.getByLabelText(/^password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await screen.findByText(/verify your phone number/i, {}, { timeout: 4000 });
    await user.click(screen.getByRole('button', { name: /autofill/i }));
    await user.click(screen.getByRole('button', { name: /verify phone/i }));

    // The email screen must appear - it must NOT be skipped.
    await waitFor(
      () => expect(screen.getByText(/verify your email address/i)).toBeTruthy(),
      { timeout: 4000 }
    );
  });
});
