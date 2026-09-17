import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import CreateAgency from '../pages/agency/CreateAgency';

function renderForm() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <CreateAgency />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('creating a foreign agency', () => {
  it('asks where it is based, then issues its own login', async () => {
    const user = userEvent.setup();
    renderForm();

    // Local is the default; a foreign agency is picked explicitly.
    expect(screen.getByLabelText(/local agency/i).checked).toBe(true);
    expect(screen.queryByLabelText(/^country/i)).toBeNull();

    await user.click(screen.getByLabelText(/foreign agency/i));
    await user.type(screen.getByLabelText(/^name/i), 'Horizon Manpower');
    await user.type(screen.getByLabelText(/contact person/i), 'Avi Cohen');
    await user.type(screen.getByLabelText(/address/i), '12 Herzl Street, Tel Aviv');
    await user.type(screen.getByLabelText(/email/i), 'owner@horizon.example');
    await user.type(screen.getByLabelText(/phone/i), '+972501234567');
    await user.type(screen.getByLabelText(/username/i), 'horizon.owner');
    await user.type(screen.getByLabelText(/^password/i), 'Horizon@2026');

    await user.click(screen.getByRole('button', { name: /create agency/i }));

    expect(await screen.findByText('Enter the country this agency is based in.')).toBeTruthy();
    expect(screen.getByText(/no credentials yet/i)).toBeTruthy();

    await user.type(screen.getByLabelText(/^country/i), 'Israel');
    await user.click(screen.getByRole('button', { name: /create agency/i }));

    await waitFor(() => expect(screen.getByText(/\(foreign agency\) was created/i)).toBeTruthy(), {
      timeout: 4000,
    });
    expect(screen.getByText('horizon.owner')).toBeTruthy();
  });
});
