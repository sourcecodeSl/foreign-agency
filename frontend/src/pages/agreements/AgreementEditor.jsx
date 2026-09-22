import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { PageLoader } from '../../components/ui/Spinner';
import { IconCheck, IconRefresh } from '../../components/ui/Icons';
import { agreementApi } from '../../lib/api';
import { alertError } from '../../lib/alert';
import { openTemplatePdf } from './Agreements';
import CompanyAgreement from './CompanyAgreement';

/** The three languages the agreement is printed in, in the order the screen shows them. */
const LANGS = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'he', name: 'עברית', dir: 'rtl' },
  { code: 'si', name: 'සිංහල', dir: 'ltr' },
];

const EMPTY = { en: '', he: '', si: '', auto: { he: false, si: false } };

const valueOf = (values, key) => ({ ...EMPTY, ...(values[key] || {}), auto: { ...EMPTY.auto, ...(values[key]?.auto || {}) } });

/**
 * One field, in all three languages.
 *
 * English is what is typed. A name or a number is copied into Hebrew and
 * Sinhala as it stands; words are translated when the English field is left.
 * A translated value keeps an amber "Check" until someone edits it or says it
 * reads right - the service is good, but it is not a person.
 */
function FieldRow({ field, value, onChange, onEnglishDone, translating }) {
  const Tag = field.multiline ? 'textarea' : 'input';
  const type = field.kind === 'date' ? 'date' : 'text';

  return (
    <div className="grid gap-3 border-b border-gray-100 px-5 py-4 last:border-0 lg:grid-cols-[14rem_1fr_1fr_1fr]">
      <div>
        <p className="text-sm font-medium text-gray-900">{field.label.en}</p>
        <p className="text-xs text-gray-500" dir="rtl" lang="he">
          {field.label.he}
        </p>
        <p className="text-xs text-gray-500" lang="si">
          {field.label.si}
        </p>
        <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-400">
          {field.kind === 'translate' ? 'Translated' : 'Copied as written'}
        </p>
      </div>

      {LANGS.map((lang) => {
        const auto = lang.code !== 'en' && value.auto[lang.code];
        const id = field.key + '-' + lang.code;
        return (
          <div key={lang.code}>
            <label htmlFor={id} className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-500">
              {lang.name}
              {auto && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                  Check
                </span>
              )}
              {lang.code !== 'en' && translating && (
                <span className="text-[10px] text-gray-400">translating...</span>
              )}
            </label>
            <Tag
              id={id}
              aria-label={field.label.en + ' (' + lang.name + ')'}
              type={Tag === 'input' ? (lang.code === 'en' ? type : 'text') : undefined}
              rows={field.multiline ? 2 : undefined}
              dir={lang.dir}
              lang={lang.code}
              value={value[lang.code]}
              onChange={(e) => onChange(field, lang.code, e.target.value)}
              onBlur={lang.code === 'en' ? () => onEnglishDone(field) : undefined}
              className={
                'field-input ' +
                (field.multiline ? 'resize-none ' : '') +
                (auto ? 'border-amber-300 bg-amber-50/40 ' : '')
              }
            />
            {auto && (
              <button
                type="button"
                onClick={() => onChange(field, lang.code, value[lang.code], { confirm: true })}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 hover:text-amber-900"
              >
                <IconCheck className="h-3 w-3" />
                Reads right
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Filling one agreement, section by section, in English, Hebrew and Sinhala. */
export default function AgreementEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [agreement, setAgreement] = useState(null);
  const [title, setTitle] = useState('');
  const [values, setValues] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState({}); // field key => true
  // The English each field was last translated from, so leaving a field
  // without changing it does not send it again.
  const translatedFrom = useRef({});
  // One "translation is not set up" message per visit is enough.
  const warnedOffline = useRef(false);

  const load = useCallback(async () => {
    try {
      const { data } = await agreementApi.get(id);
      setAgreement(data);
      setTitle(data.title);
      setValues(data.values || {});
      translatedFrom.current = Object.fromEntries(
        Object.entries(data.values || {}).map(([key, v]) => [key, v.en])
      );
      setDirty(false);
    } catch (err) {
      toast(err.message || 'Could not load the agreement.', 'error');
      navigate('/agreements');
    }
  }, [id, navigate, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const sections = agreement?.template?.sections || [];
  const translateFields = useMemo(
    () => sections.flatMap((s) => s.fields).filter((f) => f.kind === 'translate'),
    [sections]
  );

  const unchecked = Object.values(values).reduce(
    (n, v) => n + (v.auto?.he ? 1 : 0) + (v.auto?.si ? 1 : 0),
    0
  );

  const change = (field, lang, text, { confirm = false } = {}) => {
    setDirty(true);
    setValues((prev) => {
      const current = valueOf(prev, field.key);
      const next = { ...current, [lang]: text, auto: { ...current.auto } };

      if (lang === 'en') {
        // Names, numbers and dates are the same in every language: they
        // follow the English as it is typed.
        if (field.kind !== 'translate') {
          next.he = text;
          next.si = text;
          next.auto = { he: false, si: false };
        }
      } else if (confirm || text !== current[lang]) {
        // Touched by a person, so no longer a machine's guess.
        next.auto[lang] = false;
      }

      return { ...prev, [field.key]: next };
    });
  };

  /** Hebrew and Sinhala for the given fields, from their English, in one request. */
  const translate = async (fields) => {
    const wanted = fields.filter((f) => valueOf(values, f.key).en.trim() !== '');
    if (wanted.length === 0) return;

    setTranslating((prev) => ({ ...prev, ...Object.fromEntries(wanted.map((f) => [f.key, true])) }));
    try {
      const texts = wanted.map((f) => valueOf(values, f.key).en.trim());
      const { data } = await agreementApi.translate(texts);

      setValues((prev) => {
        const next = { ...prev };
        wanted.forEach((f, i) => {
          const current = valueOf(prev, f.key);
          next[f.key] = {
            ...current,
            he: data.he[i] ?? current.he,
            si: data.si[i] ?? current.si,
            auto: { he: true, si: true },
          };
          translatedFrom.current[f.key] = texts[i];
        });
        return next;
      });
      setDirty(true);
    } catch (err) {
      if (err.status === 503 && warnedOffline.current) return;
      warnedOffline.current = warnedOffline.current || err.status === 503;
      alertError(err.message || 'Could not translate.', 'Translation failed');
    } finally {
      setTranslating((prev) => {
        const next = { ...prev };
        wanted.forEach((f) => delete next[f.key]);
        return next;
      });
    }
  };

  const englishDone = (field) => {
    if (field.kind !== 'translate') return;
    const en = valueOf(values, field.key).en.trim();
    if (en === '' || translatedFrom.current[field.key] === en) return;
    translate([field]);
  };

  const save = async () => {
    if (title.trim().length < 3) {
      alertError('The title must be at least 3 characters.', 'Not saved');
      return;
    }
    setSaving(true);
    try {
      const { data, message } = await agreementApi.update(id, { title: title.trim(), values });
      setAgreement(data);
      setValues(data.values || {});
      setDirty(false);
      toast(message || 'Agreement saved.');
    } catch (err) {
      alertError(err.message || 'Could not save the agreement.', 'Not saved');
    } finally {
      setSaving(false);
    }
  };

  if (!agreement) return <PageLoader label="Loading agreement..." />;

  // A foreign company's agreement is the employer part alone, and moves on
  // from the company to the admin side to a local agency.
  if (agreement.agencyId) return <CompanyAgreement agreement={agreement} onChange={setAgreement} />;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-end gap-4 px-5 py-4">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="agreementTitle" className="field-label">
              Title
            </label>
            <input
              id="agreementTitle"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
              className="field-input"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              {agreement.template?.name} · English is the binding version (clause 18).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {unchecked > 0 ? (
              <Badge tone="amber" dot>
                {unchecked} translation{unchecked === 1 ? '' : 's'} to check
              </Badge>
            ) : (
              <Badge tone="green" dot>
                Nothing to check
              </Badge>
            )}
            <Button variant="ghost" onClick={() => openTemplatePdf(agreement.templateId)}>
              View original PDF
            </Button>
            <Button
              variant="secondary"
              icon={IconRefresh}
              loading={Object.keys(translating).length > 0}
              onClick={() => translate(translateFields)}
            >
              Translate all
            </Button>
            <Button onClick={save} loading={saving} disabled={!dirty}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => navigate('/agreements')}>
              Back
            </Button>
          </div>
        </div>
      </Card>

      {sections.map((section) => (
        <Card key={section.key}>
          <CardHeader
            title={section.title.en}
            subtitle={
              <>
                <span dir="rtl" lang="he">
                  {section.title.he}
                </span>
                {' · '}
                <span lang="si">{section.title.si}</span>
              </>
            }
          />
          <div>
            {section.fields.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                value={valueOf(values, field.key)}
                onChange={change}
                onEnglishDone={englishDone}
                translating={Boolean(translating[field.key])}
              />
            ))}
          </div>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button onClick={save} loading={saving} disabled={!dirty}>
          Save agreement
        </Button>
      </div>
    </div>
  );
}
