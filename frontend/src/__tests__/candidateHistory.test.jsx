import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import CandidateHistory from '../pages/candidates/CandidateHistory';

const listAgencies = vi.fn();
const listCandidates = vi.fn();
const history = vi.fn();
const buildHistoryPdf = vi.fn();

vi.mock('../lib/historyPdf', () => ({ buildHistoryPdf: (...args) => buildHistoryPdf(...args) }));

vi.mock('../lib/api', () => ({
  agencyApi: { list: (...args) => listAgencies(...args) },
  candidateApi: {
    list: (...args) => listCandidates(...args),
    candidateHistory: (...args) => history(...args),
  },
}));

const REPORT = {
  candidate: {
    id: 7,
    name: 'Nimal Silva',
    fatherName: 'Sunil Silva',
    passportNo: 'N1122334',
    passportExpiry: '2031-05-01',
    nicNo: '901234567V',
    dateOfBirth: '1990-04-22',
    age: 36,
    address: '9 Lake Road, Kandy',
    jobRoles: [{ id: 1, name: 'Tiler' }, { id: 3, name: 'Mason' }],
    poolStatus: 'passed',
    passedAt: '2026-09-20',
    profession: 'Mason',
    status: 'draft',
    policeReport: { status: 'received', referenceNo: 'PR/1', issuedDate: '2026-09-01', expiresOn: '2027-03-01' },
    registeredBy: { source: 'agency', label: 'Agency', name: 'Nadia Perera' },
    createdAt: '2026-09-01',
  },
  agency: { id: 'AG-9001', name: 'Solidrow' },
  generatedAt: '2026-09-25T10:00:00Z',
  assignments: [
    {
      id: 3,
      company: { id: 'AG-9100', name: 'Herzl Construction', country: 'Israel' },
      assignedAt: '2026-09-02',
      assignedBy: 'Kasun Coordinator',
      state: 'ended',
      ended: { at: '2026-09-10', by: 'Kasun Coordinator', reason: 'new_test', label: 'Sent for a new test' },
      tests: [{ jobRole: 'Tiler', testIndexNo: 'TL00001', result: 'fail', resultAt: '2026-09-08', recordedBy: 'Avi Cohen', note: 'Uneven joints' }],
    },
    {
      id: 4,
      company: { id: 'AG-9101', name: 'Negev Builders', country: 'Israel' },
      assignedAt: '2026-09-10',
      assignedBy: 'Kasun Coordinator',
      state: 'passed',
      ended: null,
      tests: [{ jobRole: 'Mason', testIndexNo: 'MS00001', result: 'pass', resultAt: '2026-09-20', recordedBy: 'Dana Levi', note: null }],
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <CandidateHistory />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('the candidate history report', () => {
  beforeEach(() => {
    listAgencies.mockReset().mockImplementation(async ({ type }) => ({
      data: type === 'local' ? [{ id: 'AG-9001', name: 'Solidrow' }] : [{ id: 'AG-9100', name: 'Herzl Construction' }],
    }));
    listCandidates.mockReset().mockResolvedValue({
      data: [{ id: 7, name: 'Nimal Silva', passportNo: 'N1122334', nicNo: '901234567V', agencyId: 'AG-9001', agencyName: 'Solidrow' }],
    });
    history.mockReset().mockResolvedValue({ data: REPORT });
    buildHistoryPdf.mockReset().mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    // jsdom has no object URLs; the PDF is shown from one.
    URL.createObjectURL = vi.fn(() => 'blob:history');
    URL.revokeObjectURL = vi.fn();
  });

  it('picks an agency, then the candidate, and shows every company, test and result', async () => {
    const user = userEvent.setup();
    renderPage();

    const agency = screen.getByLabelText('Local agency');
    await waitFor(() => expect(within(agency).getByRole('option', { name: 'Solidrow' })).toBeTruthy());
    await user.selectOptions(agency, 'AG-9001');
    await waitFor(() => expect(listCandidates).toHaveBeenCalledWith({ agencyId: 'AG-9001' }));

    const candidate = screen.getByLabelText('Candidate');
    await waitFor(() => expect(within(candidate).getByRole('option', { name: /Nimal Silva/ })).toBeTruthy());
    await user.selectOptions(candidate, '7');
    await waitFor(() => expect(history).toHaveBeenCalledWith('7'));

    // Shown as a PDF made from the report, in the page.
    expect(await screen.findByText('Candidate history - Nimal Silva')).toBeTruthy();
    await waitFor(() => expect(buildHistoryPdf).toHaveBeenCalledWith(REPORT));
    const frame = await screen.findByTitle('Candidate history report');
    expect(frame.getAttribute('src')).toBe('blob:history');

    // Downloaded as a file named for the candidate.
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await user.click(screen.getByRole('button', { name: /download pdf/i }));
    expect(click).toHaveBeenCalled();
    expect(click.mock.contexts[0].download).toBe('History - Nimal Silva.pdf');
    click.mockRestore();

    // Printed from the frame it is shown in.
    const print = vi.fn();
    Object.defineProperty(frame, 'contentWindow', { value: { focus: vi.fn(), print } });
    await user.click(screen.getByRole('button', { name: /^print$/i }));
    expect(print).toHaveBeenCalled();
  });

  it('finds the candidate through a foreign company and its agencies', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText('Find by'), 'company');
    const company = screen.getByLabelText('Foreign company');
    await waitFor(() => expect(within(company).getByRole('option', { name: 'Herzl Construction' })).toBeTruthy());
    await user.selectOptions(company, 'AG-9100');

    await waitFor(() => expect(listCandidates).toHaveBeenCalledWith({ agencyId: 'all', companyAgencyId: 'AG-9100' }));
    // The agencies that sent it somebody, to narrow by.
    const agency = screen.getByLabelText('Local agency');
    await waitFor(() => expect(within(agency).getByRole('option', { name: 'Solidrow' })).toBeTruthy());
    await user.selectOptions(agency, 'AG-9001');

    await user.selectOptions(screen.getByLabelText('Candidate'), '7');
    expect(await screen.findByText('Candidate history - Nimal Silva')).toBeTruthy();
  });
});
