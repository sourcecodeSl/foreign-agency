import { createContext, useCallback, useContext, useState } from 'react';
import { IconCheck, IconX } from './Icons';

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const TONES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-gray-200 bg-white text-gray-800',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message, type = 'success') => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list, { id, message, type }]);
      setTimeout(() => dismiss(id), 3200);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={
              'pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ' +
              TONES[t.type]
            }
          >
            {t.type === 'success' && <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />}
            <span className="flex-1">{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <IconX className="h-4 w-4 opacity-60 hover:opacity-100" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
