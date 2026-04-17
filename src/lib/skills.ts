import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { SkillMarkdownMetadata, SkillMeta } from '../types/index.js';
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

function hasSkillEntry(skillDir: string): boolean {
  return (
    existsSync(join(skillDir, 'SKILL.md')) ||
    existsSync(join(skillDir, 'meta.json'))
  );
}

function normalizeTags(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const tags = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    return tags.length > 0 ? tags : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const inline = trimmed.match(/^\[(.*)\]$/);
    if (inline) {
      const tags = inline[1]!
        .split(',')
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      return tags.length > 0 ? tags : undefined;
    }
    return [trimmed];
  }
  return undefined;
}

function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (!value) return '';
  const quoted = value.match(/^['"](.*)['"]$/);
  if (quoted) return quoted[1]!;
  const inlineArray = normalizeTags(value);
  if (value.startsWith('[') && value.endsWith(']')) return inlineArray ?? [];
  return value;
}

export function parseSkillFrontmatter(markdown: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const normalized = markdown.replace(/^\uFEFF/, '');
  if (!normalized.startsWith('---\n') && !normalized.startsWith('---\r\n')) {
    return { frontmatter: {}, body: markdown };
  }

  const newline = normalized.startsWith('---\r\n') ? '\r\n' : '\n';
  const marker = `${newline}---`;
  const end = normalized.indexOf(marker, 3);
  if (end === -1) {
    return { frontmatter: {}, body: markdown };
  }

  const rawFrontmatter = normalized.slice(3 + newline.length, end);
  let bodyStart = end + marker.length;
  if (normalized.slice(bodyStart, bodyStart + 2) === '\r\n') {
    bodyStart += 2;
  } else if (normalized[bodyStart] === '\n') {
    bodyStart += 1;
  }

  const frontmatter: Record<string, unknown> = {};
  const lines = rawFrontmatter.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1]!;
    const rest = match[2]!;
    if (rest.trim() !== '') {
      frontmatter[key] = parseScalar(rest);
      continue;
    }

    const values: string[] = [];
    while (i + 1 < lines.length) {
      const next = lines[i + 1]!;
      const item = next.match(/^\s*-\s*(.*)$/);
      if (!item) break;
      values.push(item[1]!.trim().replace(/^['"]|['"]$/g, ''));
      i += 1;
    }
    frontmatter[key] = values;
  }

  return { frontmatter, body: normalized.slice(bodyStart) };
}

function metaFromFrontmatter(
  skillDir: string,
  frontmatter: Record<string, unknown>,
): SkillMeta | null {
  if (Object.keys(frontmatter).length === 0) return null;
  const folderName = basename(skillDir);
  const name = isNonEmptyString(frontmatter.name)
    ? frontmatter.name
    : folderName;
  const version = isNonEmptyString(frontmatter.version)
    ? frontmatter.version
    : 'unknown';
  const meta: SkillMeta = { name, version };
  if (isNonEmptyString(frontmatter.description)) {
    meta.description = frontmatter.description;
  }
  if (isNonEmptyString(frontmatter.author)) {
    meta.author = frontmatter.author;
  }
  const tags = normalizeTags(frontmatter.tags);
  if (tags) {
    meta.tags = tags;
  }
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!(key in meta)) {
      meta[key] = value;
    }
  }
  return meta;
}

export function readSkillMarkdownMetadata(skillDir: string): SkillMarkdownMetadata {
  const markdownPath = join(skillDir, 'SKILL.md');
  const markdown = existsSync(markdownPath)
    ? readFileSync(markdownPath, 'utf8')
    : '';
  const { frontmatter, body } = parseSkillFrontmatter(markdown);
  const fromFrontmatter = metaFromFrontmatter(skillDir, frontmatter);
  if (fromFrontmatter) {
    return {
      meta: fromFrontmatter,
      frontmatter,
      markdown: body,
      metadataSource: 'skill-md',
    };
  }

  try {
    return {
      meta: parseMetaJson(skillDir),
      frontmatter: {},
      markdown,
      metadataSource: 'meta-json-fallback',
    };
  } catch {
    return {
      meta: { name: basename(skillDir), version: 'unknown' },
      frontmatter: {},
      markdown,
      metadataSource: 'unknown',
    };
  }
}

export function updateSkillMarkdownName(
  skillDir: string,
  folderName: string,
): void {
  const markdownPath = join(skillDir, 'SKILL.md');
  if (!existsSync(markdownPath)) return;
  const markdown = readFileSync(markdownPath, 'utf8');
  const parsed = parseSkillFrontmatter(markdown);
  if (Object.keys(parsed.frontmatter).length === 0) return;
  const nextFrontmatter = { ...parsed.frontmatter, name: folderName };
  const lines: string[] = ['---'];
  for (const [key, value] of Object.entries(nextFrontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${String(item)}`);
      }
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  lines.push('---', '');
  writeFileSync(markdownPath, `${lines.join('\n')}${parsed.body}`, 'utf8');
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
    if (!hasSkillEntry(skillDir)) continue;
    try {
      const metadata = readSkillMarkdownMetadata(skillDir);
      const meta = metadata.meta;
      if (
        meta.version === 'unknown' &&
        metadata.metadataSource === 'unknown' &&
        !existsSync(join(skillDir, 'SKILL.md'))
      ) {
        continue;
      }
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
  if (hasSkillEntry(direct)) {
    return direct;
  }
  const nested = join(cacheRoot, 'skills', skillName);
  if (hasSkillEntry(nested)) {
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
