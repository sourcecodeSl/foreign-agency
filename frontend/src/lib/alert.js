/**
 * Every message the app shows goes through SweetAlert2, so they all look and
 * behave the same:
 *
 *  - success and info  -> a toast in the corner that clears itself;
 *  - errors            -> a dialog that stays until it is read;
 *  - confirmations     -> a dialog that answers yes or no;
 *  - work in progress  -> a loading dialog nothing can be clicked behind.
 */
import Swal from 'sweetalert2';

const PRIMARY = '#1d41f5'; // primary-600
const DANGER = '#dc2626'; // red-600
const MUTED = '#6b7280'; // gray-500

const Dialog = Swal.mixin({
  confirmButtonColor: PRIMARY,
  cancelButtonColor: MUTED,
  reverseButtons: true,
});

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  showCloseButton: true,
  timer: 3500,
  timerProgressBar: true,
  didOpen: (popup) => {
    popup.addEventListener('mouseenter', Swal.stopTimer);
    popup.addEventListener('mouseleave', Swal.resumeTimer);
  },
});

/** For values placed inside an `html` message: names, emails, numbers. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

/** A success or info toast; an error opens a dialog instead, so it is not missed. */
export function notify(message, type = 'success') {
  if (type === 'error') return alertError(message);
  return Toast.fire({ icon: type === 'info' ? 'info' : 'success', title: message });
}

export function alertError(message, title = 'Something went wrong') {
  return Dialog.fire({ icon: 'error', title, text: message });
}

export function alertInfo(message, title, icon = 'info') {
  return Dialog.fire({ icon, title, text: message });
}

/**
 * Asks before something that cannot be taken back. Resolves true only when
 * the confirm button was pressed.
 */
export async function confirmAction({
  title,
  text,
  html,
  confirmText = 'Yes',
  cancelText = 'Cancel',
  danger = false,
  icon = 'warning',
}) {
  const result = await Dialog.fire({
    title,
    text,
    html,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    confirmButtonColor: danger ? DANGER : PRIMARY,
    // A slip of the Enter key should not delete anything.
    focusCancel: danger,
  });

  return result.isConfirmed;
}

/*
 * The loading dialog. Nested calls share one dialog, which closes when the
 * last of them is done - and only if it is still the loading dialog: a
 * message that replaced it in the meantime is left on screen.
 */
let loadingDepth = 0;

export function showLoading(title = 'Please wait...') {
  loadingDepth += 1;
  if (loadingDepth > 1) return;

  Dialog.fire({
    title,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading(),
  });
}

export function hideLoading() {
  loadingDepth = Math.max(0, loadingDepth - 1);
  // isLoading is false once another message has replaced the loading dialog.
  if (loadingDepth === 0 && Swal.isLoading()) Swal.close();
}

/** Runs `work` behind the loading dialog, closing it however the work ends. */
export async function withLoading(title, work) {
  showLoading(title);
  try {
    return await work();
  } finally {
    hideLoading();
  }
}
