import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NotificationBell, { timeAgo } from '../components/layout/NotificationBell';

const list = vi.fn();
const dismiss = vi.fn();
vi.mock('../lib/api', () => ({
  notificationsApi: { list: (...args) => list(...args), dismiss: (...args) => dismiss(...args) },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ admin: { id: 1 } }),
}));

const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

const ITEMS = [
  {
    id: 'agency-pending-AG-1048',
    tone: 'warning',
    title: 'evoo is awaiting approval',
    body: 'New agency registration. Contact: hirusha perera.',
    at: minutesAgo(5),
    link: '/agencies',
  },
  {
    id: 'candidate-new-2',
    tone: 'neutral',
    title: 'New candidate: visal theekshana',
    body: 'Registered by evoo.',
    at: minutesAgo(180),
    link: '/candidates/2',
  },
];

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>
  );
}

describe('notification bell', () => {
  beforeEach(() => {
    localStorage.clear();
    list.mockReset().mockResolvedValue({ data: ITEMS });
    dismiss.mockReset().mockResolvedValue({ data: {} });
  });

  it('shows a card of notifications while the pointer is over the bell', async () => {
    const user = userEvent.setup();
    renderBell();

    // The badge counts what is on the card.
    const bell = await screen.findByRole('button', { name: /notifications \(2\)/i });
    expect(within(bell).getByText('2')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.hover(bell);

    const card = await screen.findByRole('dialog', { name: /notifications/i });
    expect(within(card).getByText('evoo is awaiting approval')).toBeTruthy();
    expect(within(card).getByText('5 min ago')).toBeTruthy();
    expect(within(card).getByText('2 new')).toBeTruthy();
    expect(
      within(card).getByRole('link', { name: /visal theekshana/i }).getAttribute('href')
    ).toBe('/candidates/2');

    await user.unhover(bell);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Only looked at, not opened: both are still counted.
    expect(screen.getByRole('button', { name: /notifications \(2\)/i })).toBeTruthy();
  });

  it('takes a notification off the bell once it is opened', async () => {
    const user = userEvent.setup();
    renderBell();

    const bell = await screen.findByRole('button', { name: /notifications \(2\)/i });
    await user.click(bell);
    const card = await screen.findByRole('dialog', { name: /notifications/i });
    await user.click(within(card).getByRole('link', { name: /visal theekshana/i }));

    expect(dismiss).toHaveBeenCalledWith('candidate-new-2');
    // One left, and the opened one is gone from the card.
    const after = screen.getByRole('button', { name: /notifications \(1\)/i });
    await user.click(after);
    const reopened = await screen.findByRole('dialog', { name: /notifications/i });
    expect(within(reopened).queryByText(/visal theekshana/i)).toBeNull();
    expect(within(reopened).getByText('evoo is awaiting approval')).toBeTruthy();
  });

  it('says so when there is nothing to show', async () => {
    list.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    renderBell();

    await user.hover(screen.getByRole('button', { name: /^notifications$/i }));

    expect(await screen.findByText(/all caught up/i)).toBeTruthy();
  });
});

describe('timeAgo', () => {
  it('reads like a person would say it', () => {
    const now = Date.now();
    expect(timeAgo(new Date(now - 20 * 1000).toISOString(), now)).toBe('Just now');
    expect(timeAgo(new Date(now - 3 * 3600 * 1000).toISOString(), now)).toBe('3 h ago');
    expect(timeAgo(new Date(now - 2 * 86400 * 1000).toISOString(), now)).toBe('2 days ago');
  });
});
