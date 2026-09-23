import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Register from '../pages/auth/Register';

const register = vi.fn();

vi.mock('../lib/api', () => ({
  authApi: {
    register: (...args) => register(...args),
  },
  countryApi: {
    list: async () => ({ data: [{ id: 1, name: 'Israel', slug: 'israel' }] }),
  },
}));

vi.mock('../lib/alert', async (importOriginal) => ({
  ...(await importOriginal()),
  alertError: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );
}

describe('an agency registering itself', () => {
  beforeEach(() => {
    register.mockReset().mockResolvedValue({
      data: { reference: 'SKY-1043', name: 'Skyline Manpower', type: 'foreign', email: 'sky@example.com' },
    });
  });

  it('asks a foreign company for its country and registration number', async () => {
    const user = userEvent.setup();
    renderPage();

    // A local agency is asked for neither.
    await user.click(screen.getByLabelText(/local agency/i));
    expect(screen.queryByLabelText(/^country/i)).toBeNull();

    await user.click(screen.getByLabelText(/foreign company/i));
    await user.type(screen.getByLabelText(/company name/i), 'Skyline Manpower');
    await user.type(screen.getByLabelText(/contact person/i), 'Nadia Perera');
    await user.type(screen.getByLabelText(/^address/i), '18 Galle Road, Colombo');
    await user.type(screen.getByLabelText(/^email/i), 'sky@example.com');
    await user.type(screen.getByLabelText(/^phone/i), '0771119999');
    await user.click(screen.getByRole('button', { name: /send registration/i }));

    // Nothing is sent while the foreign fields are empty.
    expect(register).not.toHaveBeenCalled();
    expect(screen.getByText(/country your company is based in/i)).toBeTruthy();

    await user.selectOptions(await screen.findByLabelText(/^country/i), 'Israel');
    await user.type(screen.getByLabelText(/registration number/i), '514236789');
    await user.click(screen.getByRole('button', { name: /send registration/i }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        type: 'foreign',
        name: 'Skyline Manpower',
        country: 'Israel',
        registrationNo: '514236789',
        contact: 'Nadia Perera',
        address: '18 Galle Road, Colombo',
        email: 'sky@example.com',
        phone: '0771119999',
      })
    );

    // No password is ever asked for: the admin issues the login.
    expect(screen.queryByLabelText(/password/i)).toBeNull();

    // The reference comes back, and the form is done with.
    expect(await screen.findByText('SKY-1043')).toBeTruthy();
    expect(screen.getByText(/emailed to/i).textContent).toContain('sky@example.com');
    expect(screen.queryByRole('button', { name: /send registration/i })).toBeNull();
  });

  it('will not send a registration with no type chosen', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/agency name/i), 'Skyline Manpower');
    await user.click(screen.getByRole('button', { name: /send registration/i }));

    expect(screen.getByText(/choose a local agency or a foreign company/i)).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });
});
