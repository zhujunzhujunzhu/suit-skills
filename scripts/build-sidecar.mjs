import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkgJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const isWindows = process.platform === 'win32';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const details = result.error?.message || result.stderr || result.stdout || '';
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status}${
        details ? `\n${details}` : ''
      }`,
    );
  }

  return result.stdout ?? '';
}

function rustHostTriple() {
  const output = run('rustc', ['-Vv'], { capture: true });
  const hostLine = output.split(/\r?\n/).find((line) => line.startsWith('host: '));
  return hostLine?.slice('host: '.length).trim() ?? 'x86_64-pc-windows-msvc';
}

function pkgTargetForHost(host) {
  const arch = host.startsWith('aarch64') ? 'arm64' : 'x64';

  if (host.includes('windows')) return `node18-win-${arch}`;
  if (host.includes('apple')) return `node18-macos-${arch}`;
  if (host.includes('linux')) return `node18-linux-${arch}`;

  throw new Error(`Unsupported Rust host triple for sidecar build: ${host}`);
}

const host = rustHostTriple();
const pkgTarget = pkgTargetForHost(host);
const outputName = `suit-skills-${host}${host.includes('windows') ? '.exe' : ''}`;
const outputPath = join('src-tauri', 'binaries', outputName);

mkdirSync(join(root, 'src-tauri', 'binaries'), { recursive: true });

await build({
  entryPoints: [join(root, 'dist', 'index.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: join(root, 'dist', 'sidecar.js'),
  define: {
    'process.env.SUIT_SKILLS_VERSION': JSON.stringify(pkgJson.version),
  },
  banner: {
    js: "const __nodeUtil = require('node:util'); if (!__nodeUtil.styleText) __nodeUtil.styleText = (_style, text) => text;",
  },
  logOverride: {
    'empty-import-meta': 'silent',
  },
});

run(process.execPath, [
  join(root, 'node_modules', 'pkg', 'lib-es5', 'bin.js'),
  '--no-bytecode',
  '--public',
  'dist/sidecar.js',
  '--targets',
  pkgTarget,
  '--output',
  outputPath,
]);

console.log(`Built sidecar: ${outputPath}`);
