import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget =
  process.env.SUIT_SKILLS_PLATFORM_API_URL ??
  `http://127.0.0.1:${process.env.SUIT_SKILLS_PLATFORM_API_PORT ?? '4591'}`;

const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version?: string };

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version ?? '0.0.0'),
  },
  build: {
    outDir: '../../dist/platform-web',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom/client'],
          router: ['react-router-dom'],
        },
      },
    },
  },
  server: {
    port: 1430,
    strictPort: false,
    host: 'localhost',
    proxy: {
      '/api': apiTarget,
    },
  },
});
