import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import { homePathFor } from '../context/AuthContext';

let account = null;

vi.mock('../context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({ admin: account }),
}));

function renderFor(admin) {
  account = admin;
  return render(
    <MemoryRouter>
      <Sidebar open onClose={() => {}} />
    </MemoryRouter>
  );
}

describe('menu by who is signed in', () => {
  it('shows a coordinator only the pages opened to them', () => {
    renderFor({ roleSlug: 'coordinator', role: 'Coordinator', pages: ['candidates', 'verification'] });

    expect(screen.getByRole('link', { name: /candidates by agency/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /email verification/i })).toBeTruthy();

    for (const name of [/dashboard/i, /agency list/i, /create agency/i, /users list/i, /user permissions/i, /coordinators/i]) {
      expect(screen.queryByRole('link', { name })).toBeNull();
    }

    // A section with nothing left in it goes too.
    expect(screen.queryByText(/user management/i)).toBeNull();
  });

  it('keeps the coordinator list for the Main Admin alone', () => {
    renderFor({ roleSlug: 'auditor', role: 'Auditor' });

    expect(screen.getByRole('link', { name: /users list/i })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /coordinators & access/i })).toBeNull();
  });

  it('gives the Main Admin the whole menu, coordinators included', () => {
    renderFor({ roleSlug: 'main_admin', role: 'Main Admin' });

    expect(screen.getByRole('link', { name: /coordinators & access/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /create agency/i })).toBeTruthy();
  });

  it('lands a coordinator on the first page opened to them', () => {
    expect(homePathFor('coordinator', ['verification', 'candidates'])).toBe('/candidates');
    expect(homePathFor('coordinator', [])).toBe('/no-access');
    expect(homePathFor('main_admin')).toBe('/dashboard');
  });
});
