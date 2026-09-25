import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { messagesApi } from '../../lib/api';
import { notify } from '../../lib/alert';
import { IconForward, IconSearch } from '../../components/ui/Icons';
import { Avatar } from './shared';
import { SIDES, countriesOf, filterConversations } from './ConversationList';

/**
 * The admin side sends a copy of one message on to any number of agencies
 * or companies. The copy only says "Forwarded" - never who first sent it.
 * It opens on the agencies, where a company's message usually goes.
 */
export default function ForwardModal({ forwarding, conversations, onClose, onDone }) {
  const [side, setSide] = useState('local');
  const [country, setCountry] = useState('');
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (forwarding) {
      setChosen(new Set());
      setSearch('');
      setCountry('');
      setSide('local');
    }
  }, [forwarding]);

  const from = forwarding?.conversationId;
  const message = forwarding?.message;
  const others = conversations.filter((c) => c.id !== from);
  const shown = filterConversations(others, { side, country, search }).sort((a, b) => a.name.localeCompare(b.name));
  const allShownChosen = shown.length > 0 && shown.every((c) => chosen.has(c.id));

  const toggle = (id) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setChosen((prev) => {
      const next = new Set(prev);
      for (const c of shown) (allShownChosen ? next.delete(c.id) : next.add(c.id));
      return next;
    });

  const send = async () => {
    setBusy(true);
    try {
      const res = await messagesApi.forward(from, message.id, [...chosen]);
      notify(res.message || 'Forwarded.');
      onDone?.();
      onClose();
    } catch (e) {
      notify(e.message || 'Could not forward the message.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(forwarding)}
      onClose={onClose}
      title="Forward message"
      subtitle={message ? message.body || message.attachment?.name || '' : ''}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={IconForward} onClick={send} disabled={chosen.size === 0} loading={busy}>
            Forward{chosen.size > 0 ? ' to ' + chosen.size : ''}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1" role="tablist">
        {SIDES.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={side === tab.key}
            onClick={() => setSide(tab.key)}
            className={
              'rounded-md px-3 py-1.5 text-sm font-semibold ' +
              (side === tab.key ? 'bg-surface text-gray-900 shadow-sm' : 'text-gray-600')
            }
          >
            {tab.label}
            {' '}({others.filter((c) => c.type === tab.key && chosen.has(c.id)).length})
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search who to forward to"
            className="w-full rounded-lg border border-gray-300 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-primary-500
                       focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary-100"
          />
        </div>
        {side === 'foreign' && (
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Country"
            className="rounded-lg border border-gray-300 bg-surface px-2 py-2 text-sm text-gray-900"
          >
            <option value="">All countries</option>
            {countriesOf(others).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {shown.length > 0 && (
        <label className="mt-3 flex items-center gap-2 px-1 text-xs font-medium text-gray-600">
          <input type="checkbox" checked={allShownChosen} onChange={toggleAll} className="h-4 w-4 rounded" />
          Select all shown
        </label>
      )}

      <ul className="mt-2 max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
        {shown.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-gray-500">Nobody to show.</li>
        ) : (
          shown.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={chosen.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="h-4 w-4 rounded"
                />
                <Avatar name={c.name} type={c.type} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900">{c.name}</span>
                  <span className="block text-xs text-gray-500">
                    {c.type === 'foreign' ? c.country || 'Company' : 'Local agency'}
                  </span>
                </span>
              </label>
            </li>
          ))
        )}
      </ul>
    </Modal>
  );
}
