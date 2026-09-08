import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import { IconCopy, IconCheck } from './Icons';

/**
 * Writes `text` to the clipboard and flips to a "Copied" state for 2s.
 * Falls back to a hidden textarea + execCommand when the async Clipboard API
 * is unavailable (non-secure origins, older browsers).
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function CopyButton({
  value,
  label = 'Copy Details',
  copiedLabel = 'Copied!',
  variant = 'secondary',
  size = 'sm',
  onCopied,
  className = '',
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopy = async () => {
    const ok = await copyToClipboard(typeof value === 'function' ? value() : value);
    if (!ok) return;
    setCopied(true);
    onCopied?.();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      type="button"
      variant={copied ? 'success' : variant}
      size={size}
      onClick={handleCopy}
      icon={copied ? IconCheck : IconCopy}
      className={className}
    >
      {copied ? copiedLabel : label}
    </Button>
  );
}
