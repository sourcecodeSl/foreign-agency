/** A colour read from a CSS variable holding "r g b", so opacity still works. */
const variable = (name) => 'rgb(var(' + name + ') / <alpha-value>)';

/** A whole shade scale (50-950) read from --c-{name}-{shade}. */
const scale = (name) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((shade) => [shade, variable('--c-' + name + '-' + shade)])
  );

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Every colour the screens use is a CSS variable, set by the person's
      // appearance (src/lib/theme.js): light or dark, and the accent colour.
      colors: {
        primary: scale('primary'),
        gray: scale('gray'),
        red: scale('red'),
        amber: scale('amber'),
        emerald: scale('emerald'),
        // Cards, inputs, the top bar - white in the light, dark in the dark.
        surface: variable('--c-surface'),
        // The sidebar, which may stay dark or take the accent whatever the mode.
        sb: {
          bg: variable('--sb-bg'),
          border: variable('--sb-border'),
          text: variable('--sb-text'),
          muted: variable('--sb-muted'),
          hover: variable('--sb-hover'),
          'hover-text': variable('--sb-hover-text'),
          active: variable('--sb-active'),
          'active-text': variable('--sb-active-text'),
          'active-icon': variable('--sb-active-icon'),
          title: variable('--sb-title'),
          card: variable('--sb-card'),
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.06), 0 1px 3px 0 rgb(16 24 40 / 0.10)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
