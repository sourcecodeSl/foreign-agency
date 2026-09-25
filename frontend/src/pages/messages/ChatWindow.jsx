import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { messagesApi } from '../../lib/api';
import { confirmAction, notify } from '../../lib/alert';
import { announceMessagesRead } from '../../lib/useUnreadMessages';
import { PageLoader } from '../../components/ui/Spinner';
import {
  IconArrowLeft,
  IconChat,
  IconChevronDown,
  IconCopy,
  IconDocument,
  IconDownload,
  IconEdit,
  IconForward,
  IconPaperclip,
  IconReply,
  IconSend,
  IconTrash,
  IconX,
} from '../../components/ui/Icons';
import { Avatar, KindLabel, Ticks } from './shared';
import { clockTime, dayLabel, fileSize, presenceLabel, sameDay } from './format';

// How often an open conversation asks what changed.
const POLL_MS = 3000;
// "typing..." is re-announced at most this often while keys are pressed.
const TYPING_PING_MS = 3000;
// Within this of the bottom, new messages keep the view pinned there.
const STICK_PX = 120;

const ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip';
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Server messages merged over what is on screen, by id, oldest first. */
function merge(current, incoming) {
  if (!incoming?.length) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => {
    // Messages still on their way sit after everything the server has.
    const pa = typeof a.id === 'string';
    const pb = typeof b.id === 'string';
    if (pa !== pb) return pa ? 1 : -1;
    return pa ? a.createdAt.localeCompare(b.createdAt) : a.id - b.id;
  });
}

// Pictures are fetched once per message with the token, then kept.
const imageCache = new Map();

function Attachment({ conversationId, message }) {
  const { attachment } = message;
  const key = conversationId + ':' + message.id;
  const [url, setUrl] = useState(() => imageCache.get(key) || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!attachment?.isImage || url || typeof message.id !== 'number') return undefined;
    let alive = true;
    messagesApi
      .fileUrl(conversationId, message.id)
      .then((blobUrl) => {
        imageCache.set(key, blobUrl);
        if (alive) setUrl(blobUrl);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [attachment?.isImage, conversationId, message.id, key, url]);

  const download = () =>
    messagesApi.download(conversationId, message.id, attachment.name).catch((e) => notify(e.message, 'error'));

  if (attachment.isImage && !failed) {
    return (
      <button
        type="button"
        onClick={() => (url ? window.open(url, '_blank', 'noopener') : null)}
        className="mb-1 block overflow-hidden rounded-lg bg-gray-200/60"
        title={attachment.name}
      >
        {url ? (
          <img src={url} alt={attachment.name} className="max-h-72 w-full max-w-xs object-cover" />
        ) : (
          <span className="flex h-40 w-60 items-center justify-center text-xs text-gray-500">Loading picture…</span>
        )}
      </button>
    );
  }

  return (
    <div className="mb-1 flex items-center gap-3 rounded-lg bg-gray-900/5 p-2.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
        <IconDocument className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900">{attachment.name}</span>
        <span className="block text-xs text-gray-500">{fileSize(attachment.size)}</span>
      </span>
      {typeof message.id === 'number' && (
        <button
          type="button"
          onClick={download}
          className="rounded-full p-2 text-gray-500 hover:bg-gray-900/10 hover:text-gray-700"
          aria-label={'Download ' + attachment.name}
        >
          <IconDownload className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function MenuButton({ icon: Icon, children, onClick, danger = false }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50 ' +
        (danger ? 'text-red-600' : 'text-gray-700')
      }
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function Bubble({ message, conversationId, isAdmin, menuOpen, onMenu, onReply, onEdit, onDelete, onForward, onJump }) {
  const out = message.outgoing;
  const live = typeof message.id === 'number' && !message.deleted;

  const copy = async () => {
    onMenu(null);
    try {
      await navigator.clipboard.writeText(message.body || '');
      notify('Copied.');
    } catch {
      notify('Could not copy that message.', 'error');
    }
  };

  return (
    <div id={'message-' + message.id} className={'group flex ' + (out ? 'justify-end' : 'justify-start')}>
      <div
        className={
          'relative max-w-[85%] rounded-2xl px-3 pb-1.5 pt-2 shadow-sm sm:max-w-[70%] ' +
          (out ? 'rounded-br-md bg-primary-100' : 'rounded-bl-md bg-surface') +
          (message.highlight ? ' ring-2 ring-amber-400' : '')
        }
      >
        {live && (
          <button
            type="button"
            onClick={() => onMenu(menuOpen ? null : message.id)}
            className={
              'absolute right-1 top-1 rounded-full p-0.5 text-gray-500 transition hover:bg-gray-900/10 ' +
              (menuOpen ? 'opacity-100' : 'opacity-0 focus:opacity-100 group-hover:opacity-100')
            }
            aria-label="Message options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <IconChevronDown className="h-4 w-4" />
          </button>
        )}

        {menuOpen && (
          <div
            role="menu"
            data-message-menu
            className={
              'absolute top-7 z-20 w-44 overflow-hidden rounded-lg border border-gray-200 bg-surface py-1 shadow-lg ' +
              (out ? 'right-0' : 'left-0')
            }
          >
            <MenuButton icon={IconReply} onClick={() => onReply(message)}>Reply</MenuButton>
            {message.body && <MenuButton icon={IconCopy} onClick={copy}>Copy</MenuButton>}
            {isAdmin && <MenuButton icon={IconForward} onClick={() => onForward(message)}>Forward</MenuButton>}
            {message.canChange && message.body && (
              <MenuButton icon={IconEdit} onClick={() => onEdit(message)}>Edit</MenuButton>
            )}
            {message.canChange && (
              <MenuButton icon={IconTrash} danger onClick={() => onDelete(message)}>Delete</MenuButton>
            )}
          </div>
        )}

        {/* The admin side sees which of them wrote; an agency's several logins are named too. */}
        {!out && message.senderName && message.senderName !== 'Admin' && (
          <p className="pr-5 text-xs font-semibold text-primary-700">{message.senderName}</p>
        )}
        {out && isAdmin && message.senderName && (
          <p className="pr-5 text-xs font-semibold text-emerald-700">{message.senderName}</p>
        )}

        {message.forwarded && !message.deleted && (
          <p className="flex items-center gap-1 pr-5 text-xs italic text-gray-500">
            <IconForward className="h-3.5 w-3.5" /> Forwarded
          </p>
        )}

        {message.replyTo && !message.deleted && (
          <button
            type="button"
            onClick={() => onJump(message.replyTo.id)}
            className="mb-1 mt-0.5 block w-full rounded-md border-l-4 border-primary-500 bg-gray-900/5 px-2 py-1 text-left"
          >
            <span className="block text-xs font-semibold text-primary-700">
              {message.replyTo.outgoing ? 'You' : message.replyTo.senderName}
            </span>
            <span className="block truncate text-xs text-gray-600">{message.replyTo.preview}</span>
          </button>
        )}

        {message.deleted ? (
          <p className="pr-14 text-sm italic text-gray-500">
            {out ? 'You deleted this message' : 'This message was deleted'}
          </p>
        ) : (
          <>
            {message.attachment && <Attachment conversationId={conversationId} message={message} />}
            {message.body && (
              <p className="whitespace-pre-wrap break-words pr-16 text-sm text-gray-900">{message.body}</p>
            )}
          </>
        )}

        <span className="float-right -mt-3.5 ml-2 flex items-center gap-1 text-[11px] leading-none text-gray-500">
          {message.edited && <span className="italic">edited</span>}
          {clockTime(message.createdAt)}
          {out && !message.deleted && <Ticks status={message.status} />}
        </span>
        <span className="clear-both block" />
      </div>
    </div>
  );
}

/**
 * One conversation, WhatsApp-style: the other end's name and whether they
 * are online at the top, the messages by day, and the box to write in.
 *
 * `isAdmin` is the admin side, which also forwards (`onForward`). `onBack`
 * returns to the list on a narrow screen; `onChange` tells the list that
 * something was sent or read.
 */
export default function ChatWindow({ conversationId, isAdmin, onBack, onForward, onChange }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');

  const [draft, setDraft] = useState('');
  const [file, setFile] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menuFor, setMenuFor] = useState(null);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const cursorRef = useRef(null);
  const stickRef = useRef(true);
  const olderRef = useRef(null);
  const lastPingRef = useRef(0);
  const tempSeq = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Opening a conversation: the latest page, then what changes every few seconds.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setMessages([]);
    setConversation(null);
    setReplyTo(null);
    setEditing(null);
    setDraft('');
    setFile(null);
    cursorRef.current = null;
    stickRef.current = true;

    const first = async () => {
      try {
        const { data } = await messagesApi.thread(conversationId);
        if (!alive) return;
        setConversation(data.conversation);
        setMessages(data.messages || []);
        setHasMore(Boolean(data.hasMore));
        cursorRef.current = data.cursor;
        announceMessagesRead();
        onChangeRef.current?.();
      } catch (e) {
        if (alive) setError(e.message || 'Could not open this conversation.');
      } finally {
        if (alive) setLoading(false);
      }
    };

    const poll = async () => {
      if (!cursorRef.current || document.hidden) return;
      try {
        const { data } = await messagesApi.thread(conversationId, { cursor: cursorRef.current });
        if (!alive) return;
        setConversation(data.conversation);
        cursorRef.current = data.cursor;
        const changed = data.messages || [];
        if (changed.length) {
          setMessages((prev) => merge(prev, changed));
          if (changed.some((m) => !m.outgoing)) {
            announceMessagesRead();
            onChangeRef.current?.();
          }
        }
      } catch {
        /* the next poll tries again */
      }
    };

    first();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [conversationId]);

  // New messages keep the view at the bottom when it was there; older ones
  // loaded above keep the reader where they were.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (olderRef.current !== null) {
      el.scrollTop = el.scrollHeight - olderRef.current;
      olderRef.current = null;
    } else if (stickRef.current) {
      scrollToBottom();
    }
  }, [messages, loading, scrollToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
  };

  const loadOlder = async () => {
    const oldest = messages.find((m) => typeof m.id === 'number');
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const { data } = await messagesApi.thread(conversationId, { before: oldest.id });
      olderRef.current = scrollRef.current ? scrollRef.current.scrollHeight - scrollRef.current.scrollTop : null;
      setMessages((prev) => merge(prev, data.messages || []));
      setHasMore(Boolean(data.hasMore));
    } catch (e) {
      notify(e.message || 'Could not load older messages.', 'error');
    } finally {
      setLoadingOlder(false);
    }
  };

  // A click anywhere else closes the message menu.
  useEffect(() => {
    if (menuFor === null) return undefined;
    const close = (e) => {
      if (!e.target.closest?.('[data-message-menu]') && !e.target.closest?.('[aria-label="Message options"]')) {
        setMenuFor(null);
      }
    };
    const onKey = (e) => e.key === 'Escape' && setMenuFor(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuFor]);

  const jumpTo = (id) => {
    const el = document.getElementById('message-' + id);
    if (!el) {
      notify('That message is further back. Load older messages to see it.', 'info');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, highlight: true } : m)));
    setTimeout(() => setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, highlight: false } : m))), 1500);
  };

  const onDraftChange = (e) => {
    setDraft(e.target.value);
    const now = Date.now();
    if (!editing && e.target.value && now - lastPingRef.current > TYPING_PING_MS) {
      lastPingRef.current = now;
      messagesApi.typing(conversationId).catch(() => {});
    }
  };

  // The box grows with what is typed, up to a few lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, [draft]);

  const pickFile = (e) => {
    const chosen = e.target.files?.[0];
    e.target.value = '';
    if (!chosen) return;
    if (chosen.size > MAX_FILE_BYTES) {
      notify('Files up to 10 MB can be sent.', 'error');
      return;
    }
    setFile(chosen);
    inputRef.current?.focus();
  };

  const cancelCompose = () => {
    setEditing(null);
    setReplyTo(null);
    setDraft('');
    setFile(null);
  };

  const submit = async () => {
    const body = draft.trim();

    if (editing) {
      if (!body) return;
      const target = editing;
      setEditing(null);
      setDraft('');
      try {
        const { data } = await messagesApi.edit(conversationId, target.id, body);
        setMessages((prev) => merge(prev, [data]));
      } catch (e) {
        notify(e.message || 'Could not edit the message.', 'error');
      }
      return;
    }

    if (!body && !file) return;

    // On screen at once with a clock; swapped for the real one when it lands.
    const tempId = 'tmp-' + ++tempSeq.current;
    const pending = {
      id: tempId,
      outgoing: true,
      body: body || null,
      attachment: file ? { name: file.name, size: file.size, isImage: false } : null,
      replyTo: replyTo
        ? { id: replyTo.id, outgoing: replyTo.outgoing, senderName: replyTo.senderName, preview: replyTo.body || replyTo.attachment?.name || '' }
        : null,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    const sending = { body, file, replyToId: replyTo?.id ?? null };

    stickRef.current = true;
    setMessages((prev) => merge(prev, [pending]));
    setDraft('');
    setFile(null);
    setReplyTo(null);

    try {
      const { data } = await messagesApi.send(conversationId, sending);
      setMessages((prev) => merge(prev.filter((m) => m.id !== tempId), [data]));
      onChangeRef.current?.();
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      // Nothing typed is lost.
      setDraft((current) => current || body);
      if (file) setFile(file);
      notify(e.message || 'The message was not sent.', 'error');
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape' && (editing || replyTo)) {
      cancelCompose();
    }
  };

  const startReply = (message) => {
    setMenuFor(null);
    setEditing(null);
    setReplyTo(message);
    inputRef.current?.focus();
  };

  const startEdit = (message) => {
    setMenuFor(null);
    setReplyTo(null);
    setFile(null);
    setEditing(message);
    setDraft(message.body || '');
    inputRef.current?.focus();
  };

  const remove = async (message) => {
    setMenuFor(null);
    const sure = await confirmAction({
      title: 'Delete this message?',
      text: 'It is deleted for everyone in this conversation.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!sure) return;
    try {
      const { data } = await messagesApi.remove(conversationId, message.id);
      setMessages((prev) => merge(prev, [data]));
    } catch (e) {
      notify(e.message || 'Could not delete the message.', 'error');
    }
  };

  const forward = (message) => {
    setMenuFor(null);
    onForward?.(message, conversationId);
  };

  const status = conversation?.typing ? 'typing…' : presenceLabel(conversation);
  const name = conversation?.name || (isAdmin ? '' : 'Admin');

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Who this is with, and whether they are there */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-surface px-3 py-2.5 sm:px-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 lg:hidden"
            aria-label="Back to conversations"
          >
            <IconArrowLeft className="h-5 w-5" />
          </button>
        )}
        <Avatar name={name} type={conversation?.type || (isAdmin ? 'local' : 'admin')} online={conversation?.online} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{name || 'Loading…'}</p>
          <p className={'truncate text-xs ' + (conversation?.typing || conversation?.online ? 'text-emerald-600' : 'text-gray-500')}>
            {status}
            {isAdmin && conversation && (
              <>
                <span className="mx-1.5 text-gray-300">|</span>
                <KindLabel conversation={conversation} />
              </>
            )}
          </p>
        </div>
      </div>

      {/* The messages, by day */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto bg-gray-100 px-3 py-4 sm:px-6"
        style={{
          backgroundImage: 'radial-gradient(rgb(var(--c-gray-300) / 0.45) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      >
        {loading ? (
          <PageLoader label="Opening the conversation…" className="py-16" />
        ) : error ? (
          <p className="mx-auto mt-10 max-w-sm rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-700">{error}</p>
        ) : (
          <div className="space-y-1.5">
            {hasMore && (
              <div className="pb-2 text-center">
                <button
                  type="button"
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50"
                >
                  {loadingOlder ? 'Loading…' : 'Load older messages'}
                </button>
              </div>
            )}

            {messages.length === 0 && (
              <div className="mx-auto mt-10 max-w-xs rounded-xl bg-surface/90 px-5 py-6 text-center shadow-sm">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary-600">
                  <IconChat className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-medium text-gray-900">No messages yet</p>
                <p className="mt-1 text-xs text-gray-500">
                  {isAdmin ? 'Say hello - only this ' + (conversation?.type === 'foreign' ? 'company' : 'agency') + ' will see it.' : 'Write to the admin here.'}
                </p>
              </div>
            )}

            {messages.map((message, i) => {
              const newDay = !sameDay(messages[i - 1]?.createdAt, message.createdAt);
              return (
                <div key={message.id}>
                  {newDay && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-lg bg-surface px-3 py-1 text-xs font-medium text-gray-600 shadow-sm">
                        {dayLabel(message.createdAt)}
                      </span>
                    </div>
                  )}
                  <Bubble
                    message={message}
                    conversationId={conversationId}
                    isAdmin={isAdmin}
                    menuOpen={menuFor === message.id}
                    onMenu={setMenuFor}
                    onReply={startReply}
                    onEdit={startEdit}
                    onDelete={remove}
                    onForward={forward}
                    onJump={jumpTo}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* What is being replied to, edited or attached */}
      {(replyTo || editing || file) && (
        <div className="flex items-center gap-3 border-t border-gray-200 bg-gray-50 px-4 py-2">
          <div className="min-w-0 flex-1 border-l-4 border-primary-500 pl-2">
            <p className="text-xs font-semibold text-primary-700">
              {editing
                ? 'Edit message'
                : replyTo
                  ? 'Replying to ' + (replyTo.outgoing ? 'yourself' : replyTo.senderName)
                  : 'Attachment'}
            </p>
            <p className="truncate text-xs text-gray-600">
              {editing
                ? editing.body
                : replyTo
                  ? replyTo.body || replyTo.attachment?.name
                  : file.name + ' · ' + fileSize(file.size)}
            </p>
            {file && (replyTo || editing) && (
              <p className="truncate text-xs text-gray-500">📎 {file.name}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => (editing || replyTo ? cancelCompose() : setFile(null))}
            className="rounded-full p-1 text-gray-500 hover:bg-gray-200"
            aria-label="Cancel"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* The box to write in */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 border-t border-gray-200 bg-surface px-3 py-2.5"
      >
        <input ref={fileRef} type="file" accept={ACCEPT} onChange={pickFile} className="hidden" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={Boolean(editing) || loading || Boolean(error)}
          className="mb-0.5 rounded-full p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-40"
          aria-label="Attach a file"
          title="Attach a file"
        >
          <IconPaperclip className="h-5 w-5" />
        </button>
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={onDraftChange}
          onKeyDown={onKeyDown}
          disabled={loading || Boolean(error)}
          maxLength={4000}
          placeholder="Type a message"
          aria-label="Message"
          className="max-h-36 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-gray-300 bg-gray-50 px-4 py-2 text-sm
                     text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:bg-surface focus:outline-none
                     focus:ring-4 focus:ring-primary-100"
        />
        <button
          type="submit"
          disabled={(!draft.trim() && !file) || loading || Boolean(error)}
          className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white
                     transition hover:bg-emerald-600 disabled:opacity-40"
          aria-label={editing ? 'Save the edit' : 'Send'}
        >
          <IconSend className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
