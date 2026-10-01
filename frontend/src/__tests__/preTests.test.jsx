import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import PreTests from '../pages/candidates/PreTests';
import { AssignModal } from '../pages/candidates/CategoryResults';

const list = vi.fn();
const book = vi.fn();
const record = vi.fn();
const rewind = vi.fn();
const confirmAction = vi.fn();
let account;

vi.mock('../lib/api', () => ({
  preTestApi: {
    list: (...a) => list(...a),
    book: (...a) => book(...a),
    record: (...a) => record(...a),
    rewind: (...a) => rewind(...a),
  },
  jobRoleApi: {
    list: () =>
      Promise.resolve({
        data: [
          { id: 1, name: 'Tiler', active: true },
          { id: 2, name: 'Mason', active: true },
          { id: 3, name: 'Plumber', active: true },
        ],
      }),
  },
  agencyApi: { foreignOptions: () => Promise.resolve({ data: [{ id: 'AG-9100', name: 'Herzl' }] }) },
  candidateApi: { addRegistration: vi.fn() },
}));

vi.mock('../context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({ admin: account }),
}));

vi.mock('../lib/alert', async (importOriginal) => ({
  ...(await importOriginal()),
  alertError: vi.fn(),
  confirmAction: (...a) => confirmAction(...a),
}));

const row = (over) => ({
  key: '7-1',
  candidate: { id: 7, name: 'Nimal Silva', passportNo: 'N1122334', nicNo: '901234567V', blocked: false },
  agencyId: 'AG-9001',
  agencyName: 'Solidrow',
  jobRole: { id: 1, name: 'Tiler' },
  status: 'none',
  attempts: 0,
  latest: null,
  finalTest: null,
  ...over,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <PreTests />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  account = { roleSlug: 'agency_owner', agency: { id: 'AG-9001', type: 'local' } };
});

describe('Pre-tests page', () => {
  beforeEach(() => confirmAction.mockResolvedValue(true));

  it('opens on who is eligible, each with its pre-test index and no company', async () => {
    list.mockResolvedValue({
      data: {
        rows: [row({ status: 'pass', latest: { id: 5, indexNo: 'PRE-TL00001', result: 'pass' } })],
        counts: { pass: 1, pending: 0, none: 2, fail: 0, all: 3 },
      },
    });
    renderPage();

    expect(await screen.findByText('PRE-TL00001')).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ status: 'pass' }));
    expect(screen.queryByText(/final test$/i, { selector: 'th' })).not.toBeInTheDocument();
    expect(screen.queryByText(/company/i, { selector: 'td *' })).not.toBeInTheDocument();
  });

  it('issues an index, then passes it from the table', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({ data: { rows: [row()], counts: { none: 1, all: 1 } } });
    book.mockResolvedValue({ message: 'Pre-test booked for Nimal Silva in Tiler: PRE-TL00001.' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Not tested/ }));
    await user.click(await screen.findByRole('button', { name: 'Issue index' }));
    await waitFor(() => expect(book).toHaveBeenCalledWith(7, 1));

    list.mockResolvedValue({
      data: {
        rows: [row({ status: 'pending', attempts: 1, latest: { id: 5, indexNo: 'PRE-TL00001', result: 'pending' } })],
        counts: { pending: 1, all: 1 },
      },
    });
    record.mockResolvedValue({ message: 'Nimal Silva passed pre-test PRE-TL00001.' });
    await user.click(screen.getByRole('button', { name: /Waiting for result/ }));
    expect(await screen.findByRole('button', { name: 'Fail' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pass' }));

    await waitFor(() => expect(record).toHaveBeenCalledWith(7, 5, { result: 'pass' }));
    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ title: 'Mark as passed?' }));
  });

  it('rewinds an eligible candidate', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({
      data: {
        rows: [row({ status: 'pass', attempts: 1, latest: { id: 5, indexNo: 'PRE-TL00001', result: 'pass' } })],
        counts: { pass: 1, all: 1 },
      },
    });
    rewind.mockResolvedValue({ message: 'Pre-test PRE-TL00001 is waiting for its result again.' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Rewind' }));
    await waitFor(() => expect(rewind).toHaveBeenCalledWith(7, 5));

    // Nothing happens when the question is turned down.
    rewind.mockClear();
    confirmAction.mockResolvedValue(false);
    await user.click(screen.getByRole('button', { name: 'Rewind' }));
    expect(rewind).not.toHaveBeenCalled();
  });

  it('is read only for the admin side, with the agency named', async () => {
    account = { roleSlug: 'main_admin' };
    list.mockResolvedValue({ data: { rows: [row()], counts: { none: 1, all: 1 } } });
    renderPage();

    await userEvent.setup().click(await screen.findByRole('button', { name: /Not tested/ }));
    expect(await screen.findByText('Solidrow')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Issue index' })).not.toBeInTheDocument();
  });
});

describe('Assigning a company', () => {
  it('only offers the job categories passed in the pre-test', async () => {
    render(
      <ToastProvider>
        <AssignModal
          candidate={{
            id: 7,
            name: 'Nimal Silva',
            jobRoles: [{ id: 1 }, { id: 2 }],
            preTests: [
              { jobRoleId: 1, jobRole: 'Tiler', status: 'pass' },
              { jobRoleId: 2, jobRole: 'Mason', status: 'pending' },
            ],
          }}
          initialRoleIds={[1, 2]}
          onClose={() => {}}
          onSaved={() => {}}
        />
      </ToastProvider>,
    );

    const tiler = await screen.findByRole('checkbox', { name: /Tiler/ });
    const mason = screen.getByRole('checkbox', { name: /Mason/ });
    expect(tiler).toBeChecked();
    expect(tiler).toBeEnabled();
    expect(mason).not.toBeChecked();
    expect(mason).toBeDisabled();
    expect(screen.getByText('pre-test waiting')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Plumber/ })).toBeDisabled();
  });
});
