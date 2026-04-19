import type { Command } from 'commander';
import type { Config, SkillMeta } from '../types/index.js';
import type { CliContext } from '../cli/context.js';
import { assertSourceExists } from '../cli/helpers.js';
import { getEffectiveSourceUrl } from '../lib/config.js';
import { findSkillInCache, readSkillMarkdown } from '../lib/skills.js';
import { warn } from '../utils/output.js';

interface InfoOptions {
  source?: string;
  refresh?: boolean;
  json?: boolean;
}

function findSkillAcrossSources(
  ctx: CliContext,
  config: Config,
  sourceFilter: string,
  identifier: string,
  forceRefresh: boolean,
): { meta: SkillMeta; sourceName: string; cachePath: string } | null {
  const names =
    sourceFilter === 'all'
      ? config.sources.filter((s) => s.enabled).map((s) => s.name)
      : [sourceFilter];

  for (const n of names) {
    const src = assertSourceExists(config, n);
    const r = ctx.refreshForSource(src, { force: forceRefresh });
    if (!('skipped' in r)) {
      warn(`Refreshing source ${src.name} (${getEffectiveSourceUrl(src)})...`);
    }
    if ('warning' in r) {
      warn(r.warning);
    }
    const meta = findSkillInCache(r.path, identifier);
    if (meta) {
      return { meta, sourceName: src.name, cachePath: r.path };
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
    .option('--refresh', 'force refresh source cache')
    .option('--json', 'output as JSON')
    .action((nameArg: string, opts: InfoOptions) => {
      const config = ctx.loadConfig();
      const sourceFilter = opts.source ?? config.defaultSource;
      const hit = findSkillAcrossSources(
        ctx,
        config,
        sourceFilter,
        nameArg.trim(),
        opts.refresh === true,
      );
      if (!hit) {
        throw new Error('Skill not found');
      }
      const { meta, sourceName, cachePath } = hit;

      // 读取 SKILL.md 内容
      const markdown = readSkillMarkdown(cachePath, meta.name);

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              name: meta.name,
              version: meta.version,
              description: meta.description,
              author: meta.author,
              tags: meta.tags,
              sourceName,
              markdown,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(`name: ${meta.name}`);
        console.log(`version: ${meta.version}`);
        if (meta.description) console.log(`description: ${meta.description}`);
        if (meta.author) console.log(`author: ${meta.author}`);
        if (meta.tags?.length) console.log(`tags: ${meta.tags.join(', ')}`);
        console.log(`source: ${sourceName}`);
      }
    });
}
