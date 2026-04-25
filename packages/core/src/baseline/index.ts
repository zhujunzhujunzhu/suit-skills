import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import type { ConfigLocationOptions } from '../config/index.js';
import { getBaselinesDir } from '../cache/index.js';
import { ensureDir } from '../utils/path.js';

const BASELINE_META_FILE = 'meta.json';
const BASELINE_SNAPSHOT_DIR = 'snapshot';

export interface InstalledSkillBaselineMeta {
  createdAt: string;
  skillName?: string;
  sourceName?: string;
  installedVersion?: string;
  skillPath: string;
}

function normalizeBaselineKeyPath(skillPath: string): string {
  const resolved = resolve(skillPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function getInstalledSkillRealPath(skillPath: string): string {
  return realpathSync.native(skillPath);
}

export function getInstalledSkillBaselineKey(skillPath: string): string {
  const canonicalPath = normalizeBaselineKeyPath(getInstalledSkillRealPath(skillPath));
  return createHash('sha256').update(canonicalPath).digest('hex');
}

function getInstalledSkillBaselineRoot(
  skillPath: string,
  options?: ConfigLocationOptions,
): string {
  return join(getBaselinesDir(options), getInstalledSkillBaselineKey(skillPath));
}

function getInstalledSkillBaselineSnapshotDir(
  skillPath: string,
  options?: ConfigLocationOptions,
): string {
  return join(
    getInstalledSkillBaselineRoot(skillPath, options),
    BASELINE_SNAPSHOT_DIR,
  );
}

function getInstalledSkillBaselineMetaPath(
  skillPath: string,
  options?: ConfigLocationOptions,
): string {
  return join(
    getInstalledSkillBaselineRoot(skillPath, options),
    BASELINE_META_FILE,
  );
}

function copyDirectoryContents(sourceDir: string, targetDir: string): void {
  ensureDir(targetDir);
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    cpSync(join(sourceDir, entry.name), join(targetDir, entry.name), {
      recursive: true,
    });
  }
}

function clearDirectory(dirPath: string): void {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    rmSync(join(dirPath, entry.name), { recursive: true, force: true });
  }
}

function safeRelativePath(root: string, filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const absolutePath = resolve(join(root, normalizedPath));
  const rel = relative(resolve(root), absolutePath);
  if (!normalizedPath || rel.startsWith('..') || rel === '') {
    if (normalizedPath) {
      throw new Error(`File path is outside skill directory: ${filePath}`);
    }
    throw new Error('File path is required');
  }
  return normalizedPath;
}

export function hasInstalledSkillBaseline(
  skillPath: string,
  options?: ConfigLocationOptions,
): boolean {
  return existsSync(getInstalledSkillBaselineSnapshotDir(skillPath, options));
}

export function readInstalledSkillBaselineMeta(
  skillPath: string,
  options?: ConfigLocationOptions,
): InstalledSkillBaselineMeta | null {
  const metaPath = getInstalledSkillBaselineMetaPath(skillPath, options);
  if (!existsSync(metaPath)) {
    return null;
  }
  return JSON.parse(readFileSync(metaPath, 'utf8')) as InstalledSkillBaselineMeta;
}

export function captureInstalledSkillBaseline(
  skillPath: string,
  meta: Omit<InstalledSkillBaselineMeta, 'createdAt' | 'skillPath'> = {},
  options?: ConfigLocationOptions,
): void {
  const realSkillPath = getInstalledSkillRealPath(skillPath);
  const baselineRoot = getInstalledSkillBaselineRoot(realSkillPath, options);
  const snapshotDir = getInstalledSkillBaselineSnapshotDir(realSkillPath, options);
  ensureDir(baselineRoot);
  rmSync(snapshotDir, { recursive: true, force: true });
  mkdirSync(snapshotDir, { recursive: true });
  copyDirectoryContents(realSkillPath, snapshotDir);
  writeFileSync(
    getInstalledSkillBaselineMetaPath(realSkillPath, options),
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        skillPath: realSkillPath,
        ...meta,
      } satisfies InstalledSkillBaselineMeta,
      null,
      2,
    )}\n`,
    'utf8',
  );
}

export function restoreInstalledSkillFileFromBaseline(
  skillPath: string,
  filePath: string,
  options?: ConfigLocationOptions,
): 'reset' | 'removed' {
  const realSkillPath = getInstalledSkillRealPath(skillPath);
  const relativePath = safeRelativePath(realSkillPath, filePath);
  const snapshotDir = getInstalledSkillBaselineSnapshotDir(realSkillPath, options);
  if (!existsSync(snapshotDir)) {
    throw new Error('Baseline snapshot not found');
  }

  const currentPath = join(realSkillPath, relativePath);
  const baselinePath = join(snapshotDir, relativePath);
  if (existsSync(baselinePath)) {
    ensureDir(dirname(currentPath));
    cpSync(baselinePath, currentPath, { recursive: true });
    return 'reset';
  }

  if (existsSync(currentPath)) {
    rmSync(currentPath, { recursive: true, force: true });
    return 'removed';
  }

  throw new Error('File not found in current skill or baseline snapshot');
}

export function restoreInstalledSkillFromBaseline(
  skillPath: string,
  options?: ConfigLocationOptions,
): void {
  const realSkillPath = getInstalledSkillRealPath(skillPath);
  const snapshotDir = getInstalledSkillBaselineSnapshotDir(realSkillPath, options);
  if (!existsSync(snapshotDir)) {
    throw new Error('Baseline snapshot not found');
  }

  clearDirectory(realSkillPath);
  copyDirectoryContents(snapshotDir, realSkillPath);
}
