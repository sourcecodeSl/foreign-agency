import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { messagesApi } from '../../lib/api';
import { IconChat } from '../../components/ui/Icons';
import ChatWindow from './ChatWindow';
import ConversationList from './ConversationList';
import ForwardModal from './ForwardModal';

// How often the admin's list asks again: new messages, ticks, who is online.
const LIST_POLL_MS = 5000;

// Tall enough to fill the screen under the top bar, like a chat app.
const FRAME =
  'flex h-[calc(100vh-8.5rem)] min-h-[28rem] overflow-hidden rounded-xl border border-gray-200 bg-surface shadow-card';

/**
 * The admin side: companies and agencies on the left, the conversation
 * picked on the right. On a narrow screen one shows at a time. The open
 * conversation is in the address (?c=AG-1001), which is where the bell's
 * links land.
 */
function AdminMessages() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('c');

  const [conversations, setConversations] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [side, setSide] = useState('foreign');
  const [country, setCountry] = useState('');
  const [search, setSearch] = useState('');
  const [forwarding, setForwarding] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await messagesApi.conversations();
      setConversations(Array.isArray(data) ? data : []);
    } catch {
      /* the last list stays; the next poll tries again */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Opened from a link: show the side it is on.
  const selected = conversations.find((c) => c.id === selectedId);
  useEffect(() => {
    if (selected) setSide(selected.type);
    // Only when the conversation itself changes, not on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const select = (id) => setParams(id ? { c: id } : {});

  return (
    <div className={FRAME}>
      <aside
        className={
          'w-full shrink-0 border-r border-gray-200 lg:flex lg:w-[22rem] lg:flex-col ' +
          (selectedId ? 'hidden' : 'flex flex-col')
        }
      >
        <ConversationList
          conversations={conversations}
          loaded={loaded}
          selectedId={selectedId}
          onSelect={select}
          side={side}
          onSide={setSide}
          country={country}
          onCountry={setCountry}
          search={search}
          onSearch={setSearch}
        />
      </aside>

      <section className={'min-w-0 flex-1 ' + (selectedId ? 'flex flex-col' : 'hidden lg:flex lg:flex-col')}>
        {selectedId ? (
          <ChatWindow
            key={selectedId}
            conversationId={selectedId}
            isAdmin
            onBack={() => select(null)}
            onForward={(message, conversationId) => setForwarding({ message, conversationId })}
            onChange={load}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary-600">
              <IconChat className="h-8 w-8" />
            </span>
            <p className="mt-4 text-base font-semibold text-gray-900">Choose a conversation</p>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              Each company and agency sees only its own conversation with you. Forward a message to share it
              with others - they will not see who sent it first.
            </p>
          </div>
        )}
      </section>

      <ForwardModal
        forwarding={forwarding}
        conversations={conversations}
        onClose={() => setForwarding(null)}
        onDone={load}
      />
    </div>
  );
}

/** An agency or company: one conversation, with the admin. */
function AgencyMessages({ agencyId }) {
  return (
    <div className={FRAME}>
      <section className="flex min-w-0 flex-1 flex-col">
        <ChatWindow conversationId={agencyId} isAdmin={false} />
      </section>
    </div>
  );
}

export default function Messages() {
  const { admin } = useAuth();
  const agencyId = admin?.agency?.id ?? admin?.agencyId;

  return admin?.agency ? <AgencyMessages agencyId={agencyId} /> : <AdminMessages />;
}
