import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 从环境变量读取 API 端口，支持开发环境端口自动重试。
const apiPort = process.env.SUIT_SKILLS_API_PORT
  ? Number(process.env.SUIT_SKILLS_API_PORT)
  : 4587;
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version?: string };
const appVersion = packageJson.version ?? '0.0.0';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 1420,
    strictPort: false,  // 允许 Vite 自动尝试下一个端口
    host: 'localhost',  // 同时支持 IPv4 和 IPv6
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
    },
  },
});
