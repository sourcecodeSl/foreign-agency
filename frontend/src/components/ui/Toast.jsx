import { createContext, useContext } from 'react';
import { notify } from '../../lib/alert';

/**
 * `toast(message, type)` for every screen, shown through SweetAlert2 (see
 * lib/alert): success and info as a corner toast, an error as a dialog that
 * stays until it is read.
 *
 * The provider stays so screens and tests keep their shape; the value never
 * changes, so effects that depend on `toast` do not re-run.
 */
const VALUE = { toast: notify };

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }) {
  return <ToastContext.Provider value={VALUE}>{children}</ToastContext.Provider>;
}
