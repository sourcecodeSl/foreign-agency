import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * Where the dev server sends /api. By default XAMPP's Apache, which serves the
 * Laravel app from htdocs whenever XAMPP is running - so there is no separate
 * `php artisan serve` to remember. Set API_PROXY_TARGET in .env to send it
 * elsewhere, e.g. http://127.0.0.1:8000 while running artisan serve.
 */
const DEFAULT_API_TARGET = 'http://127.0.0.1/agency/backend-laravel/public';

export default defineConfig(({ mode }) => {
  // '' loads every variable, not only VITE_ ones; this one never reaches the browser.
  const env = loadEnv(mode, process.cwd(), '');
  const target = new URL(env.API_PROXY_TARGET || DEFAULT_API_TARGET);
  const basePath = target.pathname.replace(/\/$/, '');

  return {
    plugins: [react()],
    // Bundled when the dev server starts: pdf-lib is loaded only on the first
    // "View PDF", and finding it then would make Vite reload the page.
    optimizeDeps: { include: ['pdf-lib'] },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          // 127.0.0.1, not localhost: on Windows Node may resolve localhost to
          // ::1, which `php artisan serve` does not listen on.
          target: target.origin,
          changeOrigin: true,
          // Apache serves the app from a subfolder, so /api/v1/... is sent on
          // as /agency/backend-laravel/public/api/v1/...
          rewrite: (path) => basePath + path,
        },
      },
    },
  };
});
