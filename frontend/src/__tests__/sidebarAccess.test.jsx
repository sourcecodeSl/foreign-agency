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
  it('gives the Main Admin the whole menu, grouped by the work', () => {
    renderFor({ roleSlug: 'main_admin', role: 'Main Admin' });

    for (const section of [
      'Overview',
      'Candidate Management',
      'Foreign Agent Management',
      'User Management',
      'Verification',
    ]) {
      expect(screen.getByText(section)).toBeTruthy();
    }

    // Coordinators and both kinds of agency sit under Foreign Agent Management.
    expect(screen.getByRole('link', { name: /coordinators & access/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /foreign company/i }).getAttribute('href')).toBe(
      '/agencies?type=foreign'
    );
    expect(screen.getByRole('link', { name: /local agency/i }).getAttribute('href')).toBe(
      '/agencies?type=local'
    );

    // Candidate Management carries both views.
    expect(screen.getByRole('link', { name: /candidate list/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /candidates by agency/i })).toBeTruthy();
  });

  it('shows a coordinator only the pages opened to them', () => {
    renderFor({ roleSlug: 'coordinator', role: 'Coordinator', pages: ['candidates', 'verification'] });

    expect(screen.getByRole('link', { name: /candidate list/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /candidates by agency/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /email verification/i })).toBeTruthy();

    for (const name of [/dashboard/i, /foreign company/i, /local agency/i, /users list/i, /coordinators/i]) {
      expect(screen.queryByRole('link', { name })).toBeNull();
    }

    // Sections left with nothing in them go too.
    expect(screen.queryByText('Foreign Agent Management')).toBeNull();
    expect(screen.queryByText('User Management')).toBeNull();
  });

  it('keeps the coordinator list for the Main Admin alone', () => {
    renderFor({ roleSlug: 'auditor', role: 'Auditor' });

    expect(screen.getByRole('link', { name: /users list/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /foreign company/i })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /coordinators & access/i })).toBeNull();
  });

  it('gives a foreign company and a local agency the agreements page', () => {
    for (const type of ['foreign', 'local']) {
      const { unmount } = renderFor({ roleSlug: 'agency_owner', role: 'Agency Owner', agency: { name: 'Negev', type } });
      expect(screen.getByRole('link', { name: /employment agreements/i }).getAttribute('href')).toBe('/agreements');
      unmount();
    }
  });

  it('lands a coordinator on the first page opened to them', () => {
    expect(homePathFor('coordinator', ['verification', 'candidates'])).toBe('/candidates');
    expect(homePathFor('coordinator', [])).toBe('/no-access');
    expect(homePathFor('main_admin')).toBe('/dashboard');
  });
});
