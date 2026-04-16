import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { SkillMeta } from '../types/index.js';
import { eq } from '../utils/fs.js';
import { parseSkillIdentifier } from '../utils/validate.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * 读取并校验 skill 目录下的 meta.json。
 * `name` 必须与目录文件夹名一致；缺少 `name` / `version` 抛错；多余字段保留。
 */
export function parseMetaJson(skillDir: string): SkillMeta {
  const metaPath = join(skillDir, 'meta.json');
  if (!existsSync(metaPath)) {
    throw new Error(`meta.json not found: ${metaPath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(metaPath, 'utf8')) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid meta.json (${metaPath}): ${msg}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`meta.json must be a JSON object: ${metaPath}`);
  }
  const obj = parsed as Record<string, unknown>;
  if (!isNonEmptyString(obj.name)) {
    throw new Error(`meta.json missing required field "name": ${metaPath}`);
  }
  if (!isNonEmptyString(obj.version)) {
    throw new Error(`meta.json missing required field "version": ${metaPath}`);
  }
  const folderName = basename(skillDir);
  if (obj.name !== folderName) {
    throw new Error(
      `meta.json "name" (${JSON.stringify(obj.name)}) must match folder name (${JSON.stringify(folderName)})`,
    );
  }
  return obj as SkillMeta;
}

function collectSkillMetasFromParent(
  parent: string,
  result: SkillMeta[],
  seenNames: Set<string>,
): void {
  if (!existsSync(parent)) {
    return;
  }
  const dirents = readdirSync(parent, { withFileTypes: true });
  for (const ent of dirents) {
    if (!ent.isDirectory()) continue;
    if (ent.name === '.git') continue;
    const skillDir = join(parent, ent.name);
    try {
      const meta = parseMetaJson(skillDir);
      if (seenNames.has(meta.name)) continue;
      seenNames.add(meta.name);
      result.push(meta);
    } catch {
      // 非法 skill：跳过
    }
  }
}

/**
 * 扫描 Git 缓存根目录：支持 skill 在仓库根下，或在 `skills/` 子目录（常见 monorepo 布局）。
 */
export function scanSkillsFromCache(cacheRoot: string): SkillMeta[] {
  if (!existsSync(cacheRoot)) {
    return [];
  }
  const result: SkillMeta[] = [];
  const seenNames = new Set<string>();
  collectSkillMetasFromParent(cacheRoot, result, seenNames);
  collectSkillMetasFromParent(join(cacheRoot, 'skills'), result, seenNames);
  return result;
}

/**
 * 解析 skill 在缓存中的实际目录（根下或 `skills/<name>`）。
 */
export function getSkillSourceDir(
  cacheRoot: string,
  skillName: string,
): string | null {
  const direct = join(cacheRoot, skillName);
  if (existsSync(join(direct, 'meta.json'))) {
    return direct;
  }
  const nested = join(cacheRoot, 'skills', skillName);
  if (existsSync(join(nested, 'meta.json'))) {
    return nested;
  }
  return null;
}

/**
 * 按 name 或 name@version 在缓存中查找 skill；版本比较使用 major.minor.patch（`eq`）。
 */
export function findSkillInCache(
  cacheRoot: string,
  identifier: string,
): SkillMeta | null {
  const metas = scanSkillsFromCache(cacheRoot);
  const { name, version } = parseSkillIdentifier(identifier.trim());
  if (!name) return null;

  for (const meta of metas) {
    if (meta.name !== name) continue;
    if (version === undefined) {
      return meta;
    }
    if (eq(meta.version, version)) {
      return meta;
    }
  }
  return null;
}

function includesInsensitive(haystack: string, needle: string): boolean {
  const n = needle.toLowerCase();
  // 关键字与待匹配串均做小写化；中文等不受影响，仍可被 includes 匹配
  return haystack.toLowerCase().includes(n);
}

/**
 * name 匹配：无连字符时整串 includes；
 * 有连字符时优先各段 includes；关键字含 `-` 时允许整包名 includes（如搜 commit-helper）；
 * 避免仅用整串 includes 使 react 命中 commit-helper。
 */
function nameMatchesKeyword(name: string, keyword: string): boolean {
  const k = keyword.toLowerCase();
  const lower = name.toLowerCase();
  if (!k) return true;

  if (!name.includes('-')) {
    return lower.includes(k);
  }

  const parts = lower.split('-');
  if (parts.some((part) => part.includes(k))) return true;

  if (keyword.includes('-')) {
    return lower.includes(k);
  }

  return false;
}

/** 在元数据列表中按关键字搜索（不区分大小写），匹配 name / description / tags 任一。 */
export function searchSkills(metas: SkillMeta[], keyword: string): SkillMeta[] {
  const trimmed = keyword.trim();
  if (!trimmed) {
    return metas.slice();
  }
  return metas.filter((meta) => {
    if (nameMatchesKeyword(meta.name, trimmed)) return true;
    if (meta.description && includesInsensitive(meta.description, trimmed)) {
      return true;
    }
    if (
      meta.tags?.some((tag) => includesInsensitive(tag, trimmed)) === true
    ) {
      return true;
    }
    return false;
  });
}
