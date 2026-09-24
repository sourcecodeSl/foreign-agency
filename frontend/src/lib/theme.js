/**
 * The look of the interface: light or dark, the accent colour, the sidebar
 * and the text size.
 *
 * Every colour the screens use (primary, gray, red, amber, emerald, and the
 * card surface) is a CSS variable - see tailwind.config.js - so applying an
 * appearance is only a matter of setting those variables on <html>. No screen
 * has to know which theme is on.
 */

export const DEFAULT_APPEARANCE = {
  mode: 'light',
  accent: 'blue',
  sidebar: 'default',
  textSize: 'default',
  // Used when the accent or the sidebar is set to "custom".
  customAccent: '#3363ff',
  sidebarColor: '#1a288f',
};

export const isHex = (value) => /^#[0-9a-fA-F]{6}$/.test(value || '');

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/** Tailwind's palettes, plus the app's own blue. */
const PALETTES = {
  blue: ['#eef4ff', '#d9e6ff', '#bcd3ff', '#8eb5ff', '#598cff', '#3363ff', '#1d41f5', '#162fe1', '#1829b6', '#1a288f', '#141b5c'],
  indigo: ['#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81', '#1e1b4b'],
  violet: ['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#2e1065'],
  emerald: ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b', '#022c22'],
  teal: ['#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#134e4a', '#042f2e'],
  rose: ['#fff1f2', '#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337', '#4c0519'],
  orange: ['#fff7ed', '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#431407'],
  slate: ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a', '#020617'],
  red: ['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#450a0a'],
  amber: ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#451a03'],
  gray: ['#f9fafb', '#f3f4f6', '#e5e7eb', '#d1d5db', '#9ca3af', '#6b7280', '#4b5563', '#374151', '#1f2937', '#111827', '#030712'],
};

/** The accent colours on offer, in the order the page shows them. */
export const ACCENTS = [
  { id: 'blue', label: 'Blue' },
  { id: 'indigo', label: 'Indigo' },
  { id: 'violet', label: 'Violet' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'teal', label: 'Teal' },
  { id: 'rose', label: 'Rose' },
  { id: 'orange', label: 'Orange' },
  { id: 'slate', label: 'Slate' },
];

/** The swatch colour for an accent, for the page that picks one. */
export const accentSwatch = (id, custom) => (id === 'custom' && isHex(custom) ? custom : (PALETTES[id] || PALETTES.blue)[6]);

const toRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (parts) => '#' + parts.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');

/** One colour moved towards another: amount 0 keeps it, 1 is the other. */
const mix = (hex, towards, amount) => {
  const a = toRgb(hex);
  const b = toRgb(towards);
  return toHex(a.map((c, i) => c + (b[i] - c) * amount));
};

/**
 * A whole shade scale (50-950) from one colour picked by hand. The picked
 * colour is the 600 - the shade buttons are drawn in - with paler tints above
 * it and deeper shades below.
 */
export function scaleFrom(hex) {
  const base = isHex(hex) ? hex.toLowerCase() : PALETTES.blue[6];
  return [
    mix(base, '#ffffff', 0.94),
    mix(base, '#ffffff', 0.87),
    mix(base, '#ffffff', 0.74),
    mix(base, '#ffffff', 0.55),
    mix(base, '#ffffff', 0.32),
    mix(base, '#ffffff', 0.14),
    base,
    mix(base, '#000000', 0.16),
    mix(base, '#000000', 0.32),
    mix(base, '#000000', 0.46),
    mix(base, '#000000', 0.64),
  ];
}

/** How light a colour looks (0 black - 1 white), as WCAG counts it. */
export function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast between two colours, from 1 (none) to 21 (black on white). */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Gray in the dark: the scale runs the other way, so a light background
 * (gray-50) turns dark and dark text (gray-900) turns light.
 */
const DARK_GRAY = ['#0b1120', '#1f2937', '#273244', '#374151', '#6b7280', '#9ca3af', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#f8fafc', '#ffffff'];

const SURFACE = { light: '#ffffff', dark: '#111827' };

export const TEXT_SIZES = { small: '15px', default: '16px', large: '17px' };

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) + ' ' + ((n >> 8) & 255) + ' ' + (n & 255);
};

/**
 * A coloured scale in the dark: pale tints (the backgrounds of badges and
 * notes) turn deep, dark shades (their text) turn pale, and the middle -
 * buttons, icons - stays as it is.
 */
function darkened(scale) {
  const flip = { 50: 950, 100: 900, 200: 800, 300: 700, 700: 300, 800: 200, 900: 100, 950: 50 };
  return SHADES.map((shade) => scale[SHADES.indexOf(flip[shade] ?? shade)]);
}

/** Light or dark, with "system" following the device. */
export function resolveMode(mode) {
  if (mode === 'dark' || mode === 'light') return mode;
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

/** The sidebar's own colours, which may stay dark or take the accent whatever the mode. */
function sidebarVars(style, accent, custom) {
  if (style === 'custom' && isHex(custom)) {
    // Light text on a dark colour, dark text on a light one.
    const dark = luminance(custom) < 0.4;
    const ink = dark ? '#ffffff' : '#111827';
    return {
      bg: custom,
      border: mix(custom, ink, 0.12),
      text: mix(custom, ink, 0.8),
      muted: mix(custom, ink, 0.55),
      hover: mix(custom, ink, 0.1),
      'hover-text': ink,
      active: mix(custom, ink, 0.18),
      'active-text': ink,
      'active-icon': ink,
      title: ink,
      card: mix(custom, ink, 0.08),
    };
  }
  if (style === 'dark') {
    return {
      bg: '#0f172a', border: '#1e293b', text: '#cbd5e1', muted: '#64748b', hover: '#1e293b',
      'hover-text': '#ffffff', active: '#334155', 'active-text': '#ffffff', 'active-icon': accent[4],
      title: '#ffffff', card: '#1e293b',
    };
  }
  if (style === 'brand') {
    return {
      bg: accent[9], border: accent[8], text: accent[1], muted: accent[3], hover: accent[8],
      'hover-text': '#ffffff', active: accent[7], 'active-text': '#ffffff', 'active-icon': '#ffffff',
      title: '#ffffff', card: accent[8],
    };
  }
  return null; // follows the rest of the page (the defaults in index.css)
}

/** Every CSS variable an appearance sets, as { '--c-primary-500': '51 99 255', ... }. */
export function appearanceVars(appearance = DEFAULT_APPEARANCE) {
  const choice = { ...DEFAULT_APPEARANCE, ...appearance };
  const mode = resolveMode(choice.mode);
  const dark = mode === 'dark';
  const accent = choice.accent === 'custom' ? scaleFrom(choice.customAccent) : PALETTES[choice.accent] || PALETTES.blue;
  const vars = {};

  const set = (name, scale) =>
    SHADES.forEach((shade, i) => {
      vars['--c-' + name + '-' + shade] = rgb(scale[i]);
    });

  set('primary', dark ? darkened(accent) : accent);
  set('gray', dark ? DARK_GRAY : PALETTES.gray);
  for (const name of ['red', 'amber', 'emerald']) set(name, dark ? darkened(PALETTES[name]) : PALETTES[name]);
  vars['--c-surface'] = rgb(dark ? SURFACE.dark : SURFACE.light);

  const sidebar = sidebarVars(choice.sidebar, accent, choice.sidebarColor);
  for (const key of ['bg', 'border', 'text', 'muted', 'hover', 'hover-text', 'active', 'active-text', 'active-icon', 'title', 'card']) {
    // The default sidebar reads the page's own colours (index.css), so it
    // turns dark with everything else.
    vars['--sb-' + key] = sidebar ? rgb(sidebar[key]) : '';
  }

  return { vars, mode, fontSize: TEXT_SIZES[choice.textSize] || TEXT_SIZES.default };
}

/** Puts an appearance on the page. */
export function applyAppearance(appearance) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const { vars, mode, fontSize } = appearanceVars(appearance);

  for (const [name, value] of Object.entries(vars)) {
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  }
  root.style.fontSize = fontSize;
  // Native controls (date pickers, scrollbars) follow too.
  root.style.colorScheme = mode;
  root.dataset.theme = mode;
}

// The last appearance used in this browser, so the page opens in it before
// the server has answered. Storage can be unavailable; then the defaults do.
const CACHE_KEY = 'aa.appearance';

export function readCachedAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return saved && typeof saved === 'object' ? { ...DEFAULT_APPEARANCE, ...saved } : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function cacheAppearance(appearance) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(appearance));
  } catch {
    /* nowhere to keep it; the server still has it */
  }
}
