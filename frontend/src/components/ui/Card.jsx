export function Card({ className = '', children }) {
  return (
    <div className={'rounded-xl border border-gray-200 bg-white shadow-card ' + className}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className = '', children }) {
  return <div className={'p-5 ' + className}>{children}</div>;
}

export function CardFooter({ className = '', children }) {
  return (
    <div className={'border-t border-gray-200 bg-gray-50/60 px-5 py-4 ' + className}>{children}</div>
  );
}
