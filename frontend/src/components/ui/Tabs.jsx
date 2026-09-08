/**
 * Underlined tab bar with an optional count pill per tab.
 * tabs: [{ id, label, count }]
 */
export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex gap-6 overflow-x-auto px-5" aria-label="Tabs">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              aria-current={selected ? 'page' : undefined}
              className={
                'flex items-center gap-2 whitespace-nowrap border-b-2 py-3.5 text-sm font-medium transition ' +
                (selected
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700')
              }
            >
              {tab.label}
              {typeof tab.count === 'number' && (
                <span
                  className={
                    'rounded-full px-2 py-0.5 text-xs font-semibold ' +
                    (selected ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-600')
                  }
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
