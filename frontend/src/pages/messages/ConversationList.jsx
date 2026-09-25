import { IconSearch } from '../../components/ui/Icons';
import { Avatar, Ticks } from './shared';
import { listTime } from './format';

/** The two sides of the admin's list: foreign companies, and local agencies. */
export const SIDES = [
  { key: 'foreign', label: 'Companies' },
  { key: 'local', label: 'Agencies' },
];

/** Every country a company in the list is in, for the dropdown. */
export function countriesOf(conversations) {
  return [...new Set(conversations.filter((c) => c.type === 'foreign').map((c) => c.country).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
}

/** One side, narrowed by country and by what was typed. */
export function filterConversations(conversations, { side, country, search }) {
  const q = (search || '').trim().toLowerCase();
  return conversations.filter(
    (c) =>
      c.type === side &&
      (side !== 'foreign' || !country || c.country === country) &&
      (!q || c.name.toLowerCase().includes(q) || (c.code || '').toLowerCase().includes(q)),
  );
}

/** The latest conversation first; the ones never written to, by name. */
function byLatest(a, b) {
  const ta = a.lastMessage?.at ? new Date(a.lastMessage.at).getTime() : 0;
  const tb = b.lastMessage?.at ? new Date(b.lastMessage.at).getTime() : 0;
  return tb - ta || a.name.localeCompare(b.name);
}

function Row({ conversation, selected, onSelect }) {
  const last = conversation.lastMessage;
  const unread = conversation.unread > 0;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-current={selected ? 'true' : undefined}
        className={
          'flex w-full items-center gap-3 px-3 py-2.5 text-left transition ' +
          (selected ? 'bg-primary-50' : 'hover:bg-gray-50')
        }
      >
        <Avatar name={conversation.name} type={conversation.type} online={conversation.online} />
        <span className="min-w-0 flex-1 border-b border-gray-100 pb-2.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold text-gray-900">{conversation.name}</span>
            <span className={'shrink-0 text-xs ' + (unread ? 'font-semibold text-emerald-600' : 'text-gray-400')}>
              {listTime(last?.at)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1 text-xs text-gray-500">
              {conversation.typing ? (
                <span className="font-medium text-emerald-600">typing…</span>
              ) : last ? (
                <>
                  {last.outgoing && !last.deleted && <Ticks status={last.status} className="h-3.5 w-3.5 shrink-0" />}
                  <span className={'truncate ' + (last.deleted ? 'italic' : '')}>{last.preview}</span>
                </>
              ) : (
                <span className="truncate text-gray-400">
                  {conversation.type === 'foreign' ? conversation.country || 'Company' : 'Local agency'} · no messages yet
                </span>
              )}
            </span>
            {unread && (
              <span
                className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-white"
                aria-label={conversation.unread + ' unread'}
              >
                {conversation.unread > 99 ? '99+' : conversation.unread}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * The admin side's list of conversations, companies and agencies kept apart
 * on two tabs. Companies narrow to one country from the dropdown.
 */
export default function ConversationList({
  conversations,
  loaded,
  selectedId,
  onSelect,
  side,
  onSide,
  country,
  onCountry,
  search,
  onSearch,
}) {
  const countries = countriesOf(conversations);
  const shown = filterConversations(conversations, { side, country, search }).sort(byLatest);
  const unreadOn = (key) =>
    conversations.filter((c) => c.type === key).reduce((sum, c) => sum + (c.unread || 0), 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The two sides */}
      <div className="grid grid-cols-2 gap-1 border-b border-gray-200 p-2" role="tablist" aria-label="Conversations">
        {SIDES.map((tab) => {
          const unread = unreadOn(tab.key);
          const active = side === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSide(tab.key)}
              className={
                'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ' +
                (active ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100')
              }
            >
              {tab.label}
              {unread > 0 && (
                <span
                  className={
                    'flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] ' +
                    (active ? 'bg-white text-primary-700' : 'bg-emerald-500 text-white')
                  }
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Narrowing */}
      <div className="space-y-2 border-b border-gray-200 p-2">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={side === 'foreign' ? 'Search companies' : 'Search agencies'}
            aria-label="Search conversations"
            className="w-full rounded-lg border border-gray-300 bg-gray-50 py-2 pl-9 pr-3 text-sm placeholder:text-gray-400
                       focus:border-primary-500 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary-100"
          />
        </div>
        {side === 'foreign' && (
          <select
            value={country}
            onChange={(e) => onCountry(e.target.value)}
            aria-label="Country"
            className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900
                       focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
          >
            <option value="">All countries</option>
            {countries.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {!loaded ? (
          <li className="px-4 py-10 text-center text-sm text-gray-500">Loading conversations…</li>
        ) : shown.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-gray-500">
            {side === 'foreign' ? 'No companies' : 'No agencies'}
            {country && side === 'foreign' ? ' in ' + country : ''}
            {search ? ' match "' + search + '"' : ''}.
          </li>
        ) : (
          shown.map((c) => <Row key={c.id} conversation={c} selected={c.id === selectedId} onSelect={onSelect} />)
        )}
      </ul>
    </div>
  );
}
