import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // Server code under test imports this; the real one throws by design.
      'server-only': fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Server modules read these at import time; the values are never used
    // because every backend call in a test is mocked.
    env: { API_URL: 'http://api.test', API_PREFIX: 'api', API_VERSION: '1' },
    restoreMocks: true,
  },
});
