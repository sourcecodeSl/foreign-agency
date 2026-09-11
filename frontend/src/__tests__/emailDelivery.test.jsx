import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../components/ui/Toast';
import EmailDelivery, { hintFor } from '../pages/system/EmailDelivery';

const mailStatus = vi.fn();
const sendTestMail = vi.fn();
const clearConfigCache = vi.fn();

vi.mock('../lib/api', () => ({
  systemApi: {
    mailStatus: (...args) => mailStatus(...args),
    sendTestMail: (...args) => sendTestMail(...args),
    clearConfigCache: (...args) => clearConfigCache(...args),
  },
}));

const STATUS = {
  envFile: '/home/solidrow/foreign-agency/.env',
  envFileExists: true,
  configCached: false,
  mailer: 'smtp',
  host: 'smtp.gmail.com',
  port: 587,
  fromAddress: 'admin@example.com',
  usernameSet: true,
  passwordSet: true,
  configured: true,
  testRecipient: 'admin@example.com',
  envLines: [],
  recentLog: [],
};

function renderPage() {
  return render(
    <ToastProvider>
      <EmailDelivery />
    </ToastProvider>
  );
}

describe('email delivery check', () => {
  beforeEach(() => {
    mailStatus.mockReset().mockResolvedValue({ data: STATUS });
    sendTestMail.mockReset();
    clearConfigCache.mockReset();
  });

  it('shows which settings file the server reads', async () => {
    renderPage();

    // Shown in the summary rows and again above the MAIL_ line table.
    expect((await screen.findAllByText('/home/solidrow/foreign-agency/.env')).length).toBeGreaterThan(0);
    expect(screen.getByText(/email is set up/i)).toBeTruthy();
  });

  it('says exactly what is missing when email is not set up', async () => {
    mailStatus.mockResolvedValue({
      data: { ...STATUS, mailer: 'log', usernameSet: false, passwordSet: false, configured: false },
    });
    renderPage();

    expect(await screen.findByText(/MAIL_MAILER is "log"/)).toBeTruthy();
    expect(screen.getByText(/MAIL_PASSWORD is empty/)).toBeTruthy();
  });

  it('points at the lines that a later line overrides', async () => {
    mailStatus.mockResolvedValue({
      data: {
        ...STATUS,
        mailer: 'log',
        configured: false,
        envLines: [
          { line: 12, key: 'MAIL_MAILER', value: 'smtp', status: 'overridden', overriddenBy: 58 },
          { line: 13, key: 'MAIL_PASSWORD', value: '(set - hidden)', status: 'overridden', overriddenBy: 60 },
          { line: 58, key: 'MAIL_MAILER', value: 'log', status: 'used', overriddenBy: null },
          { line: 60, key: 'MAIL_PASSWORD', value: '(empty)', status: 'used', overriddenBy: null },
        ],
      },
    });
    renderPage();

    expect(await screen.findByText(/lines 12, 13/)).toBeTruthy();

    const table = screen.getByRole('region', { name: /MAIL_ lines/i });
    const ignored = within(table).getByText('12').closest('tr');
    expect(within(ignored).getByText(/ignored - line 58 wins/i)).toBeTruthy();
    const used = within(table).getByText('58').closest('tr');
    expect(within(used).getByText('Used')).toBeTruthy();
    expect(within(used).getByText('log')).toBeTruthy();
  });

  it('shows the recent email log entries', async () => {
    mailStatus.mockResolvedValue({
      data: {
        ...STATUS,
        recentLog: ['[2026-09-11 10:00:02] production.ERROR: [mail] failed to admin@example.com: Connection refused'],
      },
    });
    renderPage();

    const log = await screen.findByRole('region', { name: /recent email and sms log/i });
    expect(within(log).getByText(/connection refused/i)).toBeTruthy();
  });

  it('offers to clear cached settings, then checks again', async () => {
    const user = userEvent.setup();
    mailStatus
      .mockResolvedValueOnce({ data: { ...STATUS, configCached: true } })
      .mockResolvedValue({ data: STATUS });
    clearConfigCache.mockResolvedValue({ message: 'Cached settings cleared.' });
    renderPage();

    expect(await screen.findByText(/settings are cached/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /clear cached settings/i }));

    await waitFor(() => expect(clearConfigCache).toHaveBeenCalled());
    expect(await screen.findByText(/email is set up/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /clear cached settings/i })).toBeNull();
  });

  it('shows the real error and what to do when the test email fails', async () => {
    const user = userEvent.setup();
    sendTestMail.mockResolvedValue({
      data: {
        delivered: false,
        to: 'admin@example.com',
        error:
          'Connection could not be established with host "smtp.gmail.com:587": stream_socket_client(): Unable to connect to smtp.gmail.com:587 (Connection refused)',
      },
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /send test email/i }));

    expect(await screen.findByText(/could not be sent/i)).toBeTruthy();
    expect(screen.getByText(/connection refused\)$/i)).toBeTruthy();
    expect(screen.getByText(/cannot reach gmail/i)).toBeTruthy();
  });
});

describe('hintFor', () => {
  it('points each kind of failure at its fix', () => {
    expect(hintFor('535-5.7.8 Username and Password not accepted')).toMatch(/app password/i);
    expect(hintFor('Connection refused')).toMatch(/cannot reach gmail/i);
    expect(hintFor('Email is not set up: MAIL_MAILER is "log"')).toMatch(/\.env/);
  });
});
