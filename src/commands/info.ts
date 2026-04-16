import type { Command } from 'commander';
import type { Config, SkillMeta } from '../types/index.js';
import type { CliContext } from '../cli/context.js';
import { assertSourceExists } from '../cli/helpers.js';
import { findSkillInCache } from '../lib/skills.js';

function findSkillAcrossSources(
  ctx: CliContext,
  config: Config,
  sourceFilter: string,
  identifier: string,
): { meta: SkillMeta; sourceName: string } | null {
  const names =
    sourceFilter === 'all'
      ? config.sources.filter((s) => s.enabled).map((s) => s.name)
      : [sourceFilter];

  for (const n of names) {
    const src = assertSourceExists(config, n);
    const r = ctx.refreshForSource(src.url);
    const meta = findSkillInCache(r.path, identifier);
    if (meta) {
      return { meta, sourceName: src.name };
    }
  }
  return null;
}

export function registerInfo(program: Command, ctx: CliContext): void {
  program
    .command('info')
    .description('Show skill details')
    .argument('<name>', 'skill name or name@version')
    .option('--source <name>', 'source name, or "all", or omit for default')
    .action((nameArg: string, opts: { source?: string }) => {
      const config = ctx.loadConfig();
      const sourceFilter = opts.source ?? config.defaultSource;
      const hit = findSkillAcrossSources(
        ctx,
        config,
        sourceFilter,
        nameArg.trim(),
      );
      if (!hit) {
        throw new Error('Skill not found');
      }
      const { meta, sourceName } = hit;
      console.log(`name: ${meta.name}`);
      console.log(`version: ${meta.version}`);
      if (meta.description) console.log(`description: ${meta.description}`);
      if (meta.author) console.log(`author: ${meta.author}`);
      if (meta.tags?.length) console.log(`tags: ${meta.tags.join(', ')}`);
      console.log(`source: ${sourceName}`);
    });
}
