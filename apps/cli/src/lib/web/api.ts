import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  realpathSync,
} from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';
import type { CliContext } from '../../cli/context.js';
import {
  assertSourceExists,
  findSourceByName,
  tagMatches,
} from '../../cli/helpers.js';
import { toAbsoluteInstallRoot } from '../../cli/paths.js';
import {
  captureInstalledSkillBaseline,
  getAiEditConfig,
  getBuiltinSourceInfo,
  getEffectiveSourceUrl,
  getInstalledSkills,
  getSourceCacheDir,
  getSourceRefreshMaxAgeMs,
  getTranslationConfig,
  normalizeAiEditConfig,
  normalizeAppSettings,
  normalizeTranslationConfig,
  restoreBuiltinSources,
  restoreInstalledSkillFileFromBaseline,
  restoreInstalledSkillFromBaseline,
  type BuiltinSourceCategory,
  BUILTIN_INSTALL_TARGET_IDS,
  type ConflictResolution,
  installSkillWithConflict,
  labelForUiInstallTarget,
  parseInstallTargetsCsv,
  readSkillMarkdownMetadata,
  resolveDisplayPathForToken,
  searchSkills,
  SKILLS_TARGET_TOKEN,
  UI_HIDDEN_INSTALL_TARGET_IDS,
  type AgentMapping,
  type AiEditConfig,
  type AppSettings,
  type Config,
  type MetadataSource,
  type SkillMeta,
  type Source,
} from '@suit-skills/core';
import {
  createSymlink,
  parseSkillIdentifier,
  validateSkillName,
} from '@suit-skills/core';
import type {
  WebInstalledSkill,
  WebInstallTarget,
  WebSkillLibraryTarget,
  WebSkillDetail,
  WebSkillFileContent,
  WebSkillFileNode,
  WebSkillSummary,
} from '../../types/index.js';
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
  projectDir?: string;
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

export interface WebInstalledSkillFileRequest {
  target: string;
  scope?: 'project' | 'global';
}

export interface WebSaveInstalledSkillFileRequest
  extends WebInstalledSkillFileRequest {
  content: string;
}

export interface WebResetInstalledSkillFileRequest
  extends WebInstalledSkillFileRequest {
  filePath: string;
}

export interface WebResetInstalledSkillFileResult {
  status: 'reset' | 'removed';
  path: string;
  file?: WebSkillFileContent;
}

export interface WebResetInstalledSkillResult {
  status: 'reset';
  name: string;
  target: string;
  scope: 'project' | 'global';
  path: string;
}

export interface WebInstalledSkillAiEditRequest
  extends WebInstalledSkillFileRequest {
  mode: 'file' | 'skill';
  filePath?: string;
  prompt: string;
}

export interface WebInstalledSkillAiEditPreviewFile {
  path: string;
  beforeContent: string;
  afterContent: string;
}

export interface WebInstalledSkillAiEditPreviewResult {
  provider: string;
  mode: 'file' | 'skill';
  summary: string;
  files: WebInstalledSkillAiEditPreviewFile[];
}

export interface WebApplyInstalledSkillAiEditRequest
  extends WebInstalledSkillFileRequest {
  files: Array<{
    path: string;
    content: string;
  }>;
}

export interface WebApplyInstalledSkillAiEditResult {
  status: 'applied';
  files: string[];
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
  url?: string;
  enabled?: boolean;
  domesticMirror?: {
    enabled?: boolean;
  };
  clearCache?: boolean;
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

export interface WebSkillBrowserBundle {
  files: WebSkillFileNode[];
  initialPath: string;
  initialContent: WebSkillFileContent | null;
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

function createScopedWebInstallContext(
  ctx: CliContext,
  projectDir: string,
): CliContext {
  const cwd = isAbsolute(projectDir)
    ? resolve(projectDir)
    : resolve(ctx.cwd, projectDir);
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
    throw new WebApiError(
      'INVALID_PROJECT_DIR',
      `Project directory does not exist: ${cwd}`,
      400,
    );
  }
  return {
    ...ctx,
    cwd,
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

function resolveInstalledSkillDirectory(
  ctx: CliContext,
  config: Config,
  name: string,
  request: WebInstalledSkillFileRequest,
): {
  root: string;
  skillPath: string;
  realSkillPath: string;
  scope: 'project' | 'global';
  target: string;
} {
  if (!validateSkillName(name)) {
    throw new WebApiError('INVALID_SKILL_NAME', 'Invalid skill name', 400);
  }
  const scope = assertValidScope(request.scope);
  const target = assertValidTarget(config, request.target);
  const { root, skillPath } = getInstalledSkillPath(
    ctx,
    config,
    name,
    target,
    scope,
  );
  if (!existsSync(skillPath) || !statSync(skillPath).isDirectory()) {
    throw new WebApiError('SKILL_NOT_FOUND', 'Skill not installed', 404);
  }
  assertInstalledSkillPathAllowed(root, skillPath);
  let realSkillPath = skillPath;
  try {
    realSkillPath = realpathSync.native(skillPath);
  } catch {
    // Fall back to the resolved install path when the platform cannot resolve a real path.
  }
  return { root, skillPath, realSkillPath, scope, target };
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
  preferCache = false,
): { rows: SkillSourceRow[]; warnings: WebSourceWarning[] } {
  const cache = getRowsCacheForContext(ctx);
  const cacheKey = `${source.name}\0${getEffectiveSourceUrl(source)}`;
  const cached = cache.get(cacheKey);
  if (cached && !forceRefresh && cached.expiresAt > Date.now()) {
    return { rows: cached.rows, warnings: [] };
  }
  if (!forceRefresh && preferCache) {
    const fallback = findCachedRowsForSource(ctx, source);
    if (fallback) {
      cache.set(cacheKey, {
        expiresAt: Date.now() + maxAgeMs,
        rows: fallback.rows,
      });
      return { rows: fallback.rows, warnings: [] };
    }
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
  preferCache = false,
): { rows: SkillSourceRow[]; warnings: WebSourceWarning[] } {
  try {
    const sources = sourcesForFilter(config, sourceFilter);
    const rows: SkillSourceRow[] = [];
    const warnings: WebSourceWarning[] = [];
    const seenNames = new Set<string>();
    const maxAgeMs = getSourceRefreshMaxAgeMs(config);
    for (const source of sources) {
      try {
        const result = rowsForSingleSource(ctx, source, forceRefresh, maxAgeMs, preferCache);
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

function cachedRowsOnlyForEnabledSources(
  ctx: CliContext,
  config: Config,
): SkillSourceRow[] {
  const rows: SkillSourceRow[] = [];
  const seenNames = new Set<string>();
  const now = Date.now();
  const cache = getRowsCacheForContext(ctx);

  for (const source of config.sources) {
    if (!source.enabled) {
      continue;
    }
    const cacheKey = `${source.name}\0${getEffectiveSourceUrl(source)}`;
    const cached = cache.get(cacheKey);
    const sourceRows =
      cached && cached.expiresAt > now
        ? cached.rows
        : (findCachedRowsForSource(ctx, source)?.rows ?? []);

    for (const row of sourceRows) {
      if (seenNames.has(row.meta.name)) {
        continue;
      }
      seenNames.add(row.meta.name);
      rows.push(row);
    }
  }

  return rows;
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
  return new Map(
    cachedRowsOnlyForEnabledSources(ctx, config).map((row) => [
      row.meta.name,
      row.sourceName,
    ]),
  );
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
  const sourceFilter = options.source ?? (config.defaultSource || 'all');
  const result = rowsForSource(
    ctx,
    config,
    sourceFilter,
    options.refresh === true,
    options.refresh !== true,
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

  return buildWebSkillsResponse(ctx, config, rows, result.warnings);
}

export function listWebSkillsSnapshot(
  ctx: CliContext,
  options: { source?: string; q?: string; tag?: string },
): WebSkillsResponse {
  const config = ctx.loadConfig();
  const sourceFilter = options.source ?? 'all';
  let rows = cachedRowsForSourceFilter(ctx, config, sourceFilter);

  // If no local cache exists yet, fall back to the normal loader once.
  if (rows.length === 0) {
    return listWebSkills(ctx, {
      ...options,
      refresh: false,
    });
  }

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

  return buildWebSkillsResponse(ctx, config, rows, []);
}

function buildWebSkillsResponse(
  ctx: CliContext,
  config: Config,
  rows: SkillSourceRow[],
  warnings: WebSourceWarning[],
): WebSkillsResponse {
  const installedTargetsIndex = getInstalledTargetsIndex(ctx, config);
  return {
    warnings,
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

function cachedRowsForSourceFilter(
  ctx: CliContext,
  config: Config,
  sourceFilter: string,
): SkillSourceRow[] {
  try {
    const sources = sourcesForFilter(config, sourceFilter);
    const rows: SkillSourceRow[] = [];
    const seenNames = new Set<string>();
    const now = Date.now();
    const cache = getRowsCacheForContext(ctx);

    for (const source of sources) {
      const cacheKey = `${source.name}\0${getEffectiveSourceUrl(source)}`;
      const cached = cache.get(cacheKey);
      const sourceRows =
        cached && cached.expiresAt > now
          ? cached.rows
          : (findCachedRowsForSource(ctx, source)?.rows ?? []);

      for (const row of sourceRows) {
        if (seenNames.has(row.meta.name)) {
          continue;
        }
        seenNames.add(row.meta.name);
        rows.push(row);
      }
    }

    return rows;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Source not found') {
      throw new WebApiError('SOURCE_NOT_FOUND', msg, 404);
    }
    throw e;
  }
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
  if (config.defaultSource === sourceName) {
    config.defaultSource = '';
  }
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
  if (typeof request.url === 'string') {
    const url = normalizeSourceUrl(request.url);
    if (
      config.sources.some(
        (item) =>
          item.name !== sourceName &&
          (item.url.trim() === url || item.domesticMirror?.url.trim() === url),
      )
    ) {
      throw new WebApiError('SOURCE_ALREADY_EXISTS', 'Source already exists', 409);
    }
    const previousUrl = getEffectiveSourceUrl(source);
    source.url = url;
    if (request.clearCache === true && previousUrl !== getEffectiveSourceUrl(source)) {
      rmSync(getSourceCacheDir(previousUrl, ctx.configOptions), {
        recursive: true,
        force: true,
      });
    }
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
  const projectDir =
    typeof request.projectDir === 'string' ? request.projectDir.trim() : '';
  const installCtx =
    request.global === true || !projectDir
      ? ctx
      : createScopedWebInstallContext(ctx, projectDir);
  const config = installCtx.loadConfig();
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

  const refresh = refreshSourceForWeb(installCtx, source);
  const isGlobal = request.global === true;
  const scope = isGlobal ? 'global' : 'project';
  const results: WebInstallResult[] = [];

  // 全局 ~/.agents/skills 与项目 ./.agents/skills：先安装到中央存储，再为其它目标创建软链接
  const centralRoot = getTargetRoot(installCtx, config, 'agents', isGlobal);
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

  try {
    const metadata = readSkillMarkdownMetadata(centralSkillPath);
    captureInstalledSkillBaseline(centralSkillPath, {
      skillName: metadata.meta.name,
      sourceName: source.name,
      installedVersion: metadata.meta.version,
    });
  } catch {
    // installSkillWithConflict already created a baseline snapshot. Metadata enrichment is best-effort.
  }

  const skillName = parsed.name;
  for (const target of targets) {
    if (target === 'agents') {
      continue;
    }
    const targetRoot = getTargetRoot(installCtx, config, target, isGlobal);
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

// ---------------------------------------------------------------------------
// Skill 文件浏览器
// ---------------------------------------------------------------------------

const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.xml', '.html', '.htm',
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.css', '.scss', '.sass',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h',
  '.cs', '.php', '.r', '.lua', '.ex', '.exs', '.clj', '.scala', '.hs',
  '.env', '.gitignore', '.editorconfig', '.prettierrc', '.eslintrc',
  '.dockerfile', 'dockerfile', '.makefile', 'makefile',
]);

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp',
]);

const MAX_TEXT_FILE_SIZE = 512 * 1024; // 512 KB

function classifyFile(filePath: string, size: number): {
  encoding: 'text' | 'base64' | 'binary';
  previewable: boolean;
} {
  const ext = extname(filePath).toLowerCase();
  const nameOnly = basename(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(nameOnly)) {
    if (size > MAX_TEXT_FILE_SIZE) {
      return { encoding: 'text', previewable: false };
    }
    return { encoding: 'text', previewable: true };
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return { encoding: 'base64', previewable: true };
  }
  return { encoding: 'binary', previewable: false };
}

const IGNORE_NAMES = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store']);

function buildFileTree(dirPath: string, relBase: string): WebSkillFileNode[] {
  const nodes: WebSkillFileNode[] = [];
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORE_NAMES.has(entry.name)) continue;
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
      const fullPath = join(dirPath, entry.name);
      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      // 符号链接在 Dirent 上常为「仅 symlink」；需 stat 跟随目标，否则目录软链会被当成文件，子树丢失
      if (entry.isSymbolicLink()) {
        try {
          const st = statSync(fullPath);
          isDir = st.isDirectory();
          isFile = st.isFile();
        } catch {
          continue;
        }
      }
      if (isDir) {
        nodes.push({
          name: entry.name,
          path: relPath,
          type: 'dir',
          children: buildFileTree(fullPath, relPath),
        });
      } else if (isFile) {
        nodes.push({ name: entry.name, path: relPath, type: 'file' });
      }
    }
  } catch {
    // 忽略权限错误等
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

function normalizeRelativeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function resolveSkillRelativeFilePath(
  skillPath: string,
  filePath: string,
): { safePath: string; absolutePath: string } {
  const safePath = normalizeRelativeFilePath(filePath);
  const absolutePath = resolve(join(skillPath, safePath));
  if (!isInsidePath(skillPath, absolutePath)) {
    throw new WebApiError(
      'PATH_NOT_ALLOWED',
      'File path is outside skill directory',
      403,
    );
  }
  return { safePath, absolutePath };
}

function collectEditableTextFiles(
  skillPath: string,
  relBase = '',
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  for (const entry of readdirSync(skillPath, { withFileTypes: true })) {
    if (IGNORE_NAMES.has(entry.name)) continue;
    const fullPath = join(skillPath, entry.name);
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    let isDir = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const st = statSync(fullPath);
        isDir = st.isDirectory();
        isFile = st.isFile();
      } catch {
        continue;
      }
    }
    if (isDir) {
      files.push(...collectEditableTextFiles(fullPath, relPath));
      continue;
    }
    if (!isFile) {
      continue;
    }
    const stat = statSync(fullPath);
    const { encoding, previewable } = classifyFile(fullPath, stat.size);
    if (encoding !== 'text' || !previewable) {
      continue;
    }
    files.push({
      path: relPath,
      content: readFileSync(fullPath, 'utf8'),
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function getWebSkillFileTree(
  ctx: CliContext,
  skillName: string,
  options: { source?: string },
): { files: WebSkillFileNode[] } {
  if (!validateSkillName(skillName)) {
    throw new WebApiError('INVALID_SKILL_NAME', 'Invalid skill name', 400);
  }
  const config = ctx.loadConfig();
  const sourceFilter = options.source ?? 'all';
  const hit = findSkillRow(ctx, config, sourceFilter, skillName);
  if (!hit) {
    throw new WebApiError('SKILL_NOT_FOUND', 'Skill not found', 404);
  }
  return { files: buildFileTree(hit.skillDir, '') };
}

function readWebSkillFileContentFromRoot(
  rootDir: string,
  filePath: string,
): WebSkillFileContent {
  if (!filePath || filePath.trim() === '') {
    throw new WebApiError('INVALID_FILE_PATH', 'File path is required', 400);
  }

  const safePath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const absolutePath = resolve(join(rootDir, safePath));
  if (!isInsidePath(rootDir, absolutePath)) {
    throw new WebApiError('PATH_NOT_ALLOWED', 'File path is outside skill directory', 403);
  }
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new WebApiError('FILE_NOT_FOUND', 'File not found', 404);
  }

  const stat = statSync(absolutePath);
  const ext = extname(absolutePath).toLowerCase();
  const { encoding, previewable } = classifyFile(absolutePath, stat.size);

  if (!previewable) {
    return { path: safePath, encoding, previewable, ext, size: stat.size };
  }

  if (encoding === 'text') {
    const content = readFileSync(absolutePath, 'utf8');
    return { path: safePath, content, encoding, previewable: true, ext, size: stat.size };
  }

  const buf = readFileSync(absolutePath);
  return {
    path: safePath,
    contentBase64: buf.toString('base64'),
    encoding,
    previewable: true,
    ext,
    size: stat.size,
  };
}

function findInitialFilePath(nodes: WebSkillFileNode[]): string {
  for (const node of nodes) {
    if (node.type === 'file' && node.name.toUpperCase() === 'SKILL.MD') {
      return node.path;
    }
    if (node.type === 'dir') {
      const found = findInitialFilePath(node.children ?? []);
      if (found) {
        return found;
      }
    }
  }

  for (const node of nodes) {
    if (node.type === 'file') {
      return node.path;
    }
    if (node.type === 'dir') {
      const found = findInitialFilePath(node.children ?? []);
      if (found) {
        return found;
      }
    }
  }

  return '';
}

export function getWebSkillFileContent(
  ctx: CliContext,
  skillName: string,
  filePath: string,
  options: { source?: string },
): WebSkillFileContent {
  if (!validateSkillName(skillName)) {
    throw new WebApiError('INVALID_SKILL_NAME', 'Invalid skill name', 400);
  }
  if (!filePath || filePath.trim() === '') {
    throw new WebApiError('INVALID_FILE_PATH', 'File path is required', 400);
  }

  const config = ctx.loadConfig();
  const sourceFilter = options.source ?? 'all';
  const hit = findSkillRow(ctx, config, sourceFilter, skillName);
  if (!hit) {
    throw new WebApiError('SKILL_NOT_FOUND', 'Skill not found', 404);
  }
  return readWebSkillFileContentFromRoot(hit.skillDir, filePath);
}

export function getWebSkillBrowserBundle(
  ctx: CliContext,
  skillName: string,
  options: { source?: string },
): WebSkillBrowserBundle {
  if (!validateSkillName(skillName)) {
    throw new WebApiError('INVALID_SKILL_NAME', 'Invalid skill name', 400);
  }
  const config = ctx.loadConfig();
  const sourceFilter = options.source ?? 'all';
  const hit = findSkillRow(ctx, config, sourceFilter, skillName);
  if (!hit) {
    throw new WebApiError('SKILL_NOT_FOUND', 'Skill not found', 404);
  }

  const files = buildFileTree(hit.skillDir, '');
  const initialPath = findInitialFilePath(files);
  return {
    files,
    initialPath,
    initialContent: initialPath
      ? readWebSkillFileContentFromRoot(hit.skillDir, initialPath)
      : null,
  };
}

export function getWebInstalledSkillFileTree(
  ctx: CliContext,
  skillName: string,
  request: WebInstalledSkillFileRequest,
): { files: WebSkillFileNode[] } {
  const config = ctx.loadConfig();
  const { skillPath } = resolveInstalledSkillDirectory(
    ctx,
    config,
    skillName,
    request,
  );
  return { files: buildFileTree(skillPath, '') };
}

export function getWebInstalledSkillFileContent(
  ctx: CliContext,
  skillName: string,
  filePath: string,
  request: WebInstalledSkillFileRequest,
): WebSkillFileContent {
  if (!filePath || filePath.trim() === '') {
    throw new WebApiError('INVALID_FILE_PATH', 'File path is required', 400);
  }

  const config = ctx.loadConfig();
  const { skillPath } = resolveInstalledSkillDirectory(
    ctx,
    config,
    skillName,
    request,
  );
  return readWebSkillFileContentFromRoot(skillPath, filePath);
}

export function getWebInstalledSkillBrowserBundle(
  ctx: CliContext,
  skillName: string,
  request: WebInstalledSkillFileRequest,
): WebSkillBrowserBundle {
  const config = ctx.loadConfig();
  const { skillPath } = resolveInstalledSkillDirectory(
    ctx,
    config,
    skillName,
    request,
  );
  const files = buildFileTree(skillPath, '');
  const initialPath = findInitialFilePath(files);
  return {
    files,
    initialPath,
    initialContent: initialPath
      ? readWebSkillFileContentFromRoot(skillPath, initialPath)
      : null,
  };
}

export function saveWebInstalledSkillFile(
  ctx: CliContext,
  skillName: string,
  filePath: string,
  request: WebSaveInstalledSkillFileRequest,
): WebSkillFileContent {
  if (!filePath || filePath.trim() === '') {
    throw new WebApiError('INVALID_FILE_PATH', 'File path is required', 400);
  }
  if (typeof request.content !== 'string') {
    throw new WebApiError('INVALID_FILE_CONTENT', 'File content must be a string', 400);
  }

  const config = ctx.loadConfig();
  const { skillPath } = resolveInstalledSkillDirectory(
    ctx,
    config,
    skillName,
    request,
  );

  const safePath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const absolutePath = resolve(join(skillPath, safePath));
  if (!isInsidePath(skillPath, absolutePath)) {
    throw new WebApiError(
      'PATH_NOT_ALLOWED',
      'File path is outside skill directory',
      403,
    );
  }
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new WebApiError('FILE_NOT_FOUND', 'File not found', 404);
  }

  const size = Buffer.byteLength(request.content, 'utf8');
  const { encoding, previewable } = classifyFile(absolutePath, size);
  if (encoding !== 'text' || !previewable) {
    throw new WebApiError(
      'FILE_NOT_EDITABLE',
      'Only previewable text files can be edited',
      400,
      { path: safePath },
    );
  }

  writeFileSync(absolutePath, request.content, 'utf8');
  return getWebInstalledSkillFileContent(ctx, skillName, safePath, request);
}

export function resetWebInstalledSkillFile(
  ctx: CliContext,
  skillName: string,
  request: WebResetInstalledSkillFileRequest,
): WebResetInstalledSkillFileResult {
  if (!request.filePath || request.filePath.trim() === '') {
    throw new WebApiError('INVALID_FILE_PATH', 'File path is required', 400);
  }

  const config = ctx.loadConfig();
  const { realSkillPath } = resolveInstalledSkillDirectory(
    ctx,
    config,
    skillName,
    request,
  );
  const safePath = request.filePath.replace(/\\/g, '/').replace(/^\/+/, '');

  try {
    const status = restoreInstalledSkillFileFromBaseline(
      realSkillPath,
      safePath,
      ctx.configOptions,
    );
    if (status === 'removed') {
      return { status, path: safePath };
    }
    return {
      status,
      path: safePath,
      file: getWebInstalledSkillFileContent(ctx, skillName, safePath, request),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Baseline snapshot not found') {
      throw new WebApiError(
        'BASELINE_NOT_FOUND',
        'No installation baseline is available for this skill',
        404,
      );
    }
    if (message.includes('outside skill directory')) {
      throw new WebApiError(
        'PATH_NOT_ALLOWED',
        'File path is outside skill directory',
        403,
      );
    }
    if (message.includes('File not found')) {
      throw new WebApiError('FILE_NOT_FOUND', 'File not found', 404);
    }
    throw new WebApiError('RESET_FILE_FAILED', message, 500);
  }
}

export function resetWebInstalledSkill(
  ctx: CliContext,
  skillName: string,
  request: WebInstalledSkillFileRequest,
): WebResetInstalledSkillResult {
  const config = ctx.loadConfig();
  const { realSkillPath, scope, target } = resolveInstalledSkillDirectory(
    ctx,
    config,
    skillName,
    request,
  );

  try {
    restoreInstalledSkillFromBaseline(realSkillPath, ctx.configOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Baseline snapshot not found') {
      throw new WebApiError(
        'BASELINE_NOT_FOUND',
        'No installation baseline is available for this skill',
        404,
      );
    }
    throw new WebApiError('RESET_SKILL_FAILED', message, 500);
  }

  return {
    status: 'reset',
    name: skillName,
    target,
    scope,
    path: realSkillPath,
  };
}

// ---------------------------------------------------------------------------
// 翻译
// ---------------------------------------------------------------------------

export interface WebTranslateRequest {
  text: string;
  targetLang?: string;
}

export interface WebTranslateResult {
  translated: string;
  provider: string;
}

export interface WebTranslateBatchRequest {
  items: Array<{ text: string }>;
  targetLang?: string;
}

export interface WebTranslateBatchResult {
  items: WebTranslateResult[];
}

function findJsonEnd(text: string, start: number): number | undefined {
  const first = text[start];
  const expectedClose = first === '{' ? '}' : first === '[' ? ']' : '';
  if (!expectedClose) return undefined;

  const stack = [expectedClose];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      stack.push('}');
      continue;
    }
    if (char === '[') {
      stack.push(']');
      continue;
    }
    if (char === '}' || char === ']') {
      if (stack.pop() !== char) {
        return undefined;
      }
      if (stack.length === 0) {
        return index + 1;
      }
    }
  }

  return undefined;
}

function extractJsonText(output?: string): string | undefined {
  const text = output?.trim();
  if (!text) return undefined;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== '{' && char !== '[') continue;

    const end = findJsonEnd(text, index);
    if (end === undefined) continue;

    const candidate = text.slice(index, end);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Try the next JSON-looking segment.
    }
  }

  return undefined;
}

function normalizeTranslatedOutput(output: string): string {
  return output
    .trim()
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseBatchTranslations(output: string, expectedCount: number): string[] {
  const jsonText = extractJsonText(output);
  if (!jsonText) {
    throw new WebApiError('AI_INVALID_RESPONSE', 'AI API did not return JSON', 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WebApiError('AI_INVALID_RESPONSE', `AI API returned invalid JSON: ${message}`, 502);
  }

  const rawItems = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)
      ? (parsed as { items: unknown[] }).items
      : null;

  if (!rawItems || rawItems.length !== expectedCount) {
    throw new WebApiError(
      'AI_INVALID_RESPONSE',
      `AI API returned ${rawItems?.length ?? 0} translations for ${expectedCount} inputs`,
      502,
    );
  }

  return rawItems.map((item, index) => {
    if (typeof item === 'string') return normalizeTranslatedOutput(item);
    if (item && typeof item === 'object') {
      const translated = (item as { translated?: unknown; text?: unknown }).translated
        ?? (item as { translated?: unknown; text?: unknown }).text;
      if (typeof translated === 'string') {
        return normalizeTranslatedOutput(translated);
      }
    }
    throw new WebApiError(
      'AI_INVALID_RESPONSE',
      `AI API returned invalid translation at index ${index}`,
      502,
    );
  });
}

async function completeViaHttpApi(
  prompt: string,
  apiBaseUrl: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const url = `${apiBaseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new WebApiError(
      'MODEL_API_ERROR',
      `Model API returned ${res.status}: ${body.slice(0, 200)}`,
      502,
    );
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const result = data?.choices?.[0]?.message?.content;
  if (typeof result !== 'string' || !result.trim()) {
    throw new WebApiError('AI_EMPTY_RESPONSE', 'AI API returned empty result', 502);
  }
  return result;
}

function completeViaCli(
  prompt: string,
  command: string,
  args: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { timeout: 120_000 }, (err, stdout) => {
      if (err) {
        reject(new WebApiError('AI_CLI_ERROR', `AI CLI failed: ${err.message}`, 502));
        return;
      }
      const result = stdout.trim();
      if (!result) {
        reject(new WebApiError('AI_EMPTY_RESPONSE', 'AI CLI returned empty result', 502));
        return;
      }
      resolve(result);
    });
    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}

async function completeViaAiConfig(
  config: AiEditConfig,
  prompt: string,
): Promise<{ output: string; provider: string }> {
  if (config.provider === 'openai') {
    const apiBaseUrl = config.apiBaseUrl || 'https://api.openai.com/v1';
    const apiKey = config.apiKey || '';
    const model = config.model || 'gpt-4o-mini';
    if (!apiKey) {
      throw new WebApiError('AI_EDIT_NO_API_KEY', 'API key is not configured', 400);
    }
    const output = await completeViaHttpApi(prompt, apiBaseUrl, apiKey, model);
    return { output, provider: 'openai' };
  }

  if (config.provider === 'cli') {
    const command = config.cliCommand || '';
    if (!command) {
      throw new WebApiError('AI_EDIT_NO_CLI_COMMAND', 'CLI command is not configured', 400);
    }
    const output = await completeViaCli(prompt, command, config.cliArgs ?? []);
    return { output, provider: 'cli' };
  }

  throw new WebApiError(
    'AI_EDIT_NOT_CONFIGURED',
    'AI edit provider is not configured. Please configure it in Settings.',
    400,
  );
}

export async function translateWebText(
  ctx: CliContext,
  request: WebTranslateRequest,
): Promise<WebTranslateResult> {
  const { text, targetLang = '简体中文' } = request;
  if (!text || !text.trim()) {
    throw new WebApiError('INVALID_TEXT', 'Text is required', 400);
  }

  const config = ctx.loadConfig();
  const translationConfig = getTranslationConfig(config);

  if (translationConfig.provider === 'none') {
    throw new WebApiError(
      'TRANSLATION_NOT_CONFIGURED',
      'Translation provider is not configured. Please configure it in Settings.',
      400,
    );
  }

  const prompt = `Translate the following markdown content to ${targetLang}. Keep all markdown formatting, code blocks, and links intact. Output only the translated text without any extra explanation.\n\n${text}`;
  const { output, provider } = await completeViaAiConfig(
    translationConfig,
    prompt,
  );
  return { translated: normalizeTranslatedOutput(output), provider };
}

export async function translateWebTextBatch(
  ctx: CliContext,
  request: WebTranslateBatchRequest,
): Promise<WebTranslateBatchResult> {
  const { items, targetLang = '简体中文' } = request;
  if (!Array.isArray(items) || items.length === 0) {
    throw new WebApiError('INVALID_TEXT', 'Text items are required', 400);
  }
  if (items.length > 20) {
    throw new WebApiError(
      'TOO_MANY_TEXT_ITEMS',
      'At most 20 text items can be translated at once',
      400,
    );
  }

  const texts = items.map((item) => item?.text ?? '');
  if (texts.some((text) => typeof text !== 'string' || !text.trim())) {
    throw new WebApiError('INVALID_TEXT', 'Every text item is required', 400);
  }

  const config = ctx.loadConfig();
  const translationConfig = getTranslationConfig(config);

  if (translationConfig.provider === 'none') {
    throw new WebApiError(
      'TRANSLATION_NOT_CONFIGURED',
      'Translation provider is not configured. Please configure it in Settings.',
      400,
    );
  }

  const prompt = [
    `Translate each markdown fragment to ${targetLang}.`,
    'Keep markdown formatting, inline code, code blocks, links, paths, placeholders, and numbering intact.',
    'Return JSON only, with this exact shape: {"items":[{"translated":"..."}]}.',
    'The items array must have the same order and length as the input.',
    '',
    JSON.stringify({ items: texts.map((text, index) => ({ index, text })) }),
  ].join('\n');

  const { output, provider } = await completeViaAiConfig(
    translationConfig,
    prompt,
  );
  const translated = parseBatchTranslations(output, texts.length);
  return {
    items: translated.map((item) => ({ translated: item, provider })),
  };
}

export function updateWebTranslationConfig(
  ctx: CliContext,
  request: Partial<import('../../types/index.js').TranslationConfig>,
): import('../../types/index.js').TranslationConfig {
  const config = ctx.loadConfig();
  const merged = { ...(config.translation ?? {}), ...request };
  config.translation = normalizeTranslationConfig(merged);
  ctx.saveConfig(config);
  return getTranslationConfig(config);
}

export function getWebTranslationConfig(
  ctx: CliContext,
): import('../../types/index.js').TranslationConfig {
  return getTranslationConfig(ctx.loadConfig());
}

export function updateWebAiEditConfig(
  ctx: CliContext,
  request: Partial<AiEditConfig>,
): AiEditConfig {
  const config = ctx.loadConfig();
  const merged = { ...(config.aiEditing ?? {}), ...request };
  config.aiEditing = normalizeAiEditConfig(merged);
  ctx.saveConfig(config);
  return getAiEditConfig(config);
}

export function getWebAiEditConfig(
  ctx: CliContext,
): AiEditConfig {
  return getAiEditConfig(ctx.loadConfig());
}

function aiEditableTextFilesForRequest(
  skillPath: string,
  request: WebInstalledSkillAiEditRequest,
): Array<{ path: string; content: string }> {
  const files = collectEditableTextFiles(skillPath);
  if (request.mode === 'file') {
    const selectedPath = normalizeRelativeFilePath(request.filePath ?? '');
    if (!selectedPath) {
      throw new WebApiError(
        'INVALID_FILE_PATH',
        'File path is required for file mode AI edit',
        400,
      );
    }
    const selected = files.find((file) => file.path === selectedPath);
    if (!selected) {
      throw new WebApiError(
        'FILE_NOT_EDITABLE',
        'Only previewable text files can be edited by AI',
        400,
      );
    }
    const skillMd = files.find(
      (file) => file.path.toUpperCase() === 'SKILL.MD' && file.path !== selected.path,
    );
    return skillMd ? [selected, skillMd] : [selected];
  }

  const prioritized = [...files].sort((a, b) => {
    if (a.path.toUpperCase() === 'SKILL.MD') return -1;
    if (b.path.toUpperCase() === 'SKILL.MD') return 1;
    return a.path.localeCompare(b.path);
  });
  return prioritized.slice(0, 8);
}

function buildAiEditPrompt(
  request: WebInstalledSkillAiEditRequest,
  files: Array<{ path: string; content: string }>,
): string {
  const modeInstruction =
    request.mode === 'file'
      ? `Focus on the current file: ${normalizeRelativeFilePath(request.filePath ?? '')}.`
      : 'You may update any of the provided files, but only when necessary.';
  const fileBlocks = files
    .map((file) => `<file path="${file.path}">\n${file.content}\n</file>`)
    .join('\n\n');
  return [
    'You are helping edit a locally installed coding skill.',
    modeInstruction,
    'Return JSON only.',
    'Schema: {"summary":"short summary","files":[{"path":"relative/path","content":"full updated file content"}]}',
    'Rules:',
    '- Only modify files from the provided list.',
    '- Do not add or delete files.',
    '- Return only files whose contents changed.',
    '- Preserve unrelated content.',
    '- If no change is needed, return {"summary":"No changes needed","files":[]}.',
    '',
    `User request:\n${request.prompt.trim()}`,
    '',
    'Available files:',
    fileBlocks,
  ].join('\n');
}

function parseAiEditPreviewOutput(
  output: string,
): { summary: string; files: Array<{ path: string; content: string }> } {
  const jsonText = extractJsonText(output);
  if (!jsonText) {
    throw new WebApiError(
      'AI_EDIT_INVALID_RESPONSE',
      'AI did not return a valid JSON payload',
      502,
    );
  }
  const parsed = JSON.parse(jsonText) as {
    summary?: unknown;
    files?: unknown;
  };
  const summary =
    typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : 'Generated AI edit preview';
  const files = Array.isArray(parsed.files)
    ? parsed.files
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const path =
            typeof (item as { path?: unknown }).path === 'string'
              ? normalizeRelativeFilePath((item as { path: string }).path)
              : '';
          const content =
            typeof (item as { content?: unknown }).content === 'string'
              ? (item as { content: string }).content
              : '';
          if (!path) return null;
          return { path, content };
        })
        .filter((item): item is { path: string; content: string } => item !== null)
    : [];
  return { summary, files };
}

export async function generateWebInstalledSkillAiEdit(
  ctx: CliContext,
  skillName: string,
  request: WebInstalledSkillAiEditRequest,
): Promise<WebInstalledSkillAiEditPreviewResult> {
  if (!request.prompt || !request.prompt.trim()) {
    throw new WebApiError('INVALID_PROMPT', 'Prompt is required', 400);
  }

  const config = ctx.loadConfig();
  const { skillPath } = resolveInstalledSkillDirectory(ctx, config, skillName, request);
  const editableFiles = aiEditableTextFilesForRequest(skillPath, request);
  if (editableFiles.length === 0) {
    throw new WebApiError(
      'AI_EDIT_NO_CONTEXT',
      'No editable text files are available for AI editing',
      400,
    );
  }

  const prompt = buildAiEditPrompt(request, editableFiles);
  const { output, provider } = await completeViaAiConfig(
    getAiEditConfig(config),
    prompt,
  );
  const preview = parseAiEditPreviewOutput(output);
  const allowed = new Map(editableFiles.map((file) => [file.path, file.content]));

  const files = preview.files
    .map((file) => {
      const beforeContent = allowed.get(file.path);
      if (beforeContent === undefined) {
        throw new WebApiError(
          'AI_EDIT_PATH_NOT_ALLOWED',
          `AI proposed a file outside the allowed context: ${file.path}`,
          400,
        );
      }
      return {
        path: file.path,
        beforeContent,
        afterContent: file.content,
      };
    })
    .filter((file) => file.beforeContent !== file.afterContent);

  return {
    provider,
    mode: request.mode,
    summary: preview.summary,
    files,
  };
}

export function applyWebInstalledSkillAiEdit(
  ctx: CliContext,
  skillName: string,
  request: WebApplyInstalledSkillAiEditRequest,
): WebApplyInstalledSkillAiEditResult {
  const config = ctx.loadConfig();
  const { skillPath } = resolveInstalledSkillDirectory(ctx, config, skillName, request);

  const applied: string[] = [];
  for (const file of request.files ?? []) {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') {
      throw new WebApiError(
        'INVALID_AI_EDIT_PAYLOAD',
        'Each AI edit file must include path and content',
        400,
      );
    }

    const { safePath, absolutePath } = resolveSkillRelativeFilePath(skillPath, file.path);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      throw new WebApiError('FILE_NOT_FOUND', `File not found: ${safePath}`, 404);
    }

    const size = Buffer.byteLength(file.content, 'utf8');
    const { encoding, previewable } = classifyFile(absolutePath, size);
    if (encoding !== 'text' || !previewable) {
      throw new WebApiError(
        'FILE_NOT_EDITABLE',
        `Only previewable text files can be updated by AI: ${safePath}`,
        400,
      );
    }

    writeFileSync(absolutePath, file.content, 'utf8');
    applied.push(safePath);
  }

  return { status: 'applied', files: applied };
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
