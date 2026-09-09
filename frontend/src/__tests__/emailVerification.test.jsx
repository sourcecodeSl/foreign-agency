import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../components/ui/Toast';
import EmailVerification from '../pages/auth/EmailVerification';

// Runs against the mock adapter, which holds the rows in memory and really
// drops one on removeEmail - so the listing after the delete is the proof.
function renderPage() {
  return render(
    <ToastProvider>
      <EmailVerification />
    </ToastProvider>
  );
}

describe('email confirmations', () => {
  let firstEmail;

  beforeEach(async () => {
    const { verificationApi } = await import('../lib/api');
    const { data } = await verificationApi.listEmails();
    firstEmail = data[0].email;
  });

  it('confirms before removing a request', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText(firstEmail, {}, { timeout: 4000 });
    const before = screen.getAllByRole('button', { name: /delete/i }).length;

    await user.click(screen.getAllByRole('button', { name: /delete/i })[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText(firstEmail).length).toBeGreaterThan(0);

    // Cancelling leaves the row where it is.
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(firstEmail)).toBeTruthy();

    // Confirming drops it from the list.
    await user.click(screen.getAllByRole('button', { name: /delete/i })[0]);
    const again = await screen.findByRole('dialog');
    await user.click(within(again).getByRole('button', { name: /remove request/i }));

    // The list reloads after the delete, so wait for it to settle rather than
    // reading the table mid-refresh.
    await waitFor(
      () => {
        expect(screen.queryByText(firstEmail)).toBeNull();
        expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(before - 1);
      },
      { timeout: 4000 }
    );
  });

  it('offers delete on every row, verified or not', async () => {
    renderPage();

    await screen.findByText(firstEmail, {}, { timeout: 4000 });

    const deletes = screen.getAllByRole('button', { name: /delete/i });
    const resends = screen.getAllByRole('button', { name: /resend/i });

    // A verified row loses "Mark Verified" but still keeps Delete.
    expect(deletes.length).toBe(resends.length);
  });
});
