import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import CompanyAgreement from '../pages/agreements/CompanyAgreement';

const update = vi.fn();
const sendToAdmin = vi.fn();
const sendToAgency = vi.fn();
const recipients = vi.fn();
const localiseEmployer = vi.fn();

vi.mock('../lib/api', () => ({
  agreementApi: {
    update: (...args) => update(...args),
    sendToAdmin: (...args) => sendToAdmin(...args),
    sendToAgency: (...args) => sendToAgency(...args),
    recipients: (...args) => recipients(...args),
    localiseEmployer: (...args) => localiseEmployer(...args),
    fileUrl: vi.fn(),
    templateFileUrl: vi.fn(),
  },
}));

let account = null;
vi.mock('../context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({ admin: account }),
}));

// Confirmations are answered yes.
vi.mock('../lib/alert', async (importOriginal) => ({
  ...(await importOriginal()),
  alertError: vi.fn(),
  confirmAction: vi.fn(async () => true),
}));

const field = (key, kind, en, he, si) => ({ key, kind, multiline: false, label: { en, he, si } });

const AGREEMENT = {
  id: 7,
  agencyId: 'AG-9301',
  agencyName: 'Negev Builders Ltd',
  title: 'SEC 2025',
  status: 'draft',
  employerSection: {
    key: 'employer',
    fields: [
      field('company_registration_no', 'text', 'Company Registration No.', 'ח.פ.', 'සමාගම් ලියාපදිංචි අංකය'),
      field('representative_name', 'name', 'Authorised representative - Name', 'נציג מורשה - שם', 'නම'),
    ],
  },
  values: {
    company_registration_no: { en: '514236789', he: '514236789', si: '514236789' },
    representative_name: { en: 'Ruth Levin', he: 'רות לוין', si: 'රුත් ලෙවින්', auto: { he: true, si: true } },
  },
};

const COMPANY = { roleSlug: 'agency_owner', agency: { id: 'AG-9301', type: 'foreign' } };
const ADMIN = { roleSlug: 'main_admin' };
const LOCAL = { roleSlug: 'agency_owner', agency: { id: 'AG-9302', type: 'local' } };

function renderAs(who, agreement = AGREEMENT) {
  account = who;
  const onChange = vi.fn();
  render(
    <MemoryRouter>
      <ToastProvider>
        <CompanyAgreement agreement={agreement} onChange={onChange} />
      </ToastProvider>
    </MemoryRouter>
  );
  return onChange;
}

describe("a foreign company's agreement, from each side", () => {
  beforeEach(() => {
    update.mockReset().mockImplementation(async (id, payload) => ({ data: { ...AGREEMENT, values: payload.values } }));
    sendToAdmin.mockReset().mockResolvedValue({ data: { ...AGREEMENT, status: 'sent_to_admin' }, message: 'Sent.' });
    sendToAgency.mockReset().mockResolvedValue({ data: { ...AGREEMENT, status: 'sent_to_agency' }, message: 'Sent.' });
    recipients.mockReset().mockResolvedValue({
      data: { companies: [], localAgencies: [{ id: 'AG-9302', name: 'Skyline Manpower', code: 'SKY' }] },
    });
  });

  it('lets the company change any cell, then send it to the admin', async () => {
    const user = userEvent.setup();
    const onChange = renderAs(COMPANY);

    // Filled in every script already, and every cell open - English and numbers too.
    expect(screen.getByLabelText('Company Registration No. (he)').value).toBe('514236789');
    const number = screen.getByLabelText('Company Registration No. (en)');
    await user.clear(number);
    await user.type(number, '514236790');
    // A number reads the same in every language, so its English carries over.
    expect(screen.getByLabelText('Company Registration No. (si)').value).toBe('514236790');

    const hebrew = screen.getByLabelText('Authorised representative - Name (he)');
    expect(hebrew.value).toBe('רות לוין');

    await user.clear(hebrew);
    await user.type(hebrew, 'רות לווין');
    await user.click(screen.getByRole('button', { name: /send to admin/i }));

    // The correction is saved first, then it is sent.
    await waitFor(() => expect(sendToAdmin).toHaveBeenCalledWith(7));
    expect(update.mock.calls[0][1].values.representative_name.he).toBe('רות לווין');
    expect(update.mock.calls[0][1].values.company_registration_no.he).toBe('514236790');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'sent_to_admin' }));
  });

  it('fills the Hebrew and Sinhala again when the English changes', async () => {
    localiseEmployer.mockReset().mockResolvedValue({
      data: {
        values: {
          representative_name: {
            en: 'Visal Theekshana',
            he: 'ויסל תיקשנה',
            si: 'විසල් තීක්ෂණ',
            auto: { he: true, si: true },
          },
        },
      },
    });
    update.mockClear();
    const user = userEvent.setup();
    renderAs(COMPANY);

    const english = screen.getByLabelText('Authorised representative - Name (en)');
    await user.clear(english);
    await user.type(english, 'Visal Theekshana');
    // Leaving the English carries it over.
    await user.tab();

    await waitFor(() => expect(localiseEmployer).toHaveBeenCalledWith({ representative_name: 'Visal Theekshana' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Authorised representative - Name (he)').value).toBe('ויסל תיקשנה')
    );
    expect(screen.getByLabelText('Authorised representative - Name (si)').value).toBe('විසල් තීක්ෂණ');

    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1].values.representative_name.si).toBe('විසල් තීක්ෂණ');
    // Already carried over, so Save does not ask again.
    expect(localiseEmployer).toHaveBeenCalledTimes(1);
  });

  it('lets the company still correct it once sent, without sending it again', async () => {
    const user = userEvent.setup();
    renderAs(COMPANY, { ...AGREEMENT, status: 'sent_to_admin' });

    expect(screen.queryByRole('button', { name: /send to admin/i })).toBeNull();
    expect(screen.getByText('Sent to admin')).toBeTruthy();

    const hebrew = screen.getByLabelText('Authorised representative - Name (he)');
    await user.clear(hebrew);
    await user.type(hebrew, 'רות לווין');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1].values.representative_name.he).toBe('רות לווין');
    expect(sendToAdmin).not.toHaveBeenCalled();
  });

  it('lets the admin pass a sent agreement to a local agency', async () => {
    const user = userEvent.setup();
    renderAs(ADMIN, { ...AGREEMENT, status: 'sent_to_admin' });

    await screen.findByRole('option', { name: /skyline manpower/i });
    await user.selectOptions(screen.getByLabelText('Local agency'), 'AG-9302');
    await user.click(screen.getByRole('button', { name: /send to local agency/i }));

    await waitFor(() => expect(sendToAgency).toHaveBeenCalledWith(7, 'AG-9302'));
    // The admin reads it; it is the company's to fill.
    expect(screen.queryByLabelText('Authorised representative - Name (he)')).toBeNull();
  });

  it('only shows the local agency what it was sent', () => {
    renderAs(LOCAL, { ...AGREEMENT, status: 'sent_to_agency', localAgencyName: 'Skyline Manpower' });

    expect(screen.getByTestId('Authorised representative - Name (he)').textContent).toBe('רות לוין');
    expect(screen.queryByRole('button', { name: /send/i })).toBeNull();
    expect(recipients).not.toHaveBeenCalled();
  });
});
