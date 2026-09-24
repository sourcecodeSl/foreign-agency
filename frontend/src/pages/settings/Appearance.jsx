import { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { IconCheck, IconMonitor, IconMoon, IconRefresh, IconSun } from '../../components/ui/Icons';
import { useAppearance } from '../../context/AppearanceContext';
import { ACCENTS, DEFAULT_APPEARANCE, accentSwatch, contrast, isHex, luminance } from '../../lib/theme';

const MODES = [
  { id: 'light', label: 'Light', hint: 'Bright pages, dark text.', icon: IconSun },
  { id: 'dark', label: 'Dark', hint: 'Easier on the eyes at night.', icon: IconMoon },
  { id: 'system', label: 'System', hint: 'Follows this device.', icon: IconMonitor },
];

const SIDEBARS = [
  { id: 'default', label: 'Default', hint: 'Matches the page.' },
  { id: 'dark', label: 'Dark', hint: 'Always dark, in any theme.' },
  { id: 'brand', label: 'Accent', hint: 'Takes your accent colour.' },
  { id: 'custom', label: 'Custom', hint: 'A colour you pick.' },
];

/** How long a colour has to stay put before it is saved. */
const SAVE_AFTER_MS = 500;

/**
 * A colour picked by hand: the system picker, and the #rrggbb code for when
 * the exact colour is known. Every move shows at once; `onPick` saves.
 */
function ColorPicker({ id, label, value, onPreview, onPick, note }) {
  const [text, setText] = useState(value);
  const timer = useRef(null);

  // Follows the colour when it changes elsewhere (reset, the server).
  useEffect(() => setText(value), [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const choose = (hex) => {
    onPreview(hex.toLowerCase());
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onPick(hex.toLowerCase()), SAVE_AFTER_MS);
  };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-semibold text-gray-900">{label}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          id={id + '-picker'}
          type="color"
          aria-label={label + ' picker'}
          value={isHex(value) ? value : '#000000'}
          onChange={(e) => {
            setText(e.target.value);
            choose(e.target.value);
          }}
          className="h-10 w-14 cursor-pointer rounded-lg border border-gray-300 bg-surface p-1"
        />
        <div>
          <label htmlFor={id + '-hex'} className="sr-only">
            {label} code
          </label>
          <input
            id={id + '-hex'}
            value={text}
            maxLength={7}
            spellCheck={false}
            placeholder="#3363ff"
            onChange={(e) => {
              const next = e.target.value.trim();
              setText(next);
              if (isHex(next)) choose(next);
            }}
            className={'field-input w-32 font-mono uppercase ' + (isHex(text) ? '' : 'field-input-error')}
          />
        </div>
        {!isHex(text) && <p className="text-xs font-medium text-red-600">Enter the colour as #rrggbb.</p>}
      </div>
      {note && <p className="mt-2 text-xs text-gray-500">{note}</p>}
    </div>
  );
}

const TEXT_SIZES = [
  { id: 'small', label: 'Small', sample: 'text-[13px]' },
  { id: 'default', label: 'Default', sample: 'text-[15px]' },
  { id: 'large', label: 'Large', sample: 'text-[17px]' },
];

/** A choice drawn as a card, ringed in the accent when it is the one picked. */
function Choice({ selected, onClick, label, hint, children }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onClick}
      className={
        'group relative flex flex-col overflow-hidden rounded-xl border text-left transition focus:outline-none focus:ring-4 focus:ring-primary-100 ' +
        (selected ? 'border-primary-500 ring-2 ring-primary-200' : 'border-gray-200 hover:border-gray-300')
      }
    >
      {children}
      <span className="flex items-start justify-between gap-2 border-t border-gray-100 px-3.5 py-2.5">
        <span>
          <span className="block text-sm font-semibold text-gray-900">{label}</span>
          {hint && <span className="block text-xs text-gray-500">{hint}</span>}
        </span>
        {selected && (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white">
            <IconCheck className="h-3.5 w-3.5" />
          </span>
        )}
      </span>
    </button>
  );
}

/** A tiny page in light or dark, for the theme choice. */
function ModePreview({ mode }) {
  const pane = (dark) => (
    <span className={'flex h-full flex-1 gap-1.5 p-2 ' + (dark ? 'bg-[#0b1120]' : 'bg-[#f9fafb]')}>
      <span className={'w-5 rounded ' + (dark ? 'bg-[#111827]' : 'bg-white')} />
      <span className="flex flex-1 flex-col gap-1.5">
        <span className={'h-2 w-3/4 rounded ' + (dark ? 'bg-[#374151]' : 'bg-[#e5e7eb]')} />
        <span className={'flex-1 rounded ' + (dark ? 'bg-[#111827]' : 'bg-white')} />
        <span className="h-2 w-1/3 rounded bg-primary-500" />
      </span>
    </span>
  );

  return (
    <span className="flex h-24 w-full overflow-hidden" aria-hidden="true">
      {mode === 'system' ? (
        <>
          {pane(false)}
          {pane(true)}
        </>
      ) : (
        pane(mode === 'dark')
      )}
    </span>
  );
}

/** A tiny page with the sidebar in one style. */
function SidebarPreview({ style, accent, customAccent, sidebarColor }) {
  const swatch = accentSwatch(accent, customAccent);
  const side =
    style === 'dark'
      ? { background: '#0f172a' }
      : style === 'brand'
        ? { background: swatch, filter: 'brightness(0.55)' }
        : style === 'custom'
          ? { background: sidebarColor }
          : null;
  // A light sidebar colour carries dark marks, a dark one light marks.
  const ink = style === 'custom' && luminance(sidebarColor) >= 0.4 ? '17,24,39' : '255,255,255';

  return (
    <span className="flex h-24 w-full bg-gray-50 p-2" aria-hidden="true">
      <span
        className={'flex w-10 flex-col gap-1.5 rounded-md p-1.5 ' + (side ? '' : 'border border-gray-200 bg-surface')}
        style={side || undefined}
      >
        <span className="h-1.5 rounded" style={{ background: side ? 'rgba(' + ink + ',.85)' : swatch }} />
        <span className="h-1.5 rounded" style={{ background: side ? 'rgba(' + ink + ',.35)' : 'rgb(var(--c-gray-300))' }} />
        <span className="h-1.5 rounded" style={{ background: side ? 'rgba(' + ink + ',.35)' : 'rgb(var(--c-gray-300))' }} />
      </span>
      <span className="ml-2 flex flex-1 flex-col gap-1.5">
        <span className="h-2 w-2/3 rounded bg-gray-200" />
        <span className="flex-1 rounded border border-gray-200 bg-surface" />
      </span>
    </span>
  );
}

/**
 * How the interface looks for the person signed in: light or dark, the accent
 * colour, the sidebar and the text size. Every choice shows at once and is
 * saved to their own login - the admin side, a foreign company and a local
 * agency each keep their own.
 */
export default function Appearance() {
  const { appearance, update, preview, reset, saving } = useAppearance();
  const { toast } = useToast();

  const change = async (changes) => {
    try {
      await update(changes);
    } catch (err) {
      toast(err.message || 'Could not save the appearance.', 'error');
    }
  };

  const resetAll = async () => {
    try {
      await reset();
      toast('Back to the default look.');
    } catch (err) {
      toast(err.message || 'Could not reset the appearance.', 'error');
    }
  };

  const isDefault = Object.keys(DEFAULT_APPEARANCE).every((key) => appearance[key] === DEFAULT_APPEARANCE[key]);

  // White button text on a colour picked by hand has to stay readable.
  const accentContrast = contrast('#ffffff', appearance.customAccent || DEFAULT_APPEARANCE.customAccent);
  const accentNote =
    accentContrast < 3
      ? 'This colour is light, so white text on buttons may be hard to read. A deeper shade reads better.'
      : 'Buttons and links are drawn in this colour; lighter and deeper shades are made from it.';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Appearance"
          subtitle="Make the interface your own. Changes show straight away and are saved to your login, on every device."
          action={
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500" aria-live="polite">
                {saving ? 'Saving...' : 'All changes saved'}
              </span>
              <Button variant="secondary" size="sm" icon={IconRefresh} onClick={resetAll} disabled={isDefault || saving}>
                Reset to default
              </Button>
            </div>
          }
        />
      </Card>

      <Card>
        <CardHeader title="Theme" subtitle="Light, dark, or whatever this device is set to." />
        <CardBody>
          <div role="radiogroup" aria-label="Theme" className="grid gap-4 sm:grid-cols-3">
            {MODES.map((mode) => (
              <Choice
                key={mode.id}
                label={mode.label}
                hint={mode.hint}
                selected={appearance.mode === mode.id}
                onClick={() => change({ mode: mode.id })}
              >
                <ModePreview mode={mode.id} />
              </Choice>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Accent colour" subtitle="Buttons, links, the selected menu item and highlights." />
        <CardBody>
          <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-3">
            {ACCENTS.map((accent) => {
              const selected = appearance.accent === accent.id;
              return (
                <button
                  key={accent.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={accent.label}
                  title={accent.label}
                  onClick={() => change({ accent: accent.id })}
                  className={
                    'flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm font-medium transition focus:outline-none focus:ring-4 focus:ring-primary-100 ' +
                    (selected ? 'border-gray-900 text-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-300')
                  }
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                    style={{ background: accentSwatch(accent.id) }}
                  >
                    {selected && <IconCheck className="h-4 w-4" />}
                  </span>
                  {accent.label}
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={appearance.accent === 'custom'}
              aria-label="Custom"
              title="Custom"
              onClick={() => change({ accent: 'custom' })}
              className={
                'flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm font-medium transition focus:outline-none focus:ring-4 focus:ring-primary-100 ' +
                (appearance.accent === 'custom'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300')
              }
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                style={{
                  background:
                    appearance.accent === 'custom'
                      ? appearance.customAccent
                      : 'conic-gradient(#ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6, #ef4444)',
                }}
              >
                {appearance.accent === 'custom' && <IconCheck className="h-4 w-4" />}
              </span>
              Custom
            </button>
          </div>

          {appearance.accent === 'custom' && (
            <ColorPicker
              id="customAccent"
              label="Your accent colour"
              value={appearance.customAccent}
              note={accentNote}
              onPreview={(hex) => preview({ customAccent: hex })}
              onPick={(hex) => change({ accent: 'custom', customAccent: hex })}
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Sidebar" subtitle="How the menu on the left looks." />
        <CardBody>
          <div role="radiogroup" aria-label="Sidebar" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SIDEBARS.map((style) => (
              <Choice
                key={style.id}
                label={style.label}
                hint={style.hint}
                selected={appearance.sidebar === style.id}
                onClick={() => change({ sidebar: style.id })}
              >
                <SidebarPreview
                  style={style.id}
                  accent={appearance.accent}
                  customAccent={appearance.customAccent}
                  sidebarColor={appearance.sidebarColor}
                />
              </Choice>
            ))}
          </div>

          {appearance.sidebar === 'custom' && (
            <ColorPicker
              id="sidebarColor"
              label="Your sidebar colour"
              value={appearance.sidebarColor}
              note="The menu text turns light or dark to suit the colour."
              onPreview={(hex) => preview({ sidebarColor: hex })}
              onPick={(hex) => change({ sidebar: 'custom', sidebarColor: hex })}
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Text size" subtitle="Everything on the page grows or shrinks with it." />
        <CardBody>
          <div role="radiogroup" aria-label="Text size" className="grid gap-3 sm:grid-cols-3">
            {TEXT_SIZES.map((size) => {
              const selected = appearance.textSize === size.id;
              return (
                <button
                  key={size.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={size.label}
                  onClick={() => change({ textSize: size.id })}
                  className={
                    'flex items-center justify-between rounded-xl border px-4 py-3 text-left transition focus:outline-none focus:ring-4 focus:ring-primary-100 ' +
                    (selected ? 'border-primary-500 ring-2 ring-primary-200' : 'border-gray-200 hover:border-gray-300')
                  }
                >
                  <span className="text-sm font-semibold text-gray-900">{size.label}</span>
                  <span className={'font-semibold text-gray-500 ' + size.sample}>Aa</span>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* What the screens look like with these choices. */}
      <Card>
        <CardHeader title="Preview" subtitle="A few of the pieces you will see on every screen." />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary action</Button>
            <Button variant="secondary">Secondary</Button>
            <Badge tone="green" dot>
              Passed
            </Badge>
            <Badge tone="amber" dot>
              Pending
            </Badge>
            <Badge tone="red" dot>
              Did not pass
            </Badge>
            <Badge tone="blue" dot>
              Registered
            </Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="appearancePreviewInput" className="field-label">
                A field
              </label>
              <input id="appearancePreviewInput" className="field-input" placeholder="Type here..." />
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">A note</p>
              <p className="mt-0.5">Warnings and notices look like this.</p>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            Body text reads like this, with <span className="font-medium text-primary-600">links in your accent</span>.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
