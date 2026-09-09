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

describe('creating an agency', () => {
  it('will not submit without a contact person', async () => {
    const user = userEvent.setup();
    renderForm();

    // Everything except the contact person.
    await user.type(screen.getByLabelText(/^name/i), 'Skyline Marketing');
    await user.type(screen.getByLabelText(/address/i), '221B Baker Street, Colombo 03');
    await user.type(screen.getByLabelText(/email/i), 'owner@skyline.lk');
    await user.type(screen.getByLabelText(/phone/i), '0771234567');
    await user.type(screen.getByLabelText(/username/i), 'skyline.owner');
    await user.type(screen.getByLabelText(/^password/i), 'Skyline@2026');

    await user.click(screen.getByRole('button', { name: /create agency/i }));

    expect(await screen.findByText('Contact person is required.')).toBeTruthy();
    // Nothing was issued, so the credentials panel stays empty.
    expect(screen.getByText(/no credentials yet/i)).toBeTruthy();
  });

  it('issues credentials once the contact person is filled in', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/^name/i), 'Skyline Marketing');
    await user.type(screen.getByLabelText(/contact person/i), 'Nadia Perera');
    await user.type(screen.getByLabelText(/address/i), '221B Baker Street, Colombo 03');
    await user.type(screen.getByLabelText(/email/i), 'owner@skyline.lk');
    await user.type(screen.getByLabelText(/phone/i), '0771234567');
    await user.type(screen.getByLabelText(/username/i), 'skyline.owner');
    await user.type(screen.getByLabelText(/^password/i), 'Skyline@2026');

    await user.click(screen.getByRole('button', { name: /create agency/i }));

    await waitFor(
      () => expect(screen.getByText(/awaiting approval/i)).toBeTruthy(),
      { timeout: 4000 }
    );
    expect(screen.getByText('skyline.owner')).toBeTruthy();
  });
});
