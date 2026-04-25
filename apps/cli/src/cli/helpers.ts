import type { Config, SkillMeta, Source } from '../types/index.js';
import type { CliContext } from './context.js';
import { includesInsensitive, scanSkillsFromCache } from '@suit-skills/core';
import { getEffectiveSourceUrl } from '@suit-skills/core';
import { warn } from '../utils/output.js';

export function findSourceByName(config: Config, name: string): Source | null {
  return config.sources.find((s) => s.name === name) ?? null;
}

export function assertSourceExists(config: Config, name: string): Source {
  const s = findSourceByName(config, name);
  if (!s) {
    throw new Error('Source not found');
  }
  return s;
}

export type MetaWithSource = { meta: SkillMeta; sourceName: string };

/** 拉取并扫描源；`sourceFilter` 为 `all` 时只处理 `enabled` 的源。 */
export function collectMetasFromSources(
  ctx: CliContext,
  config: Config,
  sourceFilter: string,
  options: { forceRefresh?: boolean } = {},
): MetaWithSource[] {
  const names =
    sourceFilter === 'all'
      ? config.sources.filter((s) => s.enabled).map((s) => s.name)
      : [sourceFilter];

  const seen = new Set<string>();
  const out: MetaWithSource[] = [];

  for (const n of names) {
    const src = findSourceByName(config, n);
    if (!src) {
      throw new Error('Source not found');
    }
    const r = ctx.refreshForSource(src, { force: options.forceRefresh });
    if (!('skipped' in r)) {
      warn(`Refreshing source ${src.name} (${getEffectiveSourceUrl(src)})...`);
    }
    if ('warning' in r) {
      warn(r.warning);
    }
    const metas = scanSkillsFromCache(r.path);
    for (const meta of metas) {
      if (seen.has(meta.name)) continue;
      seen.add(meta.name);
      out.push({ meta, sourceName: src.name });
    }
  }
  return out;
}

export function tagMatches(meta: SkillMeta, tagFilter: string): boolean {
  const t = tagFilter.trim();
  if (!t) return true;
  return (
    meta.tags?.some((x) => includesInsensitive(x, t)) === true
  );
}
