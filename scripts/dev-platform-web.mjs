import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import net from 'node:net';

const root = process.cwd();
const tsxBin = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const DEFAULT_API_PORT = 4591;
const MAX_ATTEMPTS = 5;

const children = new Set();
let shuttingDown = false;

function checkPortAvailable(port) {
  return new Promise((resolveCheck) => {
    const server = net.createServer();
    server.once('error', () => resolveCheck(false));
    server.once('listening', () => {
      server.close(() => resolveCheck(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(startPort) {
  for (let index = 0; index < MAX_ATTEMPTS; index += 1) {
    const port = startPort + index;
    if (await checkPortAvailable(port)) {
      return { port, attempts: index + 1 };
    }
  }
  return { port: startPort, attempts: 1 };
}

function waitForPort(port, maxRetries = 50) {
  return new Promise((resolveWait, rejectWait) => {
    let retries = 0;
    const tryConnect = () => {
      const socket = net.createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        resolveWait(true);
      });
      socket.once('error', () => {
        retries += 1;
        if (retries >= maxRetries) {
          rejectWait(new Error(`Port ${port} not available after ${maxRetries} retries`));
          return;
        }
        setTimeout(tryConnect, 200);
      });
    };
    tryConnect();
  });
}

function run(name, args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: false,
  });
  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown && (signal || code)) {
      console.error(`[${name}] exited unexpectedly`);
      shutdown();
    }
  });
  child.on('error', (error) => {
    console.error(`[${name}] ${error.message}`);
    shutdown();
  });
  return child;
}

async function main() {
  const { port, attempts } = await findAvailablePort(DEFAULT_API_PORT);
  if (attempts > 1) {
    console.log(`[dev-platform-web] Port ${DEFAULT_API_PORT} is busy; using ${port}`);
  }

  const apiChild = run(
    'platform-api',
    [tsxBin, 'packages/server/src/index.ts'],
    {
      PLATFORM_API_HOST: '127.0.0.1',
      PLATFORM_API_PORT: String(port),
      PLATFORM_AUTH_MODE: process.env.PLATFORM_AUTH_MODE ?? 'local',
      PLATFORM_ADMIN_EMAILS: process.env.PLATFORM_ADMIN_EMAILS ?? 'admin@local.dev',
      PLATFORM_AUTH_BOOTSTRAP_PASSWORD:
        process.env.PLATFORM_AUTH_BOOTSTRAP_PASSWORD ?? '123456',
      PLATFORM_WEB_APP_URL: process.env.PLATFORM_WEB_APP_URL ?? 'http://localhost:1430',
      PLATFORM_DATABASE_URL:
        process.env.PLATFORM_DATABASE_URL ??
        'mysql://root:Zhujun%40123@localhost:3306/platform_web',
    },
  );

  console.log(`[dev-platform-web] Waiting for platform API on port ${port}...`);
  try {
    await waitForPort(port);
    console.log(`[dev-platform-web] Platform API is ready on port ${port}`);
  } catch (error) {
    console.error('[dev-platform-web] Platform API failed to start:', error.message);
    apiChild.kill();
    process.exit(1);
  }

  run('platform-vite', [viteBin, '--config', 'apps/platform-web/vite.config.ts'], {
    SUIT_SKILLS_PLATFORM_API_PORT: String(port),
  });

  console.log(`[dev-platform-web] Vite is proxying /api to http://127.0.0.1:${port}`);
  console.log('[dev-platform-web] Local admin login: admin / 123456 (reset on start)');
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    child.kill();
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((error) => {
  console.error('[dev-platform-web] Failed to start:', error);
  process.exit(1);
});
