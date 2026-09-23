import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import LocalAgencyAgreements from '../pages/agreements/LocalAgencyAgreements';

const list = vi.fn();
const get = vi.fn();
const candidates = vi.fn();
const assign = vi.fn();
const update = vi.fn();

vi.mock('../lib/api', () => ({
  agreementApi: {
    list: (...args) => list(...args),
    get: (...args) => get(...args),
    candidates: (...args) => candidates(...args),
    assign: (...args) => assign(...args),
    update: (...args) => update(...args),
    fileUrl: vi.fn(),
    templateFileUrl: vi.fn(),
  },
}));

vi.mock('../lib/alert', async (importOriginal) => ({
  ...(await importOriginal()),
  alertError: vi.fn(),
  confirmAction: vi.fn(async () => true),
}));

const field = (key, kind, en) => ({ key, kind, multiline: false, label: { en, he: en + ' he', si: en + ' si' } });

const AGREEMENT = {
  id: 5,
  title: 'SEC 2026',
  agencyId: 'AG-1',
  agencyName: 'Negev Builders',
  status: 'sent_to_agency',
  sentToAgencyAt: '2026-09-21T10:00:00Z',
  candidateId: null,
  candidateName: null,
  employerSection: { key: 'employer', fields: [field('company_name', 'name', 'Manpower Company Name')] },
  employeeSection: {
    key: 'employee',
    fields: [field('employee_name', 'name', "Employee's Name"), field('passport_no', 'text', 'Passport Number')],
  },
  values: { company_name: { en: 'Negev Builders', he: 'נגב', si: 'නෙගෙව්' } },
};

const ASSIGNED = {
  ...AGREEMENT,
  candidateId: 11,
  candidateName: 'Anura Kumara',
  values: {
    ...AGREEMENT.values,
    employee_name: { en: 'Anura Kumara', he: 'אנורה קומרה', si: 'අනුරා කුමරා', auto: { he: true, si: true } },
    passport_no: { en: 'N7893266', he: 'N7893266', si: 'N7893266' },
  },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <LocalAgencyAgreements />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('a local agency assigning a candidate to an agreement it was sent', () => {
  beforeEach(() => {
    list.mockReset().mockResolvedValue({ data: [AGREEMENT] });
    get.mockReset().mockResolvedValue({ data: AGREEMENT });
    candidates.mockReset().mockResolvedValue({
      data: [
        { id: 11, name: 'Anura Kumara', nicNo: '852641746V', passportNo: 'N7893266', passed: true, passedAt: '2026-09-01T10:00:00Z' },
        { id: 12, name: 'Kamal Perera', nicNo: '881112223V', passportNo: 'N8811122', passed: true, passedAt: '2026-09-10T10:00:00Z' },
        { id: 13, name: 'Nimal Silva', nicNo: '901112223V', passportNo: 'N9011122', passed: false, passedAt: null },
        { id: 14, name: 'Sunil Dias', nicNo: '911112223V', passportNo: 'N9111122', passed: true, assignedTo: { id: 9, title: 'Other' } },
      ],
    });
    assign.mockReset().mockResolvedValue({ data: ASSIGNED, message: 'Assigned.' });
    update.mockReset().mockImplementation(async (id, { values }) => ({ data: { ...ASSIGNED, values: { ...ASSIGNED.values, ...values } } }));
  });

  it('lists the candidates as the server orders them, passed ones marked', async () => {
    const user = userEvent.setup();
    renderPage();

    // The candidates are behind the row's own button.
    const table = await screen.findByRole('table');
    await user.click(within(table).getByRole('button', { name: /assign candidate/i }));
    await screen.findByText('Anura Kumara');
    const radios = screen.getAllByRole('radio').filter((r) => r.name === 'candidate');
    expect(radios).toHaveLength(4);
    const names = radios.map((r) => r.closest('label').textContent);
    expect(names[0]).toContain('Anura Kumara');
    expect(names[0]).toContain('Passed');
    expect(names[2]).toContain('Not passed');
    // One already on another agreement cannot be picked.
    expect(radios[3].disabled).toBe(true);
    // Nobody on the agreement yet, so the one who passed first is picked already.
    expect(radios[0].checked).toBe(true);
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: /assign candidate/i }).disabled
    ).toBe(false);
  });

  it('lists the agreements sent to it in a table', async () => {
    renderPage();

    await screen.findByText('SEC 2026');
    const rows = within(screen.getAllByRole('table')[0]).getAllByRole('row');
    // A header row, then one row per agreement.
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Agreement');
    expect(rows[0].textContent).toContain('Received');
    expect(rows[1].textContent).toContain('SEC 2026');
    expect(rows[1].textContent).toContain('Negev Builders');
    expect(rows[1].textContent).toContain('No candidate yet');
    expect(rows[1].textContent).toContain('Assign candidate');
  });

  it('filters the table down to the agreements still without a candidate', async () => {
    list.mockResolvedValue({
      data: [
        { ...AGREEMENT, id: 5, title: 'SEC 2026' },
        { ...AGREEMENT, id: 6, title: 'SEC 2025', candidateId: 11, candidateName: 'Anura Kumara' },
      ],
    });
    const user = userEvent.setup();
    renderPage();

    // The agreements table is the first on the page.
    const sent = () => within(screen.getAllByRole('table')[0]).getAllByRole('row');
    await screen.findAllByText('SEC 2025');
    expect(sent()).toHaveLength(3);

    await user.selectOptions(screen.getByLabelText('Show'), 'assigned');
    expect(sent()).toHaveLength(2);
    expect(sent()[1].textContent).toContain('SEC 2025');

    await user.selectOptions(screen.getByLabelText('Show'), 'unassigned');
    expect(sent()).toHaveLength(2);
    expect(sent()[1].textContent).toContain('SEC 2026');
  });

  it('fills the employee part in three languages once a candidate is assigned', async () => {
    const user = userEvent.setup();
    renderPage();

    const table = await screen.findByRole('table');
    await user.click(within(table).getByRole('button', { name: /assign candidate/i }));
    await user.click(await screen.findByLabelText(/Anura Kumara/));
    // The dialog's own button, not the row's.
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /assign candidate/i }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(5, 11));
    await screen.findByText('Employee - Anura Kumara');
    expect(screen.getByTestId('Passport Number (si)').textContent).toBe('N7893266');
    expect(screen.getByLabelText("Employee's Name (he)").value).toBe('אנורה קומרה');

    // The Hebrew is corrected and saved.
    await user.clear(screen.getByLabelText("Employee's Name (he)"));
    await user.type(screen.getByLabelText("Employee's Name (he)"), 'אנורה');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1].values.employee_name.he).toBe('אנורה');
    // Only the employee part is sent.
    expect(update.mock.calls[0][1].values.company_name).toBeUndefined();

    // Google's own page opens with the employee's English on it.
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await user.click(screen.getByRole('button', { name: /google translate/i }));
    expect(decodeURIComponent(open.mock.calls[0][0])).toContain('Anura Kumara');
    open.mockRestore();
  });
});
