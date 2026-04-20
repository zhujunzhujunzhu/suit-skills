/**
 * 版本号同步脚本
 * 将 package.json 中的版本号同步到 src-tauri/tauri.conf.json 和 src-tauri/Cargo.toml
 *
 * 用法：node scripts/sync-version.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
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
const tauriConfPath = resolve(root, 'src-tauri', 'tauri.conf.json');
const cargoPath = resolve(root, 'src-tauri', 'Cargo.toml');

const pkg = readJson(pkgPath);
const version = pkg.version;
console.log(`Syncing version: ${version}`);

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
