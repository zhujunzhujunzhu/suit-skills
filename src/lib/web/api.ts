import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  realpathSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import type { CliContext } from '../../cli/context.js';
import {
  assertSourceExists,
  findSourceByName,
  tagMatches,
} from '../../cli/helpers.js';
import { toAbsoluteInstallRoot } from '../../cli/paths.js';
import { getInstalledSkills } from '../agents.js';
import { getSourceCacheDir } from '../cache.js';
import {
  getEffectiveSourceUrl,
  getBuiltinSourceInfo,
  getSourceRefreshMaxAgeMs,
  normalizeAppSettings,
  restoreBuiltinSources,
  type BuiltinSourceCategory,
} from '../config.js';
import {
  BUILTIN_INSTALL_TARGET_IDS,
  labelForUiInstallTarget,
  parseInstallTargetsCsv,
  resolveDisplayPathForToken,
  SKILLS_TARGET_TOKEN,
  UI_HIDDEN_INSTALL_TARGET_IDS,
} from '../install-targets.js';
import { createSymlink } from '../../utils/fs.js';
import {
  type ConflictResolution,
  installSkillWithConflict,
} from '../install.js';
import {
  readSkillMarkdownMetadata,
  searchSkills,
} from '../skills.js';
import type {
  AgentMapping,
  AppSettings,
  Config,
  MetadataSource,
  SkillMeta,
  Source,
  WebInstalledSkill,
  WebInstallTarget,
  WebSkillLibraryTarget,
  WebSkillDetail,
  WebSkillSummary,
} from '../../types/index.js';
import { parseSkillIdentifier, validateSkillName } from '../../utils/validate.js';
import { createZipFromDirectory } from './zip.js';

export type {
  WebInstalledSkill,
  WebSkillDetail,
  WebSkillSummary,
} from '../../types/index.js';

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class WebApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface WebInstallRequest {
  identifier: string;
  source?: string;
  targets?: string[];
  global?: boolean;
  strategy?: ConflictResolution;
}

export interface WebInstallResult {
  target: string;
  scope: 'project' | 'global';
  status: 'installed' | 'skipped';
  path?: string;
  message?: string;
}

export interface WebRemoveRequest {
  target: string;
  scope?: 'project' | 'global';
}

export interface WebExportRequest {
  name: string;
  target: string;
  scope?: 'project' | 'global';
}

export interface WebCopyPackageResult {
  status: 'copied';
  fileName: string;
  path: string;
}

export interface WebExportResult {
  fileName: string;
  contentType: string;
  body: Buffer;
}

export interface WebLinkTargetsRequest {
  name: string;
  target: string;
  scope?: 'project' | 'global';
  targets: string[];
}

export interface WebLinkTargetsResult {
  results: {
    target: string;
    scope: 'project' | 'global';
    status: 'linked' | 'skipped';
    path: string;
    message?: string;
  }[];
}

export interface WebAddSourceRequest {
  name: string;
  url: string;
}

export interface WebUpdateSourceRequest {
  enabled?: boolean;
  domesticMirror?: {
    enabled?: boolean;
  };
}

export interface WebSource extends Source {
  builtin: boolean;
  label: string;
  category: BuiltinSourceCategory | 'custom';
  description: string;
  effectiveUrl: string;
}

export interface WebSourcesResponse {
  defaultSource: string;
  sources: WebSource[];
}

export interface WebSourceWarning {
  sourceName: string;
  url: string;
  message: string;
  usingCache: boolean;
}

export interface WebSkillsResponse {
  items: WebSkillSummary[];
  warnings: WebSourceWarning[];
}

interface SkillSourceRow {
  meta: SkillMeta;
  sourceName: string;
  skillDir: string;
  frontmatter: Record<string, unknown>;
  markdown: string;
  metadataSource: MetadataSource;
}

const sourceRowsCache = new WeakMap<
  CliContext,
  Map<string, { expiresAt: number; rows: SkillSourceRow[] }>
>();
const installedTargetsIndexCache = new WeakMap<
  CliContext,
  { expiresAt: number; value: Map<string, string[]> }
>();
const INSTALLED_TARGETS_INDEX_TTL_MS = 1_000;

function toSourceWarning(
  source: Source,
  message: string,
  usingCache: boolean,
): WebSourceWarning {
  return {
    sourceName: source.name,
    url: getEffectiveSourceUrl(source),
    message,
    usingCache,
  };
}

function refreshSourceForWeb(
  ctx: CliContext,
  source: Source,
): ReturnType<CliContext['refreshForSource']> {
  try {
    return ctx.refreshForSource(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WebApiError(
      'SOURCE_REFRESH_FAILED',
      `Failed to refresh source "${source.name}" (${getEffectiveSourceUrl(source)}): ${message}`,
      message.includes('timed out') ? 504 : 502,
      toSourceWarning(source, message, false),
    );
  }
}

function getRowsCacheForContext(
  ctx: CliContext,
): Map<string, { expiresAt: number; rows: SkillSourceRow[] }> {
  let cache = sourceRowsCache.get(ctx);
  if (!cache) {
    cache = new Map();
    sourceRowsCache.set(ctx, cache);
  }
  return cache;
}

function listKnownInstallTargets(config: Config): string[] {
  return [SKILLS_TARGET_TOKEN, ...Object.keys(config.agents)];
}

function clearInstalledTargetsIndex(ctx: CliContext): void {
  installedTargetsIndexCache.delete(ctx);
}

function metadataText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return undefined;
}

function normalizeWebTags(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const tags = value
      .map(metadataText)
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    return tags.length > 0 ? tags : undefined;
  }
  const tag = metadataText(value)?.trim();
  return tag ? [tag] : undefined;
}

function normalizeWebMeta(meta: SkillMeta): SkillMeta {
  const normalized: SkillMeta = {
    ...meta,
    name: metadataText(meta.name) ?? '',
    version: metadataText(meta.version) ?? 'unknown',
  };
  const description = metadataText(meta.description)?.trim();
  if (description) {
    normalized.description = description;
  } else {
    delete normalized.description;
  }
  const author = metadataText(meta.author)?.trim();
  if (author) {
    normalized.author = author;
  } else {
    delete normalized.author;
  }
  const tags = normalizeWebTags(meta.tags);
  if (tags) {
    normalized.tags = tags;
  } else {
    delete normalized.tags;
  }
  return normalized;
}

type InstalledScope = 'project' | 'global';

function listScopesForFilter(scope: string | undefined): InstalledScope[] {
  if (scope === undefined || scope === '' || scope === 'all') {
    return ['global', 'project'];
  }
  if (scope === 'project' || scope === 'global') {
    return [scope];
  }
  throw new WebApiError('INVALID_SCOPE', `Invalid scope: ${scope}`, 400);
}

function assertValidScope(scope: string | undefined): 'project' | 'global' {
  if (scope === undefined || scope === '' || scope === 'project') {
    return 'project';
  }
  if (scope === 'global') {
    return 'global';
  }
  throw new WebApiError('INVALID_SCOPE', `Invalid scope: ${scope}`, 400);
}

function assertValidTarget(config: Config, target: string): string {
  if (!target) {
    throw new WebApiError('INVALID_TARGET', 'Install target is required', 400);
  }
  if (target === SKILLS_TARGET_TOKEN || config.agents[target]) {
    return target;
  }
  throw new WebApiError(
    'INVALID_TARGET',
    `Unknown install target: ${target}`,
    400,
  );
}

function getTargetRoot(
  ctx: CliContext,
  config: Config,
  target: string,
  isGlobal: boolean,
): string {
  const display = resolveDisplayPathForToken(config, target, isGlobal);
  return toAbsoluteInstallRoot(display, ctx.cwd, ctx.userHome);
}

function isInsidePath(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel));
}

function assertInstalledSkillPathAllowed(
  root: string,
  skillPath: string,
): void {
  if (!isInsidePath(root, skillPath)) {
    throw new WebApiError(
      'PATH_NOT_ALLOWED',
      'Resolved skill path is outside the install target',
      403,
      { root, skillPath },
    );
  }
}

function getInstalledSkillPath(
  ctx: CliContext,
  config: Config,
  name: string,
  target: string,
  scope: 'project' | 'global',
): { root: string; skillPath: string } {
  assertValidTarget(config, target);
  const root = getTargetRoot(ctx, config, target, scope === 'global');
  const skillPath = join(root, name);
  assertInstalledSkillPathAllowed(root, skillPath);
  return { root, skillPath };
}

function getInstalledTargetsForSkill(
  ctx: CliContext,
  config: Config,
  skillName: string,
): string[] {
  return [...(getInstalledTargetsIndex(ctx, config).get(skillName) ?? [])];
}

function addInstalledTarget(
  installed: Map<string, string[]>,
  name: string,
  targetLabel: string,
): void {
  const current = installed.get(name);
  if (current) {
    current.push(targetLabel);
    return;
  }
  installed.set(name, [targetLabel]);
}

function buildInstalledTargetsIndex(
  ctx: CliContext,
  config: Config,
): Map<string, string[]> {
  const installed = new Map<string, string[]>();
  for (const scope of [false, true]) {
    for (const target of listKnownInstallTargets(config)) {
      const root = getTargetRoot(ctx, config, target, scope);
      const targetLabel = scope ? `${target}:global` : target;
      for (const name of getInstalledSkills(root)) {
        addInstalledTarget(installed, name, targetLabel);
      }
    }
  }
  return installed;
}

function getInstalledTargetsIndex(
  ctx: CliContext,
  config: Config,
): Map<string, string[]> {
  const now = Date.now();
  const cached = installedTargetsIndexCache.get(ctx);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const value = buildInstalledTargetsIndex(ctx, config);
  installedTargetsIndexCache.set(ctx, {
    expiresAt: now + INSTALLED_TARGETS_INDEX_TTL_MS,
    value,
  });
  return value;
}

function hasSkillEntry(skillDir: string): boolean {
  return (
    existsSync(join(skillDir, 'SKILL.md')) ||
    existsSync(join(skillDir, 'meta.json'))
  );
}

function collectSkillRowsFromParent(
  parent: string,
  sourceName: string,
  rows: SkillSourceRow[],
  seenNames: Set<string>,
): void {
  if (!existsSync(parent)) {
    return;
  }
  for (const ent of readdirSync(parent, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name === '.git') {
      continue;
    }
    const skillDir = join(parent, ent.name);
    if (!hasSkillEntry(skillDir)) {
      continue;
    }
    const metadata = readSkillMarkdownMetadata(skillDir);
    if (
      metadata.meta.version === 'unknown' &&
      metadata.metadataSource === 'unknown' &&
      !existsSync(join(skillDir, 'SKILL.md'))
    ) {
      continue;
    }
    if (seenNames.has(metadata.meta.name)) {
      continue;
    }
    seenNames.add(metadata.meta.name);
    rows.push({
      meta: metadata.meta,
      sourceName,
      skillDir,
      frontmatter: metadata.frontmatter,
      markdown: metadata.markdown,
      metadataSource: metadata.metadataSource,
    });
  }
}

function scanSourceRows(
  cacheRoot: string,
  sourceName: string,
): SkillSourceRow[] {
  const rows: SkillSourceRow[] = [];
  const seenNames = new Set<string>();
  collectSkillRowsFromParent(cacheRoot, sourceName, rows, seenNames);
  collectSkillRowsFromParent(join(cacheRoot, 'skills'), sourceName, rows, seenNames);
  return rows;
}

function sourceCacheFallbackPaths(ctx: CliContext, source: Source): string[] {
  const urls = [
    getEffectiveSourceUrl(source),
    source.url,
    source.domesticMirror?.url,
  ].filter((url): url is string => typeof url === 'string' && url.trim() !== '');
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const url of urls) {
    const cachePath = getSourceCacheDir(url, ctx.configOptions);
    const key = process.platform === 'win32' ? cachePath.toLowerCase() : cachePath;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    paths.push(cachePath);
  }
  return paths;
}

function findCachedRowsForSource(
  ctx: CliContext,
  source: Source,
): { path: string; rows: SkillSourceRow[] } | null {
  for (const cachePath of sourceCacheFallbackPaths(ctx, source)) {
    const rows = scanSourceRows(cachePath, source.name);
    if (rows.length > 0) {
      return { path: cachePath, rows };
    }
  }
  return null;
}

function rowsForSingleSource(
  ctx: CliContext,
  source: Source,
  forceRefresh = false,
  maxAgeMs = 0,
): { rows: SkillSourceRow[]; warnings: WebSourceWarning[] } {
  const cache = getRowsCacheForContext(ctx);
  const cacheKey = `${source.name}\0${getEffectiveSourceUrl(source)}`;
  const cached = cache.get(cacheKey);
  if (cached && !forceRefresh && cached.expiresAt > Date.now()) {
    return { rows: cached.rows, warnings: [] };
  }
  let refresh: ReturnType<CliContext['refreshForSource']>;
  try {
    refresh = refreshSourceForWeb(ctx, source);
  } catch (error) {
    if (error instanceof WebApiError) {
      const fallback = findCachedRowsForSource(ctx, source);
      if (fallback) {
        cache.set(cacheKey, {
          expiresAt: Date.now() + maxAgeMs,
          rows: fallback.rows,
        });
        return {
          rows: fallback.rows,
          warnings: [
            toSourceWarning(
              source,
              `${error.message} Using local cache at ${fallback.path}.`,
              true,
            ),
          ],
        };
      }
    }
    throw error;
  }
  const rows = scanSourceRows(refresh.path, source.name);
  cache.set(cacheKey, {
    expiresAt: Date.now() + maxAgeMs,
    rows,
  });
  return {
    rows,
    warnings:
      'warning' in refresh && refresh.warning
        ? [toSourceWarning(source, refresh.warning, true)]
        : [],
  };
}

function sourcesForFilter(config: Config, sourceFilter: string): Source[] {
  if (sourceFilter !== 'all') {
    return [assertSourceExists(config, sourceFilter)];
  }
  return config.sources.filter((source) => source.enabled);
}

function rowsForSource(
  ctx: CliContext,
  config: Config,
  sourceFilter: string,
  forceRefresh = false,
): { rows: SkillSourceRow[]; warnings: WebSourceWarning[] } {
  try {
    const sources = sourcesForFilter(config, sourceFilter);
    const rows: SkillSourceRow[] = [];
    const warnings: WebSourceWarning[] = [];
    const seenNames = new Set<string>();
    const maxAgeMs = getSourceRefreshMaxAgeMs(config);
    for (const source of sources) {
      try {
        const result = rowsForSingleSource(ctx, source, forceRefresh, maxAgeMs);
        warnings.push(...result.warnings);
        for (const row of result.rows) {
          if (seenNames.has(row.meta.name)) {
            continue;
          }
          seenNames.add(row.meta.name);
          rows.push(row);
        }
      } catch (error) {
        if (
          sourceFilter === 'all' &&
          error instanceof WebApiError &&
          error.code === 'SOURCE_REFRESH_FAILED'
        ) {
          warnings.push(
            error.details &&
              typeof error.details === 'object' &&
              'sourceName' in error.details
              ? (error.details as WebSourceWarning)
              : toSourceWarning(source, error.message, false),
          );
          continue;
        }
        throw error;
      }
    }
    return { rows, warnings };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Source not found') {
      throw new WebApiError('SOURCE_NOT_FOUND', msg, 404);
    }
    throw e;
  }
}

function rowsOnlyForSource(
  ctx: CliContext,
  config: Config,
  sourceFilter: string,
  forceRefresh = false,
): SkillSourceRow[] {
  return rowsForSource(ctx, config, sourceFilter, forceRefresh).rows;
}

function findSkillRow(
  ctx: CliContext,
  config: Config,
  sourceFilter: string,
  skillName: string,
): {
  meta: SkillMeta;
  sourceName: string;
  skillDir: string;
  frontmatter: Record<string, unknown>;
  markdown: string;
  metadataSource: MetadataSource;
} | null {
  for (const row of rowsOnlyForSource(ctx, config, sourceFilter)) {
    if (row.meta.name !== skillName) {
      continue;
    }
    return {
      meta: row.meta,
      sourceName: row.sourceName,
      skillDir: row.skillDir,
      frontmatter: row.frontmatter,
      markdown: row.markdown,
      metadataSource: row.metadataSource,
    };
  }
  return null;
}

function sourceNameIndexForInstalledSkills(
  ctx: CliContext,
  config: Config,
): Map<string, string> {
  try {
    return new Map(
      rowsOnlyForSource(ctx, config, 'all').map((row) => [
        row.meta.name,
        row.sourceName,
      ]),
    );
  } catch {
    return new Map();
  }
}

function installedMatches(item: WebInstalledSkill, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystacks = [
    item.name,
    item.version,
    item.description,
    item.path,
    item.target,
    item.scope,
    item.sourceName,
    ...(item.tags ?? []),
  ].filter((value): value is string => typeof value === 'string');
  return haystacks.some((value) => value.toLowerCase().includes(needle));
}

function installedDedupeKey(root: string, name: string): string {
  const key = `${resolve(root)}\0${name}`;
  return process.platform === 'win32' ? key.toLowerCase() : key;
}

export function listWebSkills(
  ctx: CliContext,
  options: { source?: string; q?: string; tag?: string; refresh?: boolean },
): WebSkillsResponse {
  const config = ctx.loadConfig();
  const sourceFilter = options.source ?? 'all';
  const result = rowsForSource(
    ctx,
    config,
    sourceFilter,
    options.refresh === true,
  );
  let rows = result.rows;

  if (options.q?.trim()) {
    const found = new Set(
      searchSkills(
        rows.map((row) => row.meta),
        options.q,
      ).map((meta) => meta.name),
    );
    rows = rows.filter((row) => found.has(row.meta.name));
  }

  if (options.tag?.trim()) {
    rows = rows.filter((row) => tagMatches(row.meta, options.tag!));
  }

  const installedTargetsIndex = getInstalledTargetsIndex(ctx, config);
  return {
    warnings: result.warnings,
    items: rows.map((row) => {
      const skillKey = basename(row.skillDir);
      const meta = normalizeWebMeta(row.meta);
      const displayName = meta.name.trim() !== '' ? meta.name : skillKey;
      const { sourceName } = row;
      const installedTargets = installedTargetsIndex.get(skillKey) ?? [];
      return {
        ...meta,
        name: displayName,
        sourceName,
        installed: installedTargets.length > 0,
        installedTargets,
        metadataSource: row.metadataSource,
      };
    }),
  };
}

export function getWebSkillDetail(
  ctx: CliContext,
  skillName: string,
  options: { source?: string },
): WebSkillDetail {
  if (!validateSkillName(skillName)) {
    throw new WebApiError('INVALID_SKILL_NAME', 'Invalid skill name', 400);
  }

  const config = ctx.loadConfig();
  const sourceFilter = options.source ?? 'all';
  const hit = findSkillRow(ctx, config, sourceFilter, skillName);
  if (!hit) {
    throw new WebApiError('SKILL_NOT_FOUND', 'Skill not found', 404);
  }
  const meta = normalizeWebMeta(hit.meta);
  const skillKey = basename(hit.skillDir);
  const displayName = meta.name.trim() !== '' ? meta.name : skillKey;

  return {
    ...meta,
    name: displayName,
    sourceName: hit.sourceName,
    skillDir: hit.skillDir,
    markdown: hit.markdown,
    frontmatter: hit.frontmatter,
    installedTargets: getInstalledTargetsForSkill(ctx, config, skillKey),
    metadataSource: hit.metadataSource,
  };
}

export function listWebInstalledSkills(
  ctx: CliContext,
  options: { scope?: string; target?: string; agent?: string; q?: string },
): { items: WebInstalledSkill[] } {
  const config = ctx.loadConfig();
  const scopes = listScopesForFilter(options.scope);
  const targetFilter = options.target ?? options.agent;
  const targets = targetFilter
    ? [assertValidTarget(config, targetFilter)]
    : listKnownInstallTargets(config);
  const items: WebInstalledSkill[] = [];
  const seen = new Set<string>();
  const sourceNameBySkill = sourceNameIndexForInstalledSkills(ctx, config);

  for (const scope of scopes) {
    for (const target of targets) {
      const root = getTargetRoot(ctx, config, target, scope === 'global');
      for (const name of getInstalledSkills(root)) {
        const key = installedDedupeKey(root, name);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const skillPath = join(root, name);
        assertInstalledSkillPathAllowed(root, skillPath);
        const metadata = readSkillMarkdownMetadata(skillPath);
        const meta = normalizeWebMeta(metadata.meta);
        const item: WebInstalledSkill = {
          ...meta,
          name: meta.name || name,
          target,
          scope,
          path: skillPath,
          sourceName:
            sourceNameBySkill.get(meta.name) ??
            sourceNameBySkill.get(name),
          metadataSource: metadata.metadataSource,
        };
        if (installedMatches(item, options.q ?? '')) {
          items.push(item);
        }
      }
    }
  }

  return { items };
}

function decorateWebSource(source: Source): WebSource {
  const builtin = getBuiltinSourceInfo(source);
  if (!builtin) {
    return {
      ...source,
      builtin: false,
      label: source.name,
      category: 'custom',
      description: 'User-defined skill source.',
      effectiveUrl: getEffectiveSourceUrl(source),
    };
  }
  return {
    ...source,
    builtin: true,
    label: builtin.label,
    category: builtin.category,
    description: builtin.description,
    effectiveUrl: getEffectiveSourceUrl(source),
  };
}

function sourcesResponse(config: Config): WebSourcesResponse {
  return {
    defaultSource: config.defaultSource,
    sources: config.sources.map(decorateWebSource),
  };
}

export function getWebSettings(ctx: CliContext): AppSettings {
  return normalizeAppSettings(ctx.loadConfig().settings);
}

export function updateWebSettings(
  ctx: CliContext,
  request: Partial<AppSettings>,
): AppSettings {
  const config = ctx.loadConfig();
  const current = normalizeAppSettings(config.settings);
  config.settings = normalizeAppSettings({
    ...current,
    ...request,
  });
  ctx.saveConfig(config);
  sourceRowsCache.delete(ctx);
  return config.settings;
}

export function listWebSources(ctx: CliContext): WebSourcesResponse {
  const config = ctx.loadConfig();
  return sourcesResponse(config);
}

function normalizeSourceName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new WebApiError('INVALID_SOURCE_NAME', 'Source name is required', 400);
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new WebApiError('INVALID_SOURCE_NAME', 'Source name is required', 400);
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    throw new WebApiError(
      'INVALID_SOURCE_NAME',
      'Source name may only contain letters, numbers, dot, underscore, and dash',
      400,
    );
  }
  return trimmed;
}

function normalizeSourceUrl(url: unknown): string {
  if (typeof url !== 'string') {
    throw new WebApiError('INVALID_SOURCE_URL', 'Source URL is required', 400);
  }
  const trimmed = url.trim();
  if (!trimmed) {
    throw new WebApiError('INVALID_SOURCE_URL', 'Source URL is required', 400);
  }
  return trimmed;
}

export function addWebSource(
  ctx: CliContext,
  request: WebAddSourceRequest,
): WebSourcesResponse & { source: WebSource } {
  const config = ctx.loadConfig();
  const name = normalizeSourceName(request.name);
  const url = normalizeSourceUrl(request.url);
  if (findSourceByName(config, name)) {
    throw new WebApiError('SOURCE_ALREADY_EXISTS', 'Source already exists', 409);
  }
  if (config.sources.some((source) => source.url.trim() === url)) {
    throw new WebApiError('SOURCE_ALREADY_EXISTS', 'Source already exists', 409);
  }
  const source: Source = { name, url, enabled: true };
  config.sources.push(source);
  ctx.saveConfig(config);
  getRowsCacheForContext(ctx).clear();
  return { ...sourcesResponse(config), source: decorateWebSource(source) };
}

export function restoreWebBuiltinSources(
  ctx: CliContext,
): WebSourcesResponse & { added: string[] } {
  const config = ctx.loadConfig();
  const added = restoreBuiltinSources(config);
  ctx.saveConfig(config);
  getRowsCacheForContext(ctx).clear();
  return {
    added,
    ...sourcesResponse(config),
  };
}

export function removeWebSource(
  ctx: CliContext,
  name: string,
): WebSourcesResponse & { removed: string } {
  const config = ctx.loadConfig();
  const sourceName = normalizeSourceName(name);
  if (sourceName === 'default' || config.defaultSource === sourceName) {
    throw new WebApiError(
      'CANNOT_REMOVE_DEFAULT_SOURCE',
      'Cannot remove default source',
      400,
    );
  }
  const index = config.sources.findIndex((source) => source.name === sourceName);
  if (index === -1) {
    throw new WebApiError('SOURCE_NOT_FOUND', 'Source not found', 404);
  }
  const source = config.sources[index]!;
  const enabledCount = config.sources.filter((item) => item.enabled).length;
  if (source.enabled && enabledCount <= 1) {
    throw new WebApiError(
      'CANNOT_REMOVE_LAST_ENABLED_SOURCE',
      'Cannot remove the last enabled source',
      400,
    );
  }
  config.sources.splice(index, 1);
  ctx.saveConfig(config);
  getRowsCacheForContext(ctx).clear();
  return { ...sourcesResponse(config), removed: sourceName };
}

export function updateWebSource(
  ctx: CliContext,
  name: string,
  request: WebUpdateSourceRequest,
): WebSourcesResponse & { source: WebSource } {
  const config = ctx.loadConfig();
  const sourceName = normalizeSourceName(name);
  const source = findSourceByName(config, sourceName);
  if (!source) {
    throw new WebApiError('SOURCE_NOT_FOUND', 'Source not found', 404);
  }
  if (typeof request.enabled === 'boolean') {
    const enabledCount = config.sources.filter((item) => item.enabled).length;
    if (source.enabled && request.enabled === false && enabledCount <= 1) {
      throw new WebApiError(
        'CANNOT_DISABLE_LAST_ENABLED_SOURCE',
        'Cannot disable the last enabled source',
        400,
      );
    }
    source.enabled = request.enabled;
  }
  if (
    source.domesticMirror &&
    typeof request.domesticMirror?.enabled === 'boolean'
  ) {
    source.domesticMirror.enabled = request.domesticMirror.enabled;
  }
  ctx.saveConfig(config);
  getRowsCacheForContext(ctx).clear();
  return { ...sourcesResponse(config), source: decorateWebSource(source) };
}

export function generateNpxInstallCommand(options: {
  skillName: string;
  source?: string;
  agent?: string;
  env?: string[];
  global?: boolean;
}): string {
  const parts = ['npx', 'suit-skills@latest', 'install', options.skillName];
  if (options.source) {
    parts.push('--source', options.source);
  }
  if (options.agent) {
    parts.push('--agent', options.agent);
  }
  if (options.env?.length) {
    parts.push('--env', options.env.join(','));
  }
  if (options.global) {
    parts.push('--global');
  }
  return parts.join(' ');
}

export function installWebSkill(
  ctx: CliContext,
  request: WebInstallRequest,
): { results: WebInstallResult[] } {
  const config = ctx.loadConfig();
  const identifier = request.identifier?.trim();
  if (!identifier) {
    throw new WebApiError('INVALID_SKILL_NAME', 'Skill name is required', 400);
  }
  const parsed = parseSkillIdentifier(identifier);
  if (!validateSkillName(parsed.name)) {
    throw new WebApiError('INVALID_SKILL_NAME', 'Invalid skill name', 400);
  }

  const sourceName = request.source ?? config.defaultSource;
  let source;
  try {
    source = assertSourceExists(config, sourceName);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Source not found') {
      throw new WebApiError('SOURCE_NOT_FOUND', msg, 404);
    }
    throw e;
  }
  const targets = request.targets?.length
    ? request.targets.map((target) => assertValidTarget(config, target))
    : parseInstallTargetsCsv('agents', config);
  const strategy = request.strategy ?? 'skip';
  if (!['overwrite', 'skip', 'rename'].includes(strategy)) {
    throw new WebApiError(
      'INVALID_INSTALL_STRATEGY',
      `Invalid install strategy: ${strategy}`,
      400,
    );
  }

  const refresh = refreshSourceForWeb(ctx, source);
  const isGlobal = request.global === true;
  const scope = isGlobal ? 'global' : 'project';
  const results: WebInstallResult[] = [];

  // 全局 ~/.agents/skills 与项目 ./.agents/skills：先安装到中央存储，再为其它目标创建软链接
  const centralRoot = getTargetRoot(ctx, config, 'agents', isGlobal);
  let centralResult: { path?: string; skipped?: boolean; message?: string };
  try {
    centralResult = installSkillWithConflict(
      refresh.path,
      centralRoot,
      identifier,
      strategy,
    );
    if (centralResult.skipped) {
      results.push({
        target: 'agents',
        scope,
        status: 'skipped',
        path: centralResult.path,
        message: centralResult.message,
      });
      return { results };
    }
    results.push({
      target: 'agents',
      scope,
      status: 'installed',
      path: centralResult.path,
      message: centralResult.message,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('Skill not found')) {
      throw new WebApiError('SKILL_NOT_FOUND', message, 404);
    }
    throw new WebApiError('INSTALL_FAILED', message, 500);
  }

  const centralSkillPath = centralResult.path;
  if (!centralSkillPath) {
    return { results };
  }

  const skillName = parsed.name;
  for (const target of targets) {
    if (target === 'agents') {
      continue;
    }
    const targetRoot = getTargetRoot(ctx, config, target, isGlobal);
    const linkPath = join(targetRoot, skillName);
    if (resolve(centralSkillPath) === resolve(linkPath)) {
      continue;
    }
    try {
      createSymlink(centralSkillPath, linkPath);
      results.push({
        target,
        scope,
        status: 'installed',
        path: linkPath,
        message: `Linked to ${centralSkillPath}`,
      });
    } catch (e) {
      results.push({
        target,
        scope,
        status: 'skipped',
        path: linkPath,
        message: `Failed to create symlink: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  clearInstalledTargetsIndex(ctx);
  return { results };
}

export function removeWebInstalledSkill(
  ctx: CliContext,
  name: string,
  request: WebRemoveRequest,
): {
  status: 'removed';
  name: string;
  target: string;
  scope: 'project' | 'global';
  path: string;
} {
  if (!validateSkillName(name)) {
    throw new WebApiError('INVALID_SKILL_NAME', 'Invalid skill name', 400);
  }
  const config = ctx.loadConfig();
  const scope = assertValidScope(request.scope);
  const target = assertValidTarget(config, request.target);
  const { skillPath } = getInstalledSkillPath(ctx, config, name, target, scope);
  if (!existsSync(skillPath) || !statSync(skillPath).isDirectory()) {
    throw new WebApiError('SKILL_NOT_FOUND', 'Skill not installed', 404);
  }
  rmSync(skillPath, { recursive: true, force: true });
  clearInstalledTargetsIndex(ctx);
  return {
    status: 'removed',
    name,
    target,
    scope,
    path: skillPath,
  };
}

function safeZipFileName(name: string, version: string): string {
  const cleanName = name.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '');
  if (!version || version === 'unknown') {
    return `${cleanName}.zip`;
  }
  const cleanVersion = version
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return `${cleanName}-${cleanVersion}.zip`;
}

export function exportWebInstalledSkill(
  ctx: CliContext,
  request: WebExportRequest,
): WebExportResult {
  if (!validateSkillName(request.name)) {
    throw new WebApiError('INVALID_SKILL_NAME', 'Invalid skill name', 400);
  }
  const config = ctx.loadConfig();
  const scope = assertValidScope(request.scope);
  const target = assertValidTarget(config, request.target);
  const { root, skillPath } = getInstalledSkillPath(
    ctx,
    config,
    request.name,
    target,
    scope,
  );
  if (!existsSync(skillPath) || !statSync(skillPath).isDirectory()) {
    throw new WebApiError('SKILL_NOT_FOUND', 'Skill not installed', 404);
  }
  assertInstalledSkillPathAllowed(root, skillPath);
  try {
    const metadata = readSkillMarkdownMetadata(skillPath);
    return {
      fileName: safeZipFileName(metadata.meta.name, metadata.meta.version),
      contentType: 'application/zip',
      body: createZipFromDirectory(skillPath, request.name),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new WebApiError('EXPORT_FAILED', message, 500);
  }
}

function copyFileToClipboard(filePath: string): void {
  if (process.platform !== 'win32') {
    throw new WebApiError(
      'CLIPBOARD_UNSUPPORTED',
      'Copying a file to the clipboard is currently supported on Windows only',
      501,
    );
  }
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$files = New-Object System.Collections.Specialized.StringCollection',
    '[void]$files.Add($env:SUIT_SKILLS_CLIPBOARD_FILE)',
    '$data = New-Object System.Windows.Forms.DataObject',
    '$data.SetFileDropList($files)',
    '[System.Windows.Forms.Clipboard]::SetDataObject($data, $true)',
  ].join('; ');
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      env: {
        ...process.env,
        SUIT_SKILLS_CLIPBOARD_FILE: filePath,
      },
      windowsHide: true,
    },
  );
}

export function copyWebInstalledSkillPackage(
  ctx: CliContext,
  request: WebExportRequest,
): WebCopyPackageResult {
  const zip = exportWebInstalledSkill(ctx, request);
  const dir = join(tmpdir(), 'suit-skills-share');
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${Date.now()}-${zip.fileName}`);
  writeFileSync(filePath, zip.body);
  try {
    copyFileToClipboard(filePath);
  } catch (e) {
    if (e instanceof WebApiError) {
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    throw new WebApiError('COPY_PACKAGE_FAILED', message, 500, {
      path: filePath,
    });
  }
  return {
    status: 'copied',
    fileName: zip.fileName,
    path: filePath,
  };
}

export function linkWebInstalledSkillToTargets(
  ctx: CliContext,
  request: WebLinkTargetsRequest,
): WebLinkTargetsResult {
  if (!validateSkillName(request.name)) {
    throw new WebApiError('INVALID_SKILL_NAME', 'Invalid skill name', 400);
  }
  const config = ctx.loadConfig();
  const scope = assertValidScope(request.scope);
  const sourceTarget = assertValidTarget(config, request.target);
  const { root, skillPath } = getInstalledSkillPath(
    ctx,
    config,
    request.name,
    sourceTarget,
    scope,
  );
  if (!existsSync(skillPath) || !statSync(skillPath).isDirectory()) {
    throw new WebApiError('SKILL_NOT_FOUND', 'Skill not installed', 404);
  }
  assertInstalledSkillPathAllowed(root, skillPath);

  const targetPath = realpathSync.native(skillPath);
  const seen = new Set<string>();
  const results: WebLinkTargetsResult['results'] = [];
  for (const rawTarget of request.targets ?? []) {
    const target = assertValidTarget(config, rawTarget);
    if (seen.has(target)) {
      continue;
    }
    seen.add(target);

    const targetRoot = getTargetRoot(ctx, config, target, scope === 'global');
    const linkPath = join(targetRoot, request.name);
    assertInstalledSkillPathAllowed(targetRoot, linkPath);
    if (resolve(linkPath) === resolve(skillPath)) {
      results.push({
        target,
        scope,
        status: 'skipped',
        path: linkPath,
        message: 'Source target already has this skill',
      });
      continue;
    }
    if (existsSync(linkPath) && statSync(linkPath).isDirectory()) {
      results.push({
        target,
        scope,
        status: 'skipped',
        path: linkPath,
        message: 'Target already has this skill',
      });
      continue;
    }
    try {
      createSymlink(targetPath, linkPath);
      results.push({
        target,
        scope,
        status: 'linked',
        path: linkPath,
        message: `Linked to ${targetPath}`,
      });
    } catch (e) {
      results.push({
        target,
        scope,
        status: 'skipped',
        path: linkPath,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  clearInstalledTargetsIndex(ctx);
  return { results };
}

const RESERVED_CUSTOM_TARGET_IDS = new Set<string>([
  ...UI_HIDDEN_INSTALL_TARGET_IDS,
  SKILLS_TARGET_TOKEN,
]);

function targetExists(ctx: CliContext, config: Config, target: string, isGlobal: boolean): boolean {
  try {
    return existsSync(getTargetRoot(ctx, config, target, isGlobal));
  } catch {
    return false;
  }
}

function buildSkillLibraryTarget(
  ctx: CliContext,
  config: Config,
): WebSkillLibraryTarget {
  const mapping = config.agents[SKILLS_TARGET_TOKEN] ?? {
    globalDir: '~/.agents/skills',
    projectDir: './.agents/skills',
  };
  return {
    id: SKILLS_TARGET_TOKEN,
    label: 'Skill Library',
    globalDir: mapping.globalDir,
    projectDir: mapping.projectDir,
    globalPath: getTargetRoot(ctx, config, SKILLS_TARGET_TOKEN, true),
    projectPath: getTargetRoot(ctx, config, SKILLS_TARGET_TOKEN, false),
    globalExists: targetExists(ctx, config, SKILLS_TARGET_TOKEN, true),
    projectExists: targetExists(ctx, config, SKILLS_TARGET_TOKEN, false),
  };
}

function buildInstallTargetRow(
  ctx: CliContext,
  config: Config,
  id: string,
): WebInstallTarget {
  const mapping = config.agents[id] ?? { globalDir: '', projectDir: '' };
  const hidden = UI_HIDDEN_INSTALL_TARGET_IDS.has(id);
  const builtin = BUILTIN_INSTALL_TARGET_IDS.has(id);
  return {
    id,
    label: labelForUiInstallTarget(id),
    globalDir: mapping.globalDir,
    projectDir: mapping.projectDir,
    globalPath: getTargetRoot(ctx, config, id, true),
    projectPath: getTargetRoot(ctx, config, id, false),
    globalExists: targetExists(ctx, config, id, true),
    projectExists: targetExists(ctx, config, id, false),
    builtin,
    hidden,
    editable: id !== SKILLS_TARGET_TOKEN,
    removable: !builtin && !hidden,
  };
}

function normalizeCustomTargetId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isValidAgentPathToken(s: string): boolean {
  const t = s.trim();
  if (!t || t.includes('..')) {
    return false;
  }
  return (
    t.startsWith('~/') ||
    t.startsWith('./') ||
    t.startsWith('.\\') ||
    t.startsWith('~\\')
  );
}

export function listWebInstallTargets(ctx: CliContext): {
  library: WebSkillLibraryTarget;
  targets: WebInstallTarget[];
} {
  const config = ctx.loadConfig();
  const targetIds = Object.keys(config.agents)
    .filter((id) => id !== SKILLS_TARGET_TOKEN)
    .sort((a, b) => a.localeCompare(b));
  return {
    library: buildSkillLibraryTarget(ctx, config),
    targets: targetIds.map((id) => buildInstallTargetRow(ctx, config, id)),
  };
}

export function addWebInstallTarget(
  ctx: CliContext,
  body: {
    id?: string;
    globalDir?: string;
    projectDir?: string;
  },
): { library: WebSkillLibraryTarget; targets: WebInstallTarget[] } {
  const id = normalizeCustomTargetId(body.id ?? '');
  if (id.length < 2 || id.length > 48) {
    throw new WebApiError(
      'INVALID_TARGET_ID',
      'Install target id must be 2–48 chars (letters, digits, hyphen)',
      400,
    );
  }
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new WebApiError(
      'INVALID_TARGET_ID',
      'Install target id must start with a letter',
      400,
    );
  }
  if (RESERVED_CUSTOM_TARGET_IDS.has(id)) {
    throw new WebApiError(
      'INVALID_TARGET_ID',
      `Reserved install target id: ${id}`,
      400,
    );
  }
  const globalDir =
    typeof body.globalDir === 'string' ? body.globalDir.trim() : '';
  const projectDir =
    typeof body.projectDir === 'string' ? body.projectDir.trim() : '';
  if (!isValidAgentPathToken(globalDir) || !isValidAgentPathToken(projectDir)) {
    throw new WebApiError(
      'INVALID_PATH',
      'globalDir and projectDir must start with ~/ or ./ and must not contain ..',
      400,
    );
  }
  const config = ctx.loadConfig();
  if (config.agents[id]) {
    throw new WebApiError(
      'TARGET_EXISTS',
      `Install target already exists: ${id}`,
      409,
    );
  }
  const mapping: AgentMapping = { globalDir, projectDir };
  config.agents[id] = mapping;
  ctx.saveConfig(config);
  return listWebInstallTargets(ctx);
}

export function updateWebInstallTarget(
  ctx: CliContext,
  id: string,
  body: {
    globalDir?: string;
    projectDir?: string;
  },
): { library: WebSkillLibraryTarget; targets: WebInstallTarget[] } {
  const target = normalizeCustomTargetId(id);
  const config = ctx.loadConfig();
  if (!target || target === SKILLS_TARGET_TOKEN || !config.agents[target]) {
    throw new WebApiError(
      'INVALID_TARGET',
      `Unknown install target: ${target || id}`,
      404,
    );
  }
  const globalDir =
    typeof body.globalDir === 'string'
      ? body.globalDir.trim()
      : config.agents[target]!.globalDir;
  const projectDir =
    typeof body.projectDir === 'string'
      ? body.projectDir.trim()
      : config.agents[target]!.projectDir;
  if (!isValidAgentPathToken(globalDir) || !isValidAgentPathToken(projectDir)) {
    throw new WebApiError(
      'INVALID_PATH',
      'globalDir and projectDir must start with ~/ or ./ and must not contain ..',
      400,
    );
  }
  config.agents[target] = { globalDir, projectDir };
  ctx.saveConfig(config);
  clearInstalledTargetsIndex(ctx);
  return listWebInstallTargets(ctx);
}

export function removeWebInstallTarget(
  ctx: CliContext,
  id: string,
): { library: WebSkillLibraryTarget; targets: WebInstallTarget[] } {
  const target = normalizeCustomTargetId(id);
  const config = ctx.loadConfig();
  if (!target || !config.agents[target]) {
    throw new WebApiError(
      'INVALID_TARGET',
      `Unknown install target: ${target || id}`,
      404,
    );
  }
  if (BUILTIN_INSTALL_TARGET_IDS.has(target) || UI_HIDDEN_INSTALL_TARGET_IDS.has(target)) {
    throw new WebApiError(
      'CANNOT_REMOVE_BUILTIN_TARGET',
      `Cannot remove built-in install target: ${target}`,
      400,
    );
  }
  delete config.agents[target];
  ctx.saveConfig(config);
  clearInstalledTargetsIndex(ctx);
  return listWebInstallTargets(ctx);
}

export function toApiErrorPayload(error: unknown): {
  status: number;
  payload: ApiErrorPayload;
} {
  if (error instanceof WebApiError) {
    return {
      status: error.status,
      payload: {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: 500,
    payload: {
      error: {
        code: 'INTERNAL_ERROR',
        message,
      },
    },
  };
}
