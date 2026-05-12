import { spawn } from 'node:child_process';
import { join } from 'node:path';
import net from 'node:net';

const root = process.cwd();
const tsxBin = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const DEFAULT_PORT = 4587;
const MAX_ATTEMPTS = 3;

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      resolve(err.code === 'EADDRINUSE' ? false : false);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(startPort) {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const port = startPort + i;
    if (port > 65535) break;
    const available = await checkPortAvailable(port);
    if (available) {
      return { port, attempts: i + 1 };
    }
  }
  return { port: startPort, attempts: 1 };
}

function waitForPort(port, maxRetries = 30) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const tryConnect = () => {
      const socket = net.createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        retries++;
        if (retries >= maxRetries) {
          reject(new Error(`Port ${port} not available after ${maxRetries} retries`));
        } else {
          setTimeout(tryConnect, 200);
        }
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
  child.on('exit', (code, signal) => {
    if (signal || code) {
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
  const { port, attempts } = await findAvailablePort(DEFAULT_PORT);

  if (attempts > 1) {
    console.log(`[dev-web] Port ${DEFAULT_PORT} is busy; using ${port}`);
  }

  const apiChild = run('api', [
    tsxBin,
    'apps/cli/src/index.ts',
    'web',
    '--port',
    String(port),
    '--no-open',
  ]);

  console.log(`[dev-web] Waiting for API on port ${port}...`);
  try {
    await waitForPort(port);
    console.log(`[dev-web] API is ready on port ${port}`);
  } catch (error) {
    console.error('[dev-web] API failed to start:', error.message);
    apiChild.kill();
    process.exit(1);
  }

  run('vite', [viteBin, '--config', 'apps/local-web/vite.config.ts'], {
    SUIT_SKILLS_API_PORT: String(port),
  });

  console.log(`[dev-web] Vite dev server started; proxying API to port ${port}`);
}

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((error) => {
  console.error('[dev-web] Failed to start:', error);
  process.exit(1);
});
