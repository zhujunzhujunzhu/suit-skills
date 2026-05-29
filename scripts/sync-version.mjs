/**
 * 版本号同步脚本
 * 将 package.json 中的版本号同步到 workspace package.json、package-lock.json、
 * apps/desktop/tauri.conf.json 和 apps/desktop/Cargo.toml
 *
 * 用法：node scripts/sync-version.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

const pkgPath = resolve(root, 'package.json');
const lockPath = resolve(root, 'package-lock.json');
const tauriConfPath = resolve(root, 'apps', 'desktop', 'tauri.conf.json');
const cargoPath = resolve(root, 'apps', 'desktop', 'Cargo.toml');

const pkg = readJson(pkgPath);
const version = pkg.version;
console.log(`Syncing version: ${version}`);

function workspacePackagePaths() {
  return ['apps', 'packages'].flatMap((workspaceDir) => {
    const dir = resolve(root, workspaceDir);
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(dir, entry.name, 'package.json'));
  });
}

function syncPackageJson(path) {
  const data = readJson(path);
  const prev = data.version;
  data.version = version;

  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = data[section];
    if (!deps || typeof deps !== 'object') continue;
    for (const name of Object.keys(deps)) {
      if (name.startsWith('@suit-skills/')) {
        deps[name] = version;
      }
    }
  }

  writeJson(path, data);
  console.log(`  ${path.slice(root.length + 1)}: ${prev} → ${version}`);
}

for (const path of workspacePackagePaths()) {
  syncPackageJson(path);
}

const lock = readJson(lockPath);
lock.version = version;
if (lock.packages?.['']) {
  lock.packages[''].version = version;
}
for (const [path, data] of Object.entries(lock.packages ?? {})) {
  if (path === '' || !data || typeof data !== 'object') continue;
  if (path.startsWith('apps/') || path.startsWith('packages/')) {
    data.version = version;
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const deps = data[section];
      if (!deps || typeof deps !== 'object') continue;
      for (const name of Object.keys(deps)) {
        if (name.startsWith('@suit-skills/')) {
          deps[name] = version;
        }
      }
    }
  }
}
writeJson(lockPath, lock);
console.log(`  package-lock.json: synced`);

// 同步 tauri.conf.json
const tauriConf = readJson(tauriConfPath);
const prevTauri = tauriConf.version;
tauriConf.version = version;
writeJson(tauriConfPath, tauriConf);
console.log(`  tauri.conf.json: ${prevTauri} → ${version}`);

// 同步 Cargo.toml（替换 [package] 下的 version 行）
let cargo = readFileSync(cargoPath, 'utf8');
const cargoVersionMatch = cargo.match(/^version\s*=\s*"([^"]+)"/m);
const prevCargo = cargoVersionMatch ? cargoVersionMatch[1] : '?';
cargo = cargo.replace(/^(version\s*=\s*)"[^"]+"(\s*$)/m, `$1"${version}"$2`);
writeFileSync(cargoPath, cargo, 'utf8');
console.log(`  Cargo.toml:       ${prevCargo} → ${version}`);

console.log('Done.');
