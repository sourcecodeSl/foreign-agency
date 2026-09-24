import { useCallback, useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import { PageLoader } from '../../components/ui/Spinner';
import { IconX } from '../../components/ui/Icons';

/**
 * A PDF shown inside the app, over the page, rather than in a new tab: a tab
 * opened only after the PDF has been built is taken for a pop-up and blocked.
 *
 * Any screen calls showPdf({ title, load }); `load` resolves to
 * { url, fileName, title? } with a blob URL. PdfViewerHost, mounted once in
 * the layout, draws it and lets it go when closed.
 */
const listeners = new Set();

export function showPdf(request) {
  listeners.forEach((listener) => listener(request));
}

export default function PdfViewerHost() {
  const [request, setRequest] = useState(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listeners.add(setRequest);
    return () => listeners.delete(setRequest);
  }, []);

  useEffect(() => {
    if (!request) return undefined;
    let live = true;
    let made = null;
    setFile(null);
    setError(null);
    request
      .load()
      .then((result) => {
        made = result.url;
        if (live) setFile(result);
        else URL.revokeObjectURL(result.url);
      })
      .catch((err) => live && setError(err.message || 'Could not make the PDF.'));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [request]);

  const close = useCallback(() => setRequest(null), []);

  useEffect(() => {
    if (!request) return undefined;
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [request, close]);

  if (!request) return null;

  const title = file?.title || request.title;

  const download = () => {
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.fileName || 'agreement.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-2 sm:p-6" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface shadow-xl"
      >
        <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-3">
          <p className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900">{title}</p>
          <Button size="sm" variant="secondary" onClick={download} disabled={!file}>
            Download PDF
          </Button>
          <button
            type="button"
            onClick={close}
            aria-label="Close PDF"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 bg-gray-100">
          {error ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {error}
            </p>
          ) : file ? (
            <iframe title={title} src={file.url} className="h-full w-full border-0" />
          ) : (
            <PageLoader label="Filling in the agreement..." />
          )}
        </div>
      </div>
    </div>
  );
}
