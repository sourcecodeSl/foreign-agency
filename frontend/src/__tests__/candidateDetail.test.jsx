import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import CandidateDetail from '../pages/candidates/CandidateDetail';

const upload = vi.fn();
const downloadOne = vi.fn();
const downloadAll = vi.fn();

const DOCUMENT_TYPES = [
  'passport_copy',
  'police_report',
  'medical',
  'affidavit_english',
  'affidavit_sinhala',
  'family_affidavit_english',
  'family_affidavit_sinhala',
  'agreement',
];

const attached = {
  id: 10,
  candidateId: 1,
  type: 'passport_copy',
  typeLabel: 'Passport Copy',
  originalName: 'p.pdf',
  sizeBytes: 2048,
  available: true,
  uploadedAt: '2026-09-08',
  isLatest: true,
};

vi.mock('../lib/api', () => ({
  candidateApi: {
    get: async () => ({
      data: {
        id: 1,
        name: 'Kamal Perera',
        passportNo: 'N7788990',
        mobile: '0771234567',
        email: 'kamal@example.com',
        address: '12 Temple Road, Negombo',
        status: 'draft',
        createdAt: '2026-09-08',
      },
    }),
    documents: async () => ({
      data: {
        documents: [attached],
        latest: { passport_copy: attached },
        required: DOCUMENT_TYPES.map((value) => ({ value, label: value })),
        // Everything except the passport copy is still outstanding.
        missing: DOCUMENT_TYPES.filter((t) => t !== 'passport_copy'),
      },
    }),
    upload: (...args) => upload(...args),
    downloadOne: (...args) => downloadOne(...args),
    downloadAll: (...args) => downloadAll(...args),
    remove: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

let roleSlug = 'agency_owner';
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ admin: { roleSlug } }),
  isGlobalRole: (slug) => ['main_admin', 'auditor'].includes(slug),
}));

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/candidates/1']}>
      <ToastProvider>
        <Routes>
          <Route path="/candidates/:id" element={<CandidateDetail />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('the owning agency', () => {
  beforeEach(() => {
    roleSlug = 'agency_owner';
    upload.mockReset().mockResolvedValue({ message: 'Document uploaded.' });
    downloadOne.mockReset().mockResolvedValue('p.pdf');
    downloadAll.mockReset().mockResolvedValue('Kamal-Perera-documents.zip');
  });

  it('can attach, download and archive its own files', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('Kamal Perera');

    // One type attached, seven still to come.
    expect(screen.getByRole('button', { name: /add new/i })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^attach$/i })).toHaveLength(7);

    await user.click(screen.getByRole('button', { name: /^download$/i }));
    await waitFor(() => expect(downloadOne).toHaveBeenCalledWith('1', 10, 'p.pdf'));

    await user.click(screen.getByRole('button', { name: /download all/i }));
    await waitFor(() => expect(downloadAll).toHaveBeenCalled());
  });

  it('sends a picked file straight to the upload endpoint', async () => {
    const user = userEvent.setup();
    const { container } = renderDetail();

    await screen.findByText('Kamal Perera');

    // The inputs are hidden behind the Attach buttons, so the file goes in
    // the way the browser delivers it rather than through a click.
    const input = container.querySelector('input[type="file"]');
    await user.upload(input, new File(['x'], 'medical.pdf', { type: 'application/pdf' }));

    await waitFor(() => expect(upload).toHaveBeenCalled());
    expect(upload.mock.calls[0][2].name).toBe('medical.pdf');
  });
});

describe('a cross-agency reviewer', () => {
  beforeEach(() => {
    roleSlug = 'main_admin';
    upload.mockReset();
    downloadOne.mockReset().mockResolvedValue('p.pdf');
    downloadAll.mockReset().mockResolvedValue('zip');
  });

  it('reads the file but is offered no way to attach to it', async () => {
    renderDetail();
    await screen.findByText('Kamal Perera');

    expect(screen.queryByRole('button', { name: /add new/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^attach$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /submit for review/i })).toBeNull();

    // Reading is still the whole point of the screen.
    expect(screen.getByRole('button', { name: /^download$/i })).toBeTruthy();
  });
});
