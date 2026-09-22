import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import AgreementEditor from '../pages/agreements/AgreementEditor';

const getAgreement = vi.fn();
const updateAgreement = vi.fn();
const translate = vi.fn();

vi.mock('../lib/api', () => ({
  agreementApi: {
    get: (...args) => getAgreement(...args),
    update: (...args) => updateAgreement(...args),
    translate: (...args) => translate(...args),
    templateFileUrl: vi.fn(),
  },
}));

const field = (key, kind, en, he, si) => ({ key, kind, multiline: false, label: { en, he, si } });

const AGREEMENT = {
  id: 3,
  templateId: 1,
  title: 'Kamal Perera',
  values: {},
  template: {
    name: 'SEC Construction 2025',
    sections: [
      {
        key: 'employee',
        title: { en: 'Employee', he: 'העובד', si: 'සේවකයා' },
        fields: [
          field('passport_no', 'text', 'Passport Number', "מס' דרכון", 'ගමන් බලපත්‍ර අංකය'),
          field('vocation', 'translate', 'Vocation (preamble)', 'מקצוע', 'වෘත්තිය'),
        ],
      },
    ],
  },
};

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/agreements/3']}>
      <ToastProvider>
        <Routes>
          <Route path="/agreements/:id" element={<AgreementEditor />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

const box = (label, lang) => screen.getByLabelText(label + ' (' + lang + ')');

describe('filling an agreement in three languages', () => {
  beforeEach(() => {
    getAgreement.mockReset().mockResolvedValue({ data: AGREEMENT });
    updateAgreement.mockReset().mockImplementation(async (id, payload) => ({
      data: { ...AGREEMENT, title: payload.title, values: payload.values },
      message: 'Agreement saved.',
    }));
    translate.mockReset().mockResolvedValue({ data: { he: ['רַצָף'], si: ['ටයිල් කරන්නා'] } });
  });

  it('copies a number into Hebrew and Sinhala exactly as typed', async () => {
    const user = userEvent.setup();
    renderEditor();

    await screen.findByText('Passport Number');
    await user.type(box('Passport Number', 'English'), 'N7788990');

    expect(box('Passport Number', 'עברית').value).toBe('N7788990');
    expect(box('Passport Number', 'සිංහල').value).toBe('N7788990');
    // Numbers never go to the translation service.
    await user.tab();
    expect(translate).not.toHaveBeenCalled();
  });

  it('translates words when the English is left, and marks them for checking', async () => {
    const user = userEvent.setup();
    renderEditor();

    await screen.findByText('Vocation (preamble)');
    await user.type(box('Vocation (preamble)', 'English'), 'Tiler');
    await user.tab();

    await waitFor(() => expect(translate).toHaveBeenCalledWith(['Tiler']));
    await waitFor(() => expect(box('Vocation (preamble)', 'עברית').value).toBe('רַצָף'));
    expect(box('Vocation (preamble)', 'සිංහල').value).toBe('ටයිල් කරන්නා');
    expect(screen.getAllByText('Check')).toHaveLength(2);
    expect(screen.getByText('2 translations to check')).toBeTruthy();

    // Someone reads the Sinhala and says it is right.
    await user.click(screen.getAllByRole('button', { name: /reads right/i })[1]);
    expect(screen.getByText('1 translation to check')).toBeTruthy();

    // Leaving the English again, unchanged, does not translate twice.
    await user.click(box('Vocation (preamble)', 'English'));
    await user.tab();
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it('saves every language, with what is still to check', async () => {
    const user = userEvent.setup();
    renderEditor();

    await screen.findByText('Vocation (preamble)');
    await user.type(box('Vocation (preamble)', 'English'), 'Tiler');
    await user.tab();
    await waitFor(() => expect(box('Vocation (preamble)', 'עברית').value).toBe('רַצָף'));

    // A person corrects the Hebrew by hand: it is no longer a guess.
    await user.clear(box('Vocation (preamble)', 'עברית'));
    await user.type(box('Vocation (preamble)', 'עברית'), 'רצף');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(updateAgreement).toHaveBeenCalledTimes(1));
    const { values } = updateAgreement.mock.calls[0][1];
    expect(values.vocation).toMatchObject({
      en: 'Tiler',
      he: 'רצף',
      si: 'ටයිල් කරන්නා',
      auto: { he: false, si: true },
    });
  });
});
