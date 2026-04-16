import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CliContext } from '../../cli/context.js';
import {
  assertSourceExists,
  collectMetasFromSources,
  tagMatches,
} from '../../cli/helpers.js';
import { toAbsoluteInstallRoot } from '../../cli/paths.js';
import { getInstalledSkills } from '../agents.js';
import {
  resolveDisplayPathForToken,
  SKILLS_TARGET_TOKEN,
} from '../install-targets.js';
import {
  getSkillSourceDir,
  searchSkills,
} from '../skills.js';
import type { Config, SkillMeta } from '../../types/index.js';
import { validateSkillName } from '../../utils/validate.js';

export interface WebSkillSummary extends SkillMeta {
  sourceName: string;
  installed: boolean;
  installedTargets: string[];
}

export interface WebSkillDetail {
  meta: SkillMeta;
  sourceName: string;
  skillDir: string;
  markdown: string;
  installedTargets: string[];
}

export interface WebInstalledSkill {
  target: string;
  name: string;
  path: string;
}

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

function listKnownInstallTargets(config: Config): string[] {
  return [SKILLS_TARGET_TOKEN, ...Object.keys(config.agents)];
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

function getInstalledTargetsForSkill(
  ctx: CliContext,
  config: Config,
  skillName: string,
): string[] {
  const installed: string[] = [];
  for (const scope of [false, true]) {
    for (const target of listKnownInstallTargets(config)) {
      const root = getTargetRoot(ctx, config, target, scope);
      if (existsSync(join(root, skillName, 'meta.json'))) {
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
      };
    }),
  };
}

function findSkillRow(
  ctx: CliContext,
  config: Config,
  sourceFilter: string,
  skillName: string,
): { meta: SkillMeta; sourceName: string; skillDir: string } | null {
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
    const rows = rowsForSource(ctx, config, sourceName);
    const meta = rows.find((row) => row.meta.name === skillName)?.meta;
    if (meta) {
      return { meta, sourceName: source.name, skillDir };
    }
  }
  return null;
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

  const markdownPath = join(hit.skillDir, 'SKILL.md');
  const markdown = existsSync(markdownPath)
    ? readFileSync(markdownPath, 'utf8')
    : '';

  return {
    meta: hit.meta,
    sourceName: hit.sourceName,
    skillDir: hit.skillDir,
    markdown,
    installedTargets: getInstalledTargetsForSkill(ctx, config, skillName),
  };
}

export function listWebInstalledSkills(
  ctx: CliContext,
  options: { scope?: string; agent?: string },
): { items: WebInstalledSkill[] } {
  const config = ctx.loadConfig();
  const isGlobal = options.scope === 'global';
  const targets = options.agent
    ? [options.agent]
    : listKnownInstallTargets(config);
  const items: WebInstalledSkill[] = [];

  for (const target of targets) {
    if (target !== SKILLS_TARGET_TOKEN && !config.agents[target]) {
      throw new WebApiError(
        'UNKNOWN_INSTALL_TARGET',
        `Unknown install target: ${target}`,
        400,
      );
    }
    const root = getTargetRoot(ctx, config, target, isGlobal);
    for (const name of getInstalledSkills(root)) {
      items.push({
        target: isGlobal ? `${target}:global` : target,
        name,
        path: join(root, name),
      });
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
