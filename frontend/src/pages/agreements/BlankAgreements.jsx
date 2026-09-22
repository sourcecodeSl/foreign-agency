import { useEffect, useState } from 'react';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { PageLoader } from '../../components/ui/Spinner';
import { agreementApi } from '../../lib/api';
import { alertError } from '../../lib/alert';
import { formatDate } from '../candidates/shared';

/** A file name from a template's name. */
const fileNameFor = (template) =>
  template.originalName || (template.name || 'agreement').replace(/[\\/:*?"<>|]+/g, '-') + '.pdf';

/** The admin's blank agreements, for a foreign company to download and fill. */
export default function BlankAgreements() {
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    let active = true;
    agreementApi
      .blankTemplates()
      .then(({ data }) => active && setTemplates(data?.templates || []))
      .catch((err) => active && setError(err.message || 'Could not load the blank agreements.'));
    return () => {
      active = false;
    };
  }, []);

  const download = async (template) => {
    setDownloading(template.id);
    try {
      const blob = await agreementApi.blankTemplateBlob(template.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileNameFor(template);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      alertError(err.message || 'Could not download the PDF.', 'PDF not downloaded');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card>
      <CardHeader title="Blank agreements" subtitle="Agreements from the Main Admin, to download and fill in." />
      {error ? (
        <CardBody>
          <p className="text-sm text-red-600">{error}</p>
        </CardBody>
      ) : !templates ? (
        <PageLoader label="Loading blank agreements..." className="py-8" />
      ) : templates.length === 0 ? (
        <CardBody>
          <p className="text-sm text-gray-500">No blank agreements have been uploaded yet.</p>
        </CardBody>
      ) : (
        <ul className="divide-y divide-gray-200">
          {templates.map((template) => (
            <li key={template.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{template.name}</p>
                <p className="text-xs text-gray-500">
                  {template.layoutName}
                  {template.uploadedAt && ' · ' + formatDate(template.uploadedAt)}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                loading={downloading === template.id}
                onClick={() => download(template)}
              >
                Download PDF
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
