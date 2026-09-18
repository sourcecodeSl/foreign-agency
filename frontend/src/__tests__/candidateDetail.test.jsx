import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import CandidateDetail from '../pages/candidates/CandidateDetail';

const upload = vi.fn();
const downloadOne = vi.fn();
const downloadAll = vi.fn();
const setPassed = vi.fn();
const updateStatus = vi.fn();
const bookTest = vi.fn();
const recordResult = vi.fn();

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

const BASE = {
  id: 1,
  name: 'Kamal Perera',
  passportNo: 'N7788990',
  mobile: '0771234567',
  email: 'kamal@example.com',
  address: '12 Temple Road, Negombo',
  status: 'draft',
  createdAt: '2026-09-08',
  registeredBy: { source: 'agency', label: 'Agency', name: 'Nadia Perera' },
};

// What the API hands back, set per test.
let candidate;
let missing;

vi.mock('../lib/api', () => ({
  candidateApi: {
    get: async () => ({ data: candidate }),
    documents: async () => ({
      data: {
        documents: [attached],
        latest: { passport_copy: attached },
        required: DOCUMENT_TYPES.map((value) => ({ value, label: value })),
        missing,
      },
    }),
    upload: (...args) => upload(...args),
    downloadOne: (...args) => downloadOne(...args),
    downloadAll: (...args) => downloadAll(...args),
    setPassed: (...args) => setPassed(...args),
    updateStatus: (...args) => updateStatus(...args),
    remove: vi.fn(),
  },
  companyApi: { list: async () => ({ data: [{ id: 5, name: 'Herzl Construction' }] }) },
  jobRoleApi: {
    list: async () => ({
      data: [
        { id: 1, name: 'Tiler' },
        { id: 2, name: 'Shuttering Carpenter' },
        { id: 3, name: 'Mason' },
      ],
    }),
  },
  testApi: {
    book: (...args) => bookTest(...args),
    result: (...args) => recordResult(...args),
  },
}));

let roleSlug = 'agency_owner';
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ admin: { roleSlug } }),
  isGlobalRole: (slug) => ['main_admin', 'auditor', 'coordinator'].includes(slug),
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

beforeEach(() => {
  upload.mockReset().mockResolvedValue({ message: 'Document uploaded.' });
  downloadOne.mockReset().mockResolvedValue('p.pdf');
  downloadAll.mockReset().mockResolvedValue('Kamal-Perera-documents.zip');
  setPassed.mockReset().mockResolvedValue({ message: 'Kamal Perera is marked as passed.' });
  updateStatus.mockReset().mockResolvedValue({ message: "Kamal Perera's profile has been submitted." });
  bookTest.mockReset().mockResolvedValue({ message: 'Booked.' });
  recordResult.mockReset().mockResolvedValue({ message: 'Recorded.' });
  // Everything except the passport copy is still outstanding.
  missing = DOCUMENT_TYPES.filter((t) => t !== 'passport_copy');
});

describe('the owning agency, once the candidate has passed', () => {
  beforeEach(() => {
    roleSlug = 'agency_owner';
    candidate = { ...BASE, poolStatus: 'passed', documentsOpen: true };
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

  it('never submits the profile itself, even with every document in', async () => {
    missing = [];
    renderDetail();

    await screen.findByText('Kamal Perera');
    expect(screen.queryByRole('switch', { name: 'Profile submitted' })).toBeNull();
    expect(screen.getByText('Not submitted')).toBeTruthy();
    expect(screen.getByText(/a coordinator checks them and submits the profile/i)).toBeTruthy();
  });

  it('cannot attach once the coordinator has submitted the profile', async () => {
    candidate = { ...candidate, status: 'submitted', documentsOpen: false };
    renderDetail();

    await screen.findByText('Kamal Perera');
    expect(screen.queryByRole('button', { name: /^attach$/i })).toBeNull();
    // The pass stays on for a submitted profile.
    expect(screen.getByRole('switch', { name: 'Passed' }).disabled).toBe(true);
  });
});

describe('the owning agency, before the candidate has passed', () => {
  beforeEach(() => {
    roleSlug = 'agency_owner';
    candidate = { ...BASE, poolStatus: 'pool', documentsOpen: false };
  });

  it('offers no way to attach until the pass is switched on', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('Kamal Perera');
    expect(screen.queryByRole('button', { name: /^attach$/i })).toBeNull();
    expect(screen.getByText(/documents are attached once the candidate has passed/i)).toBeTruthy();

    const toggle = screen.getByRole('switch', { name: 'Passed' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    await user.click(toggle);
    await waitFor(() => expect(setPassed).toHaveBeenCalledWith('1', true));
  });

  it('shows the file as blocked once the person has passed with another agency', async () => {
    candidate = { ...candidate, nicNo: '901234567V', blocked: true, blockedBy: null };
    renderDetail();

    await screen.findByText('Kamal Perera');
    expect(screen.getByText('This candidate is blocked')).toBeTruthy();
    expect(screen.getByText(/NIC 901234567V has already passed with another agency/i)).toBeTruthy();
    expect(screen.getByText('Blocked')).toBeTruthy();

    // Nothing can be done with it.
    expect(screen.getByRole('switch', { name: 'Passed' }).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /^attach$/i })).toBeNull();
  });
});

describe('a coordinator', () => {
  beforeEach(() => {
    roleSlug = 'coordinator';
    candidate = {
      ...BASE,
      poolStatus: 'passed',
      documentsOpen: true,
      registeredBy: { source: 'coordinator', label: 'Coordinator', name: 'Kasun Coordinator' },
    };
  });

  it('checks a complete file and switches the submission on', async () => {
    const user = userEvent.setup();
    missing = [];
    renderDetail();

    await screen.findByText('Kamal Perera');
    expect(screen.getByText('Added by coordinator · Kasun Coordinator')).toBeTruthy();

    // Reading, not attaching - and not switching the agency's pass.
    expect(screen.queryByRole('button', { name: /^attach$/i })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Passed' })).toBeNull();

    const submit = screen.getByRole('switch', { name: 'Profile submitted' });
    expect(submit.getAttribute('aria-checked')).toBe('false');
    expect(submit.disabled).toBe(false);

    await user.click(submit);
    await waitFor(() => expect(updateStatus).toHaveBeenCalledWith('1', 'submitted'));
  });

  it('cannot submit while documents are missing', async () => {
    renderDetail();

    await screen.findByText('Kamal Perera');
    expect(screen.getByRole('switch', { name: 'Profile submitted' }).disabled).toBe(true);
    expect(screen.getByText(/7 documents are still to be attached/i)).toBeTruthy();
  });

  it('cannot submit a candidate who has not passed', async () => {
    candidate = { ...candidate, poolStatus: 'pool', documentsOpen: false };
    missing = [];
    renderDetail();

    await screen.findByText('Kamal Perera');
    expect(screen.getByRole('switch', { name: 'Profile submitted' }).disabled).toBe(true);
    expect(screen.getByText('Only a candidate who has passed can be submitted.')).toBeTruthy();
  });

  it('switches a submitted profile off to send it back to the agency', async () => {
    const user = userEvent.setup();
    candidate = {
      ...candidate,
      status: 'submitted',
      documentsOpen: false,
      submittedAt: '2026-09-18T10:00:00Z',
      submittedBy: 'Kasun Coordinator',
    };
    missing = [];
    renderDetail();

    await screen.findByText('Kamal Perera');
    const submit = screen.getByRole('switch', { name: 'Profile submitted' });
    expect(submit.getAttribute('aria-checked')).toBe('true');

    await user.click(submit);
    await waitFor(() => expect(updateStatus).toHaveBeenCalledWith('1', 'draft'));
  });
});

describe('the auditor', () => {
  beforeEach(() => {
    roleSlug = 'auditor';
    candidate = { ...BASE, poolStatus: 'passed', documentsOpen: true };
  });

  it('reads the file but is offered no way to attach or submit', async () => {
    missing = [];
    renderDetail();
    await screen.findByText('Kamal Perera');

    expect(screen.queryByRole('button', { name: /add new/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^attach$/i })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();

    // Reading is still the whole point of the screen.
    expect(screen.getByRole('button', { name: /^download$/i })).toBeTruthy();
  });
});

// A Tiler who failed in the morning, tested as a Shuttering Carpenter the same day.
const FAILED_TILER = {
  id: 41,
  testNo: 'TST-1001',
  jobRoleId: 1,
  jobRole: 'Tiler',
  companyName: 'Herzl Construction',
  scheduledFor: '2026-09-18',
  status: 'failed',
  resultNote: 'Cutting not accurate enough',
};

describe('skill tests on one candidate file', () => {
  beforeEach(() => {
    candidate = {
      ...BASE,
      poolStatus: 'pool',
      jobRoles: [
        { id: 1, name: 'Tiler' },
        { id: 2, name: 'Shuttering Carpenter' },
      ],
      tests: [FAILED_TILER],
    };
  });

  it('lets the Main Admin book the second trade under a new test', async () => {
    roleSlug = 'main_admin';
    const user = userEvent.setup();
    renderDetail();

    // The failed attempt stays on the history, with its own number.
    expect(await screen.findByText('TST-1001')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText('Tiler, Shuttering Carpenter')).toBeTruthy();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Herzl Construction' })).toBeTruthy());
    await user.selectOptions(screen.getByLabelText(/foreign agency/i), '5');
    await user.selectOptions(screen.getByLabelText(/^job category$/i), '2');
    // A trade already failed is marked in the list.
    expect(screen.getByRole('option', { name: 'Tiler (failed before)' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /book test/i }));

    await waitFor(() => expect(bookTest).toHaveBeenCalledTimes(1));
    expect(bookTest.mock.calls[0][0]).toMatchObject({ candidateId: 1, companyId: 5, jobRoleId: 2 });
  });

  it('asks before an open test is closed by a new booking', async () => {
    roleSlug = 'main_admin';
    candidate.tests = [{ ...FAILED_TILER, status: 'scheduled', resultNote: null }];
    const user = userEvent.setup();
    renderDetail();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Herzl Construction' })).toBeTruthy());
    await user.selectOptions(screen.getByLabelText(/foreign agency/i), '5');
    await user.selectOptions(screen.getByLabelText(/^job category$/i), '2');
    await user.click(screen.getByRole('button', { name: /book test/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('TST-1001');
    await user.click(screen.getByRole('button', { name: 'Close and book' }));

    await waitFor(() => expect(bookTest).toHaveBeenCalledTimes(1));
  });

  it('shows the agency its history without booking controls', async () => {
    roleSlug = 'agency_owner';
    renderDetail();

    expect(await screen.findByText('TST-1001')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /book test/i })).toBeNull();
  });
});
