import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { copyDir } from '../utils/fs.js';
import { ensureDir } from '../utils/path.js';
import {
  findSkillInCache,
  getSkillSourceDir,
  updateSkillMarkdownName,
} from '../skills/index.js';
import { captureInstalledSkillBaseline } from '../baseline/index.js';

export interface ConflictCheckResult {
  conflict: boolean;
  /** 已存在的 skill 目录绝对/相对路径 */
  path?: string;
}

/** 与 `join(targetRoot, skillName)` 一致；去掉 `targetRoot` 尾部斜杠便于跨平台。 */
function joinUnderTarget(targetRoot: string, ...segments: string[]): string {
  const base = targetRoot.replace(/[/\\]+$/, '');
  return join(base, ...segments);
}

/**
 * 检查目标安装根目录下是否已有同名 skill 文件夹。
 */
export function checkConflict(
  targetRoot: string,
  skillName: string,
): ConflictCheckResult {
  const dest = joinUnderTarget(targetRoot, skillName);
  if (existsSync(dest)) {
    return { conflict: true, path: dest };
  }
  return { conflict: false };
}

/**
 * 从缓存安装单个 skill（要求目标目录尚不存在，否则会抛错）。
 * @returns 安装后的 skill 目录路径
 */
export function installSkill(
  cacheRoot: string,
  targetRoot: string,
  identifier: string,
): string {
  const meta = findSkillInCache(cacheRoot, identifier);
  if (!meta) {
    throw new Error(`Skill not found: ${identifier}`);
  }

  const srcDir = getSkillSourceDir(cacheRoot, meta.name);
  if (!srcDir) {
    throw new Error(`Skill not found: ${identifier}`);
  }
  const destDir = joinUnderTarget(targetRoot, meta.name);

  if (existsSync(destDir)) {
    throw new Error(`Target already exists: ${destDir}`);
  }

  ensureDir(joinUnderTarget(targetRoot));
  ensureDir(dirname(destDir));
  copyDir(srcDir, destDir);
  captureInstalledSkillBaseline(destDir, {
    skillName: meta.name,
    installedVersion: meta.version,
  });
  return destDir;
}

export type ConflictResolution = 'overwrite' | 'skip' | 'rename';

export interface InstallWithConflictResult {
  /** 安装后的目录 */
  path?: string;
  skipped?: boolean;
  message?: string;
}

function syncMetaNameWithFolder(skillDir: string, folderName: string): void {
  const p = join(skillDir, 'meta.json');
  if (!existsSync(p)) {
    updateSkillMarkdownName(skillDir, folderName);
    return;
  }
  const raw = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
  raw.name = folderName;
  writeFileSync(p, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  updateSkillMarkdownName(skillDir, folderName);
}

/**
 * 带冲突策略的安装：`overwrite` / `skip` / `rename`（重命名文件夹为 `name-1`、`name-2`…）。
 */
export function installSkillWithConflict(
  cacheRoot: string,
  targetRoot: string,
  identifier: string,
  resolution: ConflictResolution,
): InstallWithConflictResult {
  const meta = findSkillInCache(cacheRoot, identifier);
  if (!meta) {
    throw new Error(`Skill not found: ${identifier}`);
  }

  const skillName = meta.name;
  const { conflict, path: conflictPath } = checkConflict(targetRoot, skillName);

  if (!conflict) {
    const dest = installSkill(cacheRoot, targetRoot, identifier);
    return { path: dest };
  }

  if (resolution === 'skip') {
    return {
      skipped: true,
      message: `Skipped: ${skillName} already installed`,
    };
  }

  if (resolution === 'overwrite') {
    if (conflictPath) {
      rmSync(conflictPath, { recursive: true, force: true });
    }
    const dest = installSkill(cacheRoot, targetRoot, identifier);
    return { path: dest };
  }

  let n = 1;
  let newName: string;
  do {
    newName = `${skillName}-${n}`;
    n += 1;
  } while (existsSync(joinUnderTarget(targetRoot, newName)));

  const srcDir = getSkillSourceDir(cacheRoot, skillName);
  if (!srcDir) {
    throw new Error(`Skill not found: ${identifier}`);
  }
  const destDir = joinUnderTarget(targetRoot, newName);
  ensureDir(joinUnderTarget(targetRoot));
  copyDir(srcDir, destDir);
  syncMetaNameWithFolder(destDir, newName);
  captureInstalledSkillBaseline(destDir, {
    skillName: newName,
    installedVersion: meta.version,
  });
  return { path: destDir };
}
