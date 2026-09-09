import { useEffect } from 'react';
import { IconX } from './Icons';

/**
 * Centred dialog on a dimmed backdrop.
 *
 * Closes on Escape and on a backdrop click, and locks the page behind it so
 * the list underneath cannot scroll away while the dialog is open.
 */
export default function Modal({ open, title, subtitle, onClose, footer, children }) {
  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // The backdrop closes on click, so a click inside must not bubble.
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200
                   bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-gray-900">{title}</h3>
            {subtitle && <p className="mt-0.5 truncate text-sm text-gray-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="shrink-0 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-gray-50/60 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
