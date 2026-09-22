import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import ForeignCompanyInbox from '../pages/agreements/ForeignCompanyInbox';

const list = vi.fn();
const recipients = vi.fn();
const sendToAgency = vi.fn();

vi.mock('../lib/api', () => ({
  agreementApi: {
    list: (...args) => list(...args),
    recipients: (...args) => recipients(...args),
    sendToAgency: (...args) => sendToAgency(...args),
    fileUrl: vi.fn(),
    templateFileUrl: vi.fn(),
  },
}));

vi.mock('../lib/alert', async (importOriginal) => ({
  ...(await importOriginal()),
  alertError: vi.fn(),
  confirmAction: vi.fn(async () => true),
}));

const doc = (id, title, company, agencyId, extra = {}) => ({
  id,
  title,
  agencyId,
  agencyName: company,
  status: 'sent_to_admin',
  sentToAdminAt: '2026-09-20T10:00:00Z',
  ...extra,
});

const WAITING = [
  doc(1, 'SEC 2025', 'Negev Builders', 'AG-1'),
  doc(2, 'Tilers contract', 'Galil Works', 'AG-2'),
];

function renderInbox() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ForeignCompanyInbox />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('documents from foreign companies, on the admin side', () => {
  beforeEach(() => {
    recipients.mockReset().mockResolvedValue({
      data: {
        companies: [
          { id: 'AG-1', name: 'Negev Builders', code: 'NEG', waiting: 1 },
          { id: 'AG-2', name: 'Galil Works', code: 'GAL', waiting: 1 },
        ],
        localAgencies: [{ id: 'AG-9', name: 'Skyline Manpower', code: 'SKY' }],
      },
    });
    list.mockReset().mockImplementation(async ({ company, status }) => ({
      data:
        status === 'sent_to_admin'
          ? WAITING.filter((d) => company === 'all' || d.agencyId === company)
          : [doc(3, 'Old contract', 'Negev Builders', 'AG-1', { status: 'sent_to_agency', localAgencyName: 'Skyline Manpower' })],
    }));
    sendToAgency.mockReset().mockResolvedValue({ data: {} });
  });

  it('shows each document as a card, narrowed by company', async () => {
    const user = userEvent.setup();
    renderInbox();

    expect(await screen.findByText('SEC 2025')).toBeTruthy();
    expect(screen.getByText('Tilers contract')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Foreign company'), 'AG-2');
    await waitFor(() => expect(screen.queryByText('SEC 2025')).toBeNull());
    expect(screen.getByText('Tilers contract')).toBeTruthy();
    expect(list).toHaveBeenLastCalledWith({ company: 'AG-2', status: 'sent_to_admin' });
  });

  it('sends the selected documents to the chosen local agency', async () => {
    const user = userEvent.setup();
    renderInbox();

    await user.click(await screen.findByLabelText('Select SEC 2025 from Negev Builders'));
    await user.click(screen.getByLabelText('Select Tilers contract from Galil Works'));
    expect(screen.getByText('2 documents selected')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Send to local agency'), 'AG-9');
    await user.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => expect(sendToAgency).toHaveBeenCalledTimes(2));
    expect(sendToAgency).toHaveBeenCalledWith(1, 'AG-9');
    expect(sendToAgency).toHaveBeenCalledWith(2, 'AG-9');
  });

  it('lists what was sent, by company and local agency, on its own tab', async () => {
    const user = userEvent.setup();
    renderInbox();

    await user.click(await screen.findByRole('tab', { name: /sent to local agencies/i }));
    expect(await screen.findByText('Old contract')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Local agency'), 'AG-9');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({ company: 'all', localAgency: 'AG-9', status: 'sent_to_agency' })
    );
  });
});
