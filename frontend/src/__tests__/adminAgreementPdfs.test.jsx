import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../components/ui/Toast';
import AdminAgreementPdfs from '../pages/agreements/AdminAgreementPdfs';

const templates = vi.fn();
const uploadTemplate = vi.fn();
const renameTemplate = vi.fn();
const removeTemplate = vi.fn();

vi.mock('../lib/api', () => ({
  agreementApi: {
    templates: (...args) => templates(...args),
    uploadTemplate: (...args) => uploadTemplate(...args),
    renameTemplate: (...args) => renameTemplate(...args),
    removeTemplate: (...args) => removeTemplate(...args),
  },
}));

vi.mock('../lib/alert', async (importOriginal) => ({
  ...(await importOriginal()),
  alertError: vi.fn(),
}));

const SAVED = {
  id: 5,
  name: 'SEC Construction - Sri Lanka 2025',
  originalName: 'sec.pdf',
  layout: 'sec',
  saved: true,
  fromAdmin: true,
  uploadedAt: '2026-09-24T10:00:00Z',
};

function renderCard() {
  return render(
    <ToastProvider>
      <AdminAgreementPdfs />
    </ToastProvider>
  );
}

describe('the agreement PDFs the admin keeps for foreign companies', () => {
  beforeEach(() => {
    templates.mockReset().mockResolvedValue({
      data: { templates: [SAVED], layouts: [{ key: 'sec', name: 'SEC Construction 2025' }] },
    });
    uploadTemplate.mockReset().mockResolvedValue({ data: { id: 6 }, message: 'Saved.' });
    renameTemplate.mockReset().mockResolvedValue({ data: {}, message: 'Heading changed.' });
    removeTemplate.mockReset();
  });

  it('uploads a PDF under the heading companies start with', async () => {
    const user = userEvent.setup();
    renderCard();

    expect(await screen.findByText('SEC Construction - Sri Lanka 2025')).toBeTruthy();

    await user.type(screen.getByLabelText(/^name \(heading\)/i), 'SEC Construction - Sri Lanka 2026');
    const pdf = new File(['%PDF'], 'sec-2026.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/^pdf/i), pdf);
    await user.click(screen.getByRole('button', { name: /upload pdf/i }));

    // Kept for every company, not turned into an agreement of the admin's own.
    await waitFor(() =>
      expect(uploadTemplate).toHaveBeenCalledWith({
        name: 'SEC Construction - Sri Lanka 2026',
        layout: 'sec',
        file: pdf,
        saved: true,
      })
    );
    await waitFor(() => expect(templates).toHaveBeenCalledTimes(2));
  });

  it('changes the default heading', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: /change heading/i }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText(/^heading/i);
    expect(field.value).toBe('SEC Construction - Sri Lanka 2025');

    await user.clear(field);
    await user.type(field, 'SEC Construction - Israel 2026');
    await user.click(within(dialog).getByRole('button', { name: /save heading/i }));

    await waitFor(() => expect(renameTemplate).toHaveBeenCalledWith(5, 'SEC Construction - Israel 2026'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
