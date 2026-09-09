import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // 127.0.0.1, not localhost: on Windows Node resolves localhost to ::1
        // while `php artisan serve` binds IPv4, which breaks the proxy.
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
