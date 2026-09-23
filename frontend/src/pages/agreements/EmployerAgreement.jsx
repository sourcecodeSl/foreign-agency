import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { PageLoader } from '../../components/ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { employerAgreementApi } from '../../lib/api';
import { alertError } from '../../lib/alert';
import { formatDate } from '../candidates/shared';

/** The paper's columns, in the order it prints them: Hebrew, English, Sinhala. */
const COLUMNS = [
  { code: 'he', title: 'הסכם העסקה', dir: 'rtl' },
  { code: 'en', title: 'Employment Agreement', dir: 'ltr' },
  { code: 'si', title: 'රැකියා ගිවිසුම', dir: 'ltr' },
];

/**
 * Google Translate in its own tab, holding the English of these fields, to
 * check a filled value against and correct it here by hand.
 */
export function openGoogleTranslate(fields = [], values = {}) {
  const english = fields
    .map((field) => (values[field.key]?.en || '').trim())
    .filter(Boolean)
    .join('\n');
  const url =
    'https://translate.google.com/?sl=en&tl=si&op=translate' +
    (english ? '&text=' + encodeURIComponent(english) : '');
  window.open(url, '_blank', 'noopener');
}

/**
 * The employer part of the agreement, laid out as the paper is: one row per
 * field, each language in its own column. `onChange` makes the Hebrew and
 * Sinhala of the names and translated fields editable - numbers are the same
 * in every language; without it the table only reads. `editAll` opens every
 * cell, English and numbers too.
 */
export function EmployerTable({ section, values, onChange, editAll = false, onEnglishDone, localising = [] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] table-fixed border-collapse text-sm">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.code}
                dir={col.dir}
                lang={col.code}
                className={
                  'border border-gray-200 bg-gray-50 px-4 py-3 font-semibold text-gray-900 underline ' +
                  (col.dir === 'rtl' ? 'text-right' : 'text-left')
                }
              >
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.fields.map((field) => {
            const value = values[field.key] || {};
            return (
              <tr key={field.key}>
                {COLUMNS.map((col) => {
                  const editable = onChange && (editAll || (col.code !== 'en' && field.kind !== 'text'));
                  const auto = col.code !== 'en' && value.auto?.[col.code];
                  const label = field.label.en + ' (' + col.code + ')';
                  return (
                    <td
                      key={col.code}
                      dir={col.dir}
                      lang={col.code}
                      className={
                        'border border-gray-200 px-4 py-3 align-top ' +
                        (col.dir === 'rtl' ? 'text-right' : 'text-left')
                      }
                    >
                      <p className="text-gray-700">{field.label[col.code]}:</p>
                      {editable ? (
                        <textarea
                          aria-label={label}
                          rows={field.multiline ? 2 : 1}
                          dir={col.dir}
                          value={value[col.code] || ''}
                          onChange={(e) => onChange(field.key, col.code, e.target.value)}
                          onBlur={col.code === 'en' && onEnglishDone ? () => onEnglishDone(field.key) : undefined}
                          disabled={col.code !== 'en' && localising.includes(field.key)}
                          className={
                            'field-input mt-1 resize-none ' + (auto ? 'border-amber-300 bg-amber-50/40' : '')
                          }
                        />
                      ) : (
                        <p
                          data-testid={label}
                          className="mt-1 min-h-[1.5rem] whitespace-pre-line border-b border-gray-400 pb-1 font-medium text-gray-900"
                        >
                          {value[col.code] || ''}
                        </p>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A foreign company's employment agreement: the employer part, filled from
 * the company's own record and submitted from its login.
 *
 * The English cannot be typed here - it is the company record, changed on
 * Agency Details. The Hebrew and Sinhala come filled in their own script and
 * may be corrected; numbers stay as they are.
 */
export default function EmployerAgreement() {
  const { admin } = useAuth();
  const { toast } = useToast();
  const [draft, setDraft] = useState(null);
  const [values, setValues] = useState({});
  const [submitted, setSubmitted] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, list] = await Promise.all([employerAgreementApi.draft(), employerAgreementApi.list()]);
      setDraft(d.data);
      setValues(d.data.values || {});
      setSubmitted(list.data?.agreements || []);
    } catch (err) {
      toast(err.message || 'Could not load the agreement.', 'error');
      setDraft({ section: null, values: {}, missing: [] });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const change = (key, lang, text) =>
    setValues((prev) => ({
      ...prev,
      [key]: { ...prev[key], [lang]: text, auto: { ...prev[key]?.auto, [lang]: false } },
    }));

  const submit = async () => {
    setBusy(true);
    try {
      const { message } = await employerAgreementApi.submit(values);
      toast(message || 'Agreement submitted.');
      load();
    } catch (err) {
      alertError(err.message || 'Could not submit the agreement.', 'Not submitted');
    } finally {
      setBusy(false);
    }
  };

  if (!draft) return <PageLoader label="Loading agreement..." />;
  if (!draft.section) return null;

  const missing = draft.missing || [];
  const unchecked = Object.values(values).some((v) => v.auto?.he || v.auto?.si);

  return (
    <div className="space-y-6">
      {missing.length > 0 && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-semibold">Some company details are missing</p>
          <p className="mt-1">
            Missing: {missing.join(', ')}.{' '}
            {admin?.roleSlug === 'agency_owner' ? (
              <>
                Add them on{' '}
                <Link to="/agency/profile" className="font-medium underline">
                  Agency Details
                </Link>{' '}
                before submitting.
              </>
            ) : (
              'Ask the company owner to add them on Agency Details before submitting.'
            )}
          </p>
        </div>
      )}

      {draft.translationError && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          The address and position could not be translated ({draft.translationError}). They are spelt
          by sound instead - check them before submitting.
        </div>
      )}

      <Card>
        <CardHeader
          title="Employment Agreement - employer"
          subtitle="Filled from your company details in all three languages. Check the highlighted Hebrew and Sinhala, correct anything that reads wrong, then submit."
        />
        <EmployerTable section={draft.section} values={values} onChange={change} />
        <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-4">
          {unchecked && (
            <p className="text-xs text-amber-800">Highlighted values were filled automatically - check they read right.</p>
          )}
          <Button onClick={submit} loading={busy} disabled={missing.length > 0}>
            Submit agreement
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Submitted" subtitle="What your company has sent so far." />
        {submitted.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">Nothing submitted yet.</p>
        ) : (
          <ul>
            {submitted.map((a) => (
              <li key={a.id} className="border-b border-gray-100 px-5 py-3.5 text-sm last:border-0">
                <span className="font-medium text-gray-900">{a.values?.company_name?.en}</span>
                <span className="text-gray-500">
                  {' '}
                  · submitted {formatDate(a.submittedAt)}
                  {a.submittedBy ? ' by ' + a.submittedBy : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
