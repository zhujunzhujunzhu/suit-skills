import {
  existsSync,
  rmSync,
  statSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { CliContext } from '../../cli/context.js';
import {
  assertSourceExists,
  collectMetasFromSources,
  findSourceByName,
  tagMatches,
} from '../../cli/helpers.js';
import { toAbsoluteInstallRoot } from '../../cli/paths.js';
import { getInstalledSkills } from '../agents.js';
import {
  parseInstallTargetsCsv,
  resolveDisplayPathForToken,
  SKILLS_TARGET_TOKEN,
} from '../install-targets.js';
import {
  type ConflictResolution,
  installSkillWithConflict,
} from '../install.js';
import {
  getSkillSourceDir,
  readSkillMarkdownMetadata,
  searchSkills,
} from '../skills.js';
import type {
  Config,
  MetadataSource,
  SkillMeta,
  Source,
  WebInstalledSkill,
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

export interface WebExportResult {
  fileName: string;
  contentType: string;
  body: Buffer;
}

export interface WebAddSourceRequest {
  name: string;
  url: string;
}

export interface WebUpdateSourceRequest {
  enabled?: boolean;
}

function listKnownInstallTargets(config: Config): string[] {
  return [SKILLS_TARGET_TOKEN, ...Object.keys(config.agents)];
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
  const installed: string[] = [];
  for (const scope of [false, true]) {
    for (const target of listKnownInstallTargets(config)) {
      const root = getTargetRoot(ctx, config, target, scope);
      const dir = join(root, skillName);
      if (existsSync(dir) && statSync(dir).isDirectory()) {
        installed.push(scope ? `${target}:global` : target);
      }
    }
  }
  return installed;
}

function rowsForSource(
  ctx: CliContext,
  config: Config,
  sourceFilter: string,
): { meta: SkillMeta; sourceName: string }[] {
  try {
    return collectMetasFromSources(ctx, config, sourceFilter);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Source not found') {
      throw new WebApiError('SOURCE_NOT_FOUND', msg, 404);
    }
    throw e;
  }
}

function metadataSourceForSkillDir(skillDir: string): MetadataSource {
  return readSkillMarkdownMetadata(skillDir).metadataSource;
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
  const names =
    sourceFilter === 'all'
      ? config.sources.filter((source) => source.enabled).map((s) => s.name)
      : [sourceFilter];

  for (const sourceName of names) {
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
    const refresh = ctx.refreshForSource(source.url);
    const skillDir = getSkillSourceDir(refresh.path, skillName);
    if (!skillDir) continue;
    const metadata = readSkillMarkdownMetadata(skillDir);
    if (metadata.meta.name !== skillName) continue;
    return {
      meta: metadata.meta,
      sourceName: source.name,
      skillDir,
      frontmatter: metadata.frontmatter,
      markdown: metadata.markdown,
      metadataSource: metadata.metadataSource,
    };
  }
  return null;
}

function sourceNameForInstalledSkill(
  ctx: CliContext,
  config: Config,
  name: string,
): string | undefined {
  try {
    return rowsForSource(ctx, config, 'all').find((row) => row.meta.name === name)
      ?.sourceName;
  } catch {
    return undefined;
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

export function listWebSkills(
  ctx: CliContext,
  options: { source?: string; q?: string; tag?: string },
): { items: WebSkillSummary[] } {
  const config = ctx.loadConfig();
  const sourceFilter = options.source ?? config.defaultSource;
  let rows = rowsForSource(ctx, config, sourceFilter);

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

  return {
    items: rows.map(({ meta, sourceName }) => {
      const hit = findSkillRow(ctx, config, sourceName, meta.name);
      const installedTargets = getInstalledTargetsForSkill(
        ctx,
        config,
        meta.name,
      );
      return {
        ...meta,
        sourceName,
        installed: installedTargets.length > 0,
        installedTargets,
        metadataSource: hit?.metadataSource ?? 'unknown',
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
  const sourceFilter = options.source ?? config.defaultSource;
  const hit = findSkillRow(ctx, config, sourceFilter, skillName);
  if (!hit) {
    throw new WebApiError('SKILL_NOT_FOUND', 'Skill not found', 404);
  }

  return {
    ...hit.meta,
    sourceName: hit.sourceName,
    skillDir: hit.skillDir,
    markdown: hit.markdown,
    frontmatter: hit.frontmatter,
    installedTargets: getInstalledTargetsForSkill(ctx, config, skillName),
    metadataSource: hit.metadataSource,
  };
}

export function listWebInstalledSkills(
  ctx: CliContext,
  options: { scope?: string; target?: string; agent?: string; q?: string },
): { items: WebInstalledSkill[] } {
  const config = ctx.loadConfig();
  const scope = assertValidScope(options.scope);
  const targetFilter = options.target ?? options.agent;
  const targets = targetFilter
    ? [assertValidTarget(config, targetFilter)]
    : listKnownInstallTargets(config);
  const items: WebInstalledSkill[] = [];

  for (const target of targets) {
    const root = getTargetRoot(ctx, config, target, scope === 'global');
    for (const name of getInstalledSkills(root)) {
      const skillPath = join(root, name);
      assertInstalledSkillPathAllowed(root, skillPath);
      const metadata = readSkillMarkdownMetadata(skillPath);
      const item: WebInstalledSkill = {
        ...metadata.meta,
        name: metadata.meta.name || name,
        target,
        scope,
        path: skillPath,
        sourceName: sourceNameForInstalledSkill(ctx, config, name),
        metadataSource: metadata.metadataSource,
      };
      if (installedMatches(item, options.q ?? '')) {
        items.push(item);
      }
    }
  }

  return { items };
}

export function listWebSources(ctx: CliContext): Pick<
  Config,
  'defaultSource' | 'sources'
> {
  const config = ctx.loadConfig();
  return {
    defaultSource: config.defaultSource,
    sources: config.sources,
  };
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
): { source: Source; defaultSource: string; sources: Source[] } {
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
  return {
    source,
    defaultSource: config.defaultSource,
    sources: config.sources,
  };
}

export function removeWebSource(
  ctx: CliContext,
  name: string,
): { removed: string; defaultSource: string; sources: Source[] } {
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
  config.sources.splice(index, 1);
  ctx.saveConfig(config);
  return {
    removed: sourceName,
    defaultSource: config.defaultSource,
    sources: config.sources,
  };
}

export function updateWebSource(
  ctx: CliContext,
  name: string,
  request: WebUpdateSourceRequest,
): { source: Source; defaultSource: string; sources: Source[] } {
  const config = ctx.loadConfig();
  const sourceName = normalizeSourceName(name);
  const source = findSourceByName(config, sourceName);
  if (!source) {
    throw new WebApiError('SOURCE_NOT_FOUND', 'Source not found', 404);
  }
  if (typeof request.enabled === 'boolean') {
    source.enabled = request.enabled;
  }
  ctx.saveConfig(config);
  return {
    source,
    defaultSource: config.defaultSource,
    sources: config.sources,
  };
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
    : parseInstallTargetsCsv(SKILLS_TARGET_TOKEN, config);
  const strategy = request.strategy ?? 'skip';
  if (!['overwrite', 'skip', 'rename'].includes(strategy)) {
    throw new WebApiError(
      'INVALID_INSTALL_STRATEGY',
      `Invalid install strategy: ${strategy}`,
      400,
    );
  }

  const refresh = ctx.refreshForSource(source.url);
  const scope = request.global ? 'global' : 'project';
  const results: WebInstallResult[] = [];
  for (const target of targets) {
    const root = getTargetRoot(ctx, config, target, request.global === true);
    try {
      const result = installSkillWithConflict(
        refresh.path,
        root,
        identifier,
        strategy,
      );
      results.push({
        target,
        scope,
        status: result.skipped ? 'skipped' : 'installed',
        path: result.path,
        message: result.message,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('Skill not found')) {
        throw new WebApiError('SKILL_NOT_FOUND', message, 404);
      }
      throw new WebApiError('INSTALL_FAILED', message, 500);
    }
  }
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
