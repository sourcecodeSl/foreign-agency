import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    // The long forms are typed key by key; with every file running at once
    // the default 5 seconds is too close for them.
    testTimeout: 15000,
    // Tests drive the mock adapter so they never depend on a running API or
    // database, regardless of what .env says.
    env: {
      VITE_USE_MOCK: 'true',
    },
  },
});
