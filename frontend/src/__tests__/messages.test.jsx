import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Messages from '../pages/messages/Messages';

const conversations = vi.fn();
const thread = vi.fn();
const send = vi.fn();
const forward = vi.fn();
let account;

vi.mock('../lib/api', () => ({
  messagesApi: {
    conversations: (...a) => conversations(...a),
    thread: (...a) => thread(...a),
    send: (...a) => send(...a),
    forward: (...a) => forward(...a),
    typing: () => Promise.resolve({}),
    unread: () => Promise.resolve({ data: { total: 0 } }),
  },
}));

vi.mock('../context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({ admin: account }),
}));

vi.mock('../lib/alert', async (importOriginal) => ({
  ...(await importOriginal()),
  notify: vi.fn(),
}));

const LIST = [
  { id: 'AG-1', name: 'Tel Aviv Builders', type: 'foreign', country: 'Israel', unread: 2, online: true,
    lastMessage: { preview: 'Test dates', outgoing: false, at: new Date().toISOString() } },
  { id: 'AG-2', name: 'Dubai Towers', type: 'foreign', country: 'UAE', unread: 0, online: false, lastMessage: null },
  { id: 'AG-3', name: 'Skyline Manpower', type: 'local', country: 'Sri Lanka', unread: 0, online: false, lastMessage: null },
];

const message = (over) => ({
  id: 1, outgoing: false, senderName: 'Owner', body: 'Hello admin', attachment: null, replyTo: null,
  forwarded: false, edited: false, deleted: false, canChange: false, status: null,
  createdAt: new Date().toISOString(), ...over,
});

function renderAt(path = '/messages') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Messages />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  conversations.mockResolvedValue({ data: LIST });
  thread.mockResolvedValue({
    data: {
      conversation: { id: 'AG-1', name: 'Tel Aviv Builders', type: 'foreign', country: 'Israel', online: true, typing: false },
      messages: [message(), message({ id: 2, outgoing: true, body: 'Noted', status: 'read', canChange: true, senderName: 'Main Admin' })],
      hasMore: false,
      cursor: new Date().toISOString(),
    },
  });
});

describe('Messages - admin side', () => {
  beforeEach(() => {
    account = { roleSlug: 'main_admin', name: 'Main Admin' };
  });

  it('keeps companies and agencies on separate sides and filters companies by country', async () => {
    const user = userEvent.setup();
    renderAt();

    expect(await screen.findByText('Tel Aviv Builders')).toBeInTheDocument();
    expect(screen.getByText('Dubai Towers')).toBeInTheDocument();
    expect(screen.queryByText('Skyline Manpower')).not.toBeInTheDocument();
    expect(screen.getByLabelText('2 unread')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Country'), 'UAE');
    expect(screen.queryByText('Tel Aviv Builders')).not.toBeInTheDocument();
    expect(screen.getByText('Dubai Towers')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Agencies/ }));
    expect(screen.getByText('Skyline Manpower')).toBeInTheDocument();
    expect(screen.queryByLabelText('Country')).not.toBeInTheDocument();
  });

  it('opens a conversation with read ticks and sends a message', async () => {
    const user = userEvent.setup();
    send.mockResolvedValue({ data: message({ id: 3, outgoing: true, body: 'Thanks', status: 'sent', senderName: 'Main Admin' }) });
    renderAt('/messages?c=AG-1');

    expect(await screen.findByText('Hello admin')).toBeInTheDocument();
    expect(screen.getByText('online')).toBeInTheDocument();
    expect(screen.getByLabelText('Read')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Message'), 'Thanks{Enter}');
    await waitFor(() => expect(send).toHaveBeenCalledWith('AG-1', { body: 'Thanks', file: null, replyToId: null }));
    expect(await screen.findByText('Thanks')).toBeInTheDocument();
  });

  it('forwards a company message to chosen agencies', async () => {
    const user = userEvent.setup();
    forward.mockResolvedValue({ message: 'Forwarded to 1 conversation.' });
    renderAt('/messages?c=AG-1');

    await screen.findByText('Hello admin');
    await user.click(screen.getAllByLabelText('Message options')[0]);
    await user.click(screen.getByRole('menuitem', { name: 'Forward' }));

    const dialog = screen.getByRole('dialog', { name: 'Forward message' });
    await user.click(within(dialog).getByLabelText(/Skyline Manpower/));
    await user.click(within(dialog).getByRole('button', { name: 'Forward to 1' }));

    await waitFor(() => expect(forward).toHaveBeenCalledWith('AG-1', 1, ['AG-3']));
  });
});

describe('Messages - agency side', () => {
  it('shows only the conversation with the admin, with no list and no forwarding', async () => {
    const user = userEvent.setup();
    account = { roleSlug: 'agency_owner', agency: { id: 'AG-3', type: 'local', name: 'Skyline Manpower' } };
    thread.mockResolvedValue({
      data: {
        conversation: { id: 'AG-3', name: 'Admin', type: 'admin', online: false, lastSeenAt: null, typing: false },
        messages: [message({ senderName: 'Admin', body: 'Welcome' })],
        hasMore: false,
        cursor: new Date().toISOString(),
      },
    });
    renderAt();

    expect(await screen.findByText('Welcome')).toBeInTheDocument();
    expect(thread).toHaveBeenCalledWith('AG-3');
    expect(conversations).not.toHaveBeenCalled();
    expect(screen.queryByRole('tab', { name: /Companies/ })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Message options'));
    expect(screen.queryByRole('menuitem', { name: 'Forward' })).not.toBeInTheDocument();
  });
});
