import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// In dev, /api is proxied to the API so the browser only ever talks to our own origin.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': apiTarget } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
