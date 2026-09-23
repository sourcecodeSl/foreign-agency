import { useEffect, useState } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import Input from '../../components/ui/Input';
import DateInput from '../../components/ui/DateInput';
import { candidateApi } from '../../lib/api';
import { alertError } from '../../lib/alert';
import { formatDate } from './shared';

const STATE = {
  not_applied: { label: 'Not applied', tone: 'gray' },
  applied: { label: 'Applied', tone: 'amber' },
  received: { label: 'Received', tone: 'green' },
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Where the police report has got to, filled in beside the upload.
 *
 * Applied needs the reference number. Received needs the date it was issued
 * too: a police report is good for six months from that day, and once less
 * than two months are left the file says so - every time it is opened, and
 * without ever stopping the details being saved.
 */
export default function PoliceReport({ candidate, readOnly, onChanged }) {
  const { toast } = useToast();
  const report = candidate.policeReport || { status: 'not_applied' };

  const [form, setForm] = useState({
    status: report.status || 'not_applied',
    referenceNo: report.referenceNo || '',
    issuedDate: report.issuedDate || '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // The file may be reloaded by something else on the page.
  useEffect(() => {
    setForm({
      status: report.status || 'not_applied',
      referenceNo: report.referenceNo || '',
      issuedDate: report.issuedDate || '',
    });
  }, [report.status, report.referenceNo, report.issuedDate]);

  const state = STATE[report.status] || STATE.not_applied;

  const change = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const save = async (e) => {
    e.preventDefault();

    const found = {};
    if (form.status !== 'not_applied' && !form.referenceNo.trim())
      found.referenceNo = 'Enter the police report reference number.';
    if (form.status === 'received' && !form.issuedDate)
      found.issuedDate = 'Enter the date the police report was issued.';
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const res = await candidateApi.savePoliceReport(candidate.id, {
        status: form.status,
        referenceNo: form.referenceNo.trim() || undefined,
        issuedDate: form.status === 'received' ? form.issuedDate : undefined,
      });
      toast(res.message || 'Police report saved.');
      onChanged?.();
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      alertError(err.message || 'Could not save the police report.', 'Police report not saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Police report"
        subtitle={
          report.status === 'received' && report.expiresOn
            ? 'Issued ' +
              formatDate(report.issuedDate) +
              ', valid until ' +
              formatDate(report.expiresOn) +
              ' (six months from the date of issue).'
            : 'A police report is valid for six months from the day it is issued.'
        }
        action={
          <Badge tone={state.tone} dot>
            {state.label}
          </Badge>
        }
      />

      {/* Shown whether or not anything can be edited here. */}
      {report.warning && (
        <p
          role="alert"
          className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-800"
        >
          {report.warning} A new report should be applied for.
        </p>
      )}

      {readOnly ? (
        <dl className="grid gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-3">
          {[
            ['Reference No', report.referenceNo || '—'],
            ['Issued', report.issuedDate ? formatDate(report.issuedDate) : '—'],
            ['Valid until', report.expiresOn ? formatDate(report.expiresOn) : '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
              <dd className="mt-1 text-sm text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <form
          onSubmit={save}
          noValidate
          className="grid items-start gap-4 px-5 py-4 sm:grid-cols-4"
        >
          <div>
            <label htmlFor="policeStatus" className="field-label">
              Status
            </label>
            <select
              id="policeStatus"
              name="status"
              value={form.status}
              onChange={change}
              className="field-input"
            >
              <option value="not_applied">Not applied</option>
              <option value="applied">Applied</option>
              <option value="received">Police report received</option>
            </select>
          </div>

          {form.status !== 'not_applied' && (
            <Input
              label="Reference No"
              name="referenceNo"
              required
              placeholder="PR/2026/8891"
              maxLength={60}
              value={form.referenceNo}
              onChange={change}
              error={errors.referenceNo}
            />
          )}

          {form.status === 'received' && (
            <DateInput
              label="Issued date"
              name="issuedDate"
              required
              max={today()}
              value={form.issuedDate}
              onChange={change}
              error={errors.issuedDate}
            />
          )}

          <div className="sm:pt-[1.625rem]">
            <Button type="submit" loading={saving} className="w-full sm:w-auto">
              Save
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
