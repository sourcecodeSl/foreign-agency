import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    renderPage();

    const radios = await screen.findAllByRole('radio');
    expect(radios).toHaveLength(4);
    const names = radios.map((r) => r.closest('label').textContent);
    expect(names[0]).toContain('Anura Kumara');
    expect(names[0]).toContain('Passed');
    expect(names[2]).toContain('Not passed');
    // One already on another agreement cannot be picked.
    expect(radios[3].disabled).toBe(true);
  });

  it('fills the employee part in three languages once a candidate is assigned', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByLabelText(/Anura Kumara/));
    await user.click(screen.getByRole('button', { name: /assign candidate/i }));

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
  });
});
