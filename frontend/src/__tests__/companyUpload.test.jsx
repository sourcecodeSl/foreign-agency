import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import Agreements from '../pages/agreements/Agreements';

const templates = vi.fn();
const list = vi.fn();
const uploadTemplate = vi.fn();
const setSalary = vi.fn();
const uploadMark = vi.fn();
const updateDetails = vi.fn();
const create = vi.fn();
const removeTemplate = vi.fn();
const sendToAdmin = vi.fn();

vi.mock('../lib/api', () => ({
  agreementApi: {
    templates: (...args) => templates(...args),
    list: (...args) => list(...args),
    uploadTemplate: (...args) => uploadTemplate(...args),
    setSalary: (...args) => setSalary(...args),
    uploadMark: (...args) => uploadMark(...args),
    updateDetails: (...args) => updateDetails(...args),
    create: (...args) => create(...args),
    removeTemplate: (...args) => removeTemplate(...args),
    sendToAdmin: (...args) => sendToAdmin(...args),
  },
}));

vi.mock('../context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({ admin: { roleSlug: 'agency_owner', agency: { id: 'AG-1', type: 'foreign' } } }),
}));

vi.mock('../lib/alert', async (importOriginal) => ({
  ...(await importOriginal()),
  alertError: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/agreements']}>
      <ToastProvider>
        <Routes>
          <Route path="/agreements" element={<Agreements />} />
          <Route path="/agreements/:id" element={<p>opened agreement</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("a foreign company's upload, then its salary", () => {
  beforeEach(() => {
    // jsdom has no object URLs; the picture previews need them.
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    templates.mockReset().mockResolvedValue({
      data: { templates: [], layouts: [{ key: 'sec', name: 'SEC Construction 2025' }] },
    });
    list.mockReset().mockResolvedValue({ data: [] });
    uploadTemplate.mockReset().mockResolvedValue({ data: { id: 3, name: 'SEC 2026', agreementId: 9 }, message: 'Uploaded.' });
    setSalary.mockReset().mockResolvedValue({ data: {}, message: 'Salary saved.' });
    uploadMark.mockReset().mockResolvedValue({ data: {} });
    updateDetails.mockReset().mockResolvedValue({ data: {} });
    create.mockReset().mockResolvedValue({ data: { id: 12, title: 'Kamal 2026' }, message: 'Agreement created.' });
    removeTemplate.mockReset();
    sendToAdmin.mockReset().mockResolvedValue({ data: {}, message: 'Agreement sent to the admin.' });
  });

  it('uploads first, then saves the salary, listing the agreement all along', async () => {
    const user = userEvent.setup();
    renderPage();

    const save = await screen.findByRole('button', { name: /^save$/i });
    // Nothing to put a salary on until the PDF is in.
    expect(save.disabled).toBe(true);

    await user.type(screen.getByLabelText(/^name/i), 'SEC 2026');
    await user.upload(screen.getByLabelText(/^pdf/i), new File(['%PDF'], 'agreement.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: /upload/i }));

    await screen.findByText(/SEC 2026 uploaded/);
    // It is an agreement already, so the list is read again at once.
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));

    await user.type(screen.getByLabelText(/monthly salary/i), '7,512.40');
    const seal = new File(['png'], 'seal.png', { type: 'image/png' });
    const signature = new File(['jpg'], 'signature.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Company seal'), seal);
    await user.upload(screen.getByLabelText('Signature'), signature);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(setSalary).toHaveBeenCalledWith(9, 7512.4));
    // The seal and the signature go on the same agreement.
    expect(uploadMark).toHaveBeenCalledWith(9, 'seal', seal);
    expect(uploadMark).toHaveBeenCalledWith(9, 'signature', signature);
    // Saved, it stays on this page: the list is read again and the form is ready for the next one.
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    expect(screen.queryByText('opened agreement')).toBeNull();
    expect(screen.getByLabelText(/monthly salary/i).value).toBe('');
    expect(screen.getByRole('button', { name: /^save$/i }).disabled).toBe(true);
  });

  it('edits a sent agreement from a card: its name, salary, seal and signature', async () => {
    list.mockResolvedValue({
      data: [
        { id: 1, title: 'Draft one', status: 'draft', updatedAt: '2026-09-22', marks: {} },
        { id: 2, title: 'sec', status: 'sent_to_agency', sentToAdminAt: '2026-09-21', salaryNis: '6247.67', marks: { seal: true } },
      ],
    });
    const user = userEvent.setup();
    renderPage();

    // Every agreement can be edited, sent or not.
    const edits = await screen.findAllByRole('button', { name: /^edit$/i });
    expect(edits).toHaveLength(2);

    await user.click(edits[1]);
    const dialog = await screen.findByRole('dialog', { name: 'Edit sec' });
    expect(dialog.textContent).toContain('Already sent');
    expect(within(dialog).getByLabelText('Name').value).toBe('sec');
    expect(within(dialog).getByLabelText('Monthly salary (NIS)').value).toBe('6247.67');

    await user.clear(within(dialog).getByLabelText('Monthly salary (NIS)'));
    await user.type(within(dialog).getByLabelText('Monthly salary (NIS)'), '7,000');
    const signature = new File(['png'], 'signature.png', { type: 'image/png' });
    await user.upload(within(dialog).getByLabelText('Signature'), signature);
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }));

    // Only what changed is sent; the list reads again and the card closes.
    await waitFor(() => expect(updateDetails).toHaveBeenCalledWith(2, { salary: 7000 }));
    expect(uploadMark).toHaveBeenCalledWith(2, 'signature', signature);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('asks again for a salary that is not a number', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText(/^name/i), 'SEC 2026');
    await user.upload(screen.getByLabelText(/^pdf/i), new File(['%PDF'], 'agreement.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: /upload/i }));
    await screen.findByText(/SEC 2026 uploaded/);

    await user.type(screen.getByLabelText(/monthly salary/i), 'six thousand');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText(/Enter the monthly salary in NIS/)).toBeTruthy();
    expect(setSalary).not.toHaveBeenCalled();
  });

  it('starts from a saved PDF instead of a new upload, never both', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText(/^name/i), 'Kamal 2026');
    await user.click(screen.getByLabelText('Use a saved PDF'));
    // Only one of the two is picked at a time, and the new upload is gone.
    expect(screen.getByLabelText('Upload a new PDF').checked).toBe(false);
    expect(screen.queryByLabelText(/^pdf$/i)).toBeNull();

    // Save the PDF used every time; it stays for later agreements.
    uploadTemplate.mockResolvedValue({ data: { id: 5, name: 'standard', saved: true }, message: 'standard saved.' });
    templates.mockResolvedValue({
      data: {
        templates: [{ id: 5, name: 'standard', layout: 'sec', saved: true }],
        layouts: [{ key: 'sec', name: 'SEC Construction 2025' }],
      },
    });
    const pdf = new File(['%PDF'], 'standard.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('PDF to save'), pdf);
    await user.click(screen.getByRole('button', { name: /save pdf/i }));
    await waitFor(() =>
      expect(uploadTemplate).toHaveBeenCalledWith({ name: 'standard', layout: 'sec', file: pdf, saved: true })
    );
    expect((await screen.findByLabelText('Saved PDF')).value).toBe('5');

    // Once started, the server lists it among the company's agreements.
    list.mockResolvedValue({
      data: [{ id: 12, title: 'Kamal 2026', status: 'draft', updatedAt: '2026-09-24T10:00:00Z' }],
    });
    await user.click(screen.getByRole('button', { name: /use saved pdf/i }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(5, 'Kamal 2026'));
    expect(await screen.findByText(/Kamal 2026 started/)).toBeTruthy();
    // It shows in Your agreements straight away, without a reload.
    expect(await screen.findByText('Kamal 2026')).toBeTruthy();
    expect(uploadTemplate).toHaveBeenCalledTimes(1);
  });

  it('sends a draft to the admin straight from its card', async () => {
    list.mockResolvedValue({
      data: [
        { id: 1, title: 'seccc', status: 'draft', updatedAt: '2026-09-22', marks: {} },
        { id: 2, title: 'sec', status: 'sent_to_agency', sentToAdminAt: '2026-09-21', marks: {} },
      ],
    });
    const user = userEvent.setup();
    renderPage();

    // Only the draft can still be sent.
    const sends = await screen.findAllByRole('button', { name: /send to admin/i });
    expect(sends).toHaveLength(1);

    await user.click(sends[0]);
    await user.click(await screen.findByRole('button', { name: /^send$/i }));

    await waitFor(() => expect(sendToAdmin).toHaveBeenCalledWith(1));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});
