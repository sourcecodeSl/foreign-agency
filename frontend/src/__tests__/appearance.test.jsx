import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import Sidebar from '../components/layout/Sidebar';
import Appearance from '../pages/settings/Appearance';
import { AppearanceProvider } from '../context/AppearanceContext';
import { DEFAULT_APPEARANCE, appearanceVars, applyAppearance, scaleFrom } from '../lib/theme';

const get = vi.fn();
const save = vi.fn();
vi.mock('../lib/api', () => ({
  appearanceApi: { get: (...a) => get(...a), save: (...a) => save(...a) },
}));

let account = { id: 1, roleSlug: 'agency_owner', agency: { id: 'AG-1', type: 'local' } };
vi.mock('../context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({ admin: account }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AppearanceProvider>
          <Appearance />
        </AppearanceProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

const cssVar = (name) => document.documentElement.style.getPropertyValue(name);

describe('the theme engine', () => {
  it('turns pale backgrounds deep and dark text pale in the dark', () => {
    const light = appearanceVars({ mode: 'light' }).vars;
    const dark = appearanceVars({ mode: 'dark' }).vars;

    // The page background and the card go dark, text goes light.
    expect(light['--c-gray-50']).toBe('249 250 251');
    expect(dark['--c-gray-50']).toBe('11 17 32');
    expect(dark['--c-gray-900']).toBe('248 250 252');
    expect(dark['--c-surface']).toBe('17 24 39');
    // Buttons keep their colour; a pale tint turns deep.
    expect(dark['--c-primary-600']).toBe(light['--c-primary-600']);
    expect(dark['--c-red-50']).toBe(light['--c-red-950']);
  });

  it('gives the sidebar its own colours only when it is dark or takes the accent', () => {
    expect(appearanceVars({ sidebar: 'default' }).vars['--sb-bg']).toBe('');
    expect(appearanceVars({ sidebar: 'dark' }).vars['--sb-bg']).toBe('15 23 42');
    // The accent sidebar is the accent's deepest shade: emerald-900.
    expect(appearanceVars({ sidebar: 'brand', accent: 'emerald' }).vars['--sb-bg']).toBe('6 78 59');
  });

  it('builds a whole scale from a colour picked by hand', () => {
    const scale = scaleFrom('#ff6b35');

    // The picked colour is the button shade, with paler tints and deeper shades around it.
    expect(scale[6]).toBe('#ff6b35');
    expect(scale[0]).toBe('#fff6f3');
    expect(scale[9]).toBe('#8a3a1d');
    expect(appearanceVars({ accent: 'custom', customAccent: '#ff6b35' }).vars['--c-primary-600']).toBe('255 107 53');
  });

  it('writes light text on a dark sidebar colour, and dark text on a light one', () => {
    const dark = appearanceVars({ sidebar: 'custom', sidebarColor: '#2d1b4e' }).vars;
    const light = appearanceVars({ sidebar: 'custom', sidebarColor: '#f5f0e6' }).vars;

    expect(dark['--sb-bg']).toBe('45 27 78');
    expect(dark['--sb-title']).toBe('255 255 255');
    expect(light['--sb-title']).toBe('17 24 39');
  });

  it('puts an appearance on the page', () => {
    applyAppearance({ ...DEFAULT_APPEARANCE, mode: 'dark', accent: 'rose', textSize: 'large' });

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.fontSize).toBe('17px');
    // rose-600
    expect(cssVar('--c-primary-600')).toBe('225 29 72');

    applyAppearance(DEFAULT_APPEARANCE);
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('the Appearance page', () => {
  beforeEach(() => {
    localStorage.clear();
    applyAppearance(DEFAULT_APPEARANCE);
    get.mockReset().mockResolvedValue({ data: { ...DEFAULT_APPEARANCE, accent: 'violet' } });
    save.mockReset().mockResolvedValue({ data: {} });
  });

  it("opens on the person's own saved look", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Violet' }).getAttribute('aria-checked')).toBe('true'));
    // violet-600
    expect(cssVar('--c-primary-600')).toBe('124 58 237');
  });

  it('shows a change at once and saves it to the login', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(get).toHaveBeenCalled());

    await user.click(within(screen.getByRole('radiogroup', { name: 'Theme' })).getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await waitFor(() => expect(save).toHaveBeenCalledWith({ mode: 'dark' }));

    await user.click(screen.getByRole('radio', { name: 'Large' }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith({ textSize: 'large' }));
    expect(document.documentElement.style.fontSize).toBe('17px');

    // Reset puts every choice back.
    await user.click(screen.getByRole('button', { name: /reset to default/i }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(DEFAULT_APPEARANCE));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('goes back to the last look when the server does not keep a change', async () => {
    save.mockRejectedValue(new Error('Could not save.'));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Violet' }).getAttribute('aria-checked')).toBe('true'));

    await user.click(screen.getByRole('radio', { name: 'Teal' }));
    // The error is shown in a pop-up, which hides the page behind it.
    expect(await screen.findByText('Could not save.')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Violet', hidden: true }).getAttribute('aria-checked')).toBe('true')
    );
    // violet-600 again, not teal.
    expect(cssVar('--c-primary-600')).toBe('124 58 237');
  });
});

describe('colours picked by hand', () => {
  beforeEach(() => {
    localStorage.clear();
    applyAppearance(DEFAULT_APPEARANCE);
    get.mockReset().mockResolvedValue({ data: DEFAULT_APPEARANCE });
    save.mockReset().mockResolvedValue({ data: {} });
  });

  it('shows a picked accent at once and saves it once it settles', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(get).toHaveBeenCalled());

    await user.click(within(screen.getByRole('radiogroup', { name: 'Accent colour' })).getByRole('radio', { name: 'Custom' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ accent: 'custom' }));

    const code = screen.getByLabelText('Your accent colour code');
    await user.clear(code);
    await user.type(code, '#0f766e');

    // On screen straight away (teal-700), saved once it stops changing.
    expect(cssVar('--c-primary-600')).toBe('15 118 110');
    await waitFor(() => expect(save).toHaveBeenLastCalledWith({ accent: 'custom', customAccent: '#0f766e' }));
    // Only the finished colour is saved, not every letter typed.
    expect(save.mock.calls.filter(([changes]) => changes.customAccent)).toHaveLength(1);
  });

  it('warns when white text would be hard to read on the picked colour', async () => {
    get.mockResolvedValue({ data: { ...DEFAULT_APPEARANCE, accent: 'custom', customAccent: '#fde68a' } });
    renderPage();

    expect(await screen.findByText(/white text on buttons may be hard to read/i)).toBeTruthy();
  });

  it('refuses a colour code that is not #rrggbb', async () => {
    get.mockResolvedValue({ data: { ...DEFAULT_APPEARANCE, sidebar: 'custom', sidebarColor: '#2d1b4e' } });
    const user = userEvent.setup();
    renderPage();

    const code = await screen.findByLabelText('Your sidebar colour code');
    await user.clear(code);
    await user.type(code, '#2d1b');

    expect(screen.getByText('Enter the colour as #rrggbb.')).toBeTruthy();
    // The sidebar keeps the last good colour.
    expect(cssVar('--sb-bg')).toBe('45 27 78');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('the Appearance link', () => {
  it.each([
    ['the Main Admin', { roleSlug: 'main_admin' }],
    ['a coordinator with no pages opened', { roleSlug: 'coordinator', pages: [] }],
    ['a local agency', { roleSlug: 'agency_owner', agency: { id: 'AG-1', type: 'local' } }],
    ['a foreign company', { roleSlug: 'agency_owner', agency: { id: 'AG-2', type: 'foreign' } }],
    ['agency staff', { roleSlug: 'agent', agency: { id: 'AG-1', type: 'local' } }],
  ])('is in the menu for %s', (_who, admin) => {
    account = admin;
    render(
      <MemoryRouter>
        <Sidebar open onClose={() => {}} />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /appearance/i }).getAttribute('href')).toBe('/settings/appearance');
  });
});
