import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import EmployerAgreement from '../pages/agreements/EmployerAgreement';

const draft = vi.fn();
const submit = vi.fn();
const list = vi.fn();

vi.mock('../lib/api', () => ({
  employerAgreementApi: {
    draft: (...args) => draft(...args),
    submit: (...args) => submit(...args),
    list: (...args) => list(...args),
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ admin: { roleSlug: 'agency_owner', agency: { type: 'foreign' } } }),
}));

const field = (key, kind, en, he, si) => ({ key, kind, multiline: false, label: { en, he, si } });
const same = (text) => ({ en: text, he: text, si: text, auto: { he: false, si: false } });

const SECTION = {
  key: 'employer',
  fields: [
    field('company_registration_no', 'text', 'Company Registration No.', 'ח.פ.', 'සමාගම් ලියාපදිංචි අංකය'),
    field('company_name', 'name', 'Manpower Company Name', 'שם תאגיד כוח-האדם', 'මෑන්පවර් සමාගම නම'),
    field('representative_position', 'translate', 'Position in Company', 'תפקידו בחברה', 'සමාගමෙහි තනතුර'),
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <EmployerAgreement />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('a foreign company submitting the employer part of the agreement', () => {
  beforeEach(() => {
    draft.mockReset().mockResolvedValue({
      data: {
        section: SECTION,
        values: {
          company_registration_no: same('514236789'),
          company_name: {
            en: 'Negev Builders Ltd',
            he: 'נגו בוילדרס בע"מ',
            si: 'නෙගෙව් බුයිල්ඩෙර්ස් සමාගම',
            auto: { he: true, si: true },
          },
          representative_position: same('Company Secretary'),
        },
        missing: [],
      },
    });
    list.mockReset().mockResolvedValue({ data: { section: SECTION, agreements: [] } });
    submit.mockReset().mockResolvedValue({ data: {}, message: 'Agreement submitted.' });
  });

  it('shows the company details in all three languages, ready to submit', async () => {
    const user = userEvent.setup();
    renderPage();

    // A number is the same in every language, and cannot be typed over.
    expect((await screen.findByTestId('Company Registration No. (he)')).textContent).toBe('514236789');
    expect(screen.queryByLabelText('Company Registration No. (he)')).toBeNull();
    // A name comes in each language's own script, and can be corrected.
    expect(screen.getByLabelText('Manpower Company Name (he)').value).toBe('נגו בוילדרס בע"מ');
    expect(screen.getByLabelText('Manpower Company Name (si)').value).toBe('නෙගෙව් බුයිල්ඩෙර්ස් සමාගම');

    const hebrew = screen.getByLabelText('Position in Company (he)');
    await user.clear(hebrew);
    await user.type(hebrew, 'מזכירת החברה');

    await user.click(screen.getByRole('button', { name: /submit agreement/i }));

    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0].representative_position.he).toBe('מזכירת החברה');
  });

  it('holds the submit back while company details are missing', async () => {
    draft.mockResolvedValue({
      data: { section: SECTION, values: { company_name: same('Negev Builders Ltd') }, missing: ['Israeli I.D. No.'] },
    });
    renderPage();

    expect(await screen.findByText(/Missing: Israeli I.D. No./)).toBeTruthy();
    expect(screen.getByRole('button', { name: /submit agreement/i }).disabled).toBe(true);
  });
});
