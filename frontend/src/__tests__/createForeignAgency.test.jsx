import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import CreateAgency from '../pages/agency/CreateAgency';

// The country list the picker reads, which its own Add writes to; the rest of
// the api module is the real one.
const added = ['Israel'];

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal()),
  countryApi: {
    list: async () => ({ data: added.map((name, i) => ({ id: i + 1, name, slug: name.toLowerCase() })) }),
    create: async (name) => {
      added.push(name);
      return { data: { id: added.length, name, slug: name.toLowerCase() } };
    },
    remove: async (id) => ({ data: { id } }),
  },
}));

function renderForm() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <CreateAgency />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('creating a foreign company', () => {
  // Types its way through a long form, which runs past the 5s default when
  // the whole suite is running at once.
  it('asks where it is based, then issues its own login', { timeout: 20000 }, async () => {
    const user = userEvent.setup();
    renderForm();

    // Local is the default; a foreign company is picked explicitly.
    expect(screen.getByLabelText(/local agency/i).checked).toBe(true);
    expect(screen.queryByLabelText(/^country/i)).toBeNull();

    await user.click(screen.getByLabelText(/foreign company/i));

    // A foreign record is worded as a company and files more than an agency.
    await user.type(screen.getByLabelText(/company name/i), 'Horizon Manpower');
    await user.type(screen.getByLabelText(/registration no/i), '514236789');
    await user.type(screen.getByLabelText(/lawyer name/i), 'Ruth Levin');
    await user.type(screen.getByLabelText(/lawyer id no/i), '038512477');
    await user.type(screen.getByLabelText(/^position/i), 'Company Secretary');
    await user.type(screen.getByLabelText(/contact person/i), 'Avi Cohen');
    await user.type(screen.getByLabelText(/address/i), '12 Herzl Street, Tel Aviv');
    await user.type(screen.getByLabelText(/email/i), 'owner@horizon.example');
    await user.type(screen.getByLabelText(/phone/i), '+972501234567');
    await user.type(screen.getByLabelText(/username/i), 'horizon.owner');
    await user.type(screen.getByLabelText(/^password/i), 'Horizon@2026');

    await user.click(screen.getByRole('button', { name: /create agency/i }));

    expect(await screen.findByText('Enter the country this company is based in.')).toBeTruthy();
    expect(screen.getByText(/no credentials yet/i)).toBeTruthy();

    await user.selectOptions(await screen.findByLabelText(/^country/i), 'Israel');
    await user.click(screen.getByRole('button', { name: /create agency/i }));

    await waitFor(() => expect(screen.getByText(/\(foreign company\) was created/i)).toBeTruthy(), {
      timeout: 4000,
    });
    expect(screen.getByText('horizon.owner')).toBeTruthy();
  });

  it('adds a country to the list the picker offers', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByLabelText(/foreign company/i));
    await screen.findByLabelText(/^country/i);

    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.type(screen.getByLabelText('New country'), 'Romania');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    // Added, it is picked straight away and the field closes.
    await waitFor(() => expect(screen.getByLabelText(/^country/i).value).toBe('Romania'));
    expect(screen.queryByLabelText('New country')).toBeNull();
  });

  it('asks an agency for none of the company details', async () => {
    renderForm();

    expect(screen.getByLabelText(/agency name/i)).toBeTruthy();
    expect(screen.queryByLabelText(/registration no/i)).toBeNull();
    expect(screen.queryByLabelText(/lawyer name/i)).toBeNull();
  });
});
