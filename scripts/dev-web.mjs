import { spawn } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const tsxBin = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function run(name, args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: process.env,
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

const children = [
  run('api', [tsxBin, 'src/index.ts', 'web', '--port', '4587', '--no-open']),
  run('vite', [viteBin, '--config', 'web/vite.config.ts']),
];

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
