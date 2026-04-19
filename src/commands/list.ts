import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import {
  collectMetasFromSources,
  tagMatches,
} from '../cli/helpers.js';
import { searchSkills } from '../lib/skills.js';

interface ListOptions {
  query?: string;
  tag?: string;
  source?: string;
  refresh?: boolean;
  json?: boolean;
}

export function registerList(program: Command, ctx: CliContext): void {
  program
    .command('list')
    .alias('ls')
    .description('List skills available from configured sources')
    .option('--query <keyword>', 'filter by search keyword')
    .option('--tag <tag>', 'filter by tag substring')
    .option(
      '--source <name>',
      'source name, or "all" for all enabled sources',
    )
    .option('--refresh', 'force refresh source cache')
    .option('--json', 'output as JSON')
    .action((opts: ListOptions) => {
      const config = ctx.loadConfig();
      const sourceFilter = opts.source ?? config.defaultSource;
      let rows = collectMetasFromSources(ctx, config, sourceFilter, {
        forceRefresh: opts.refresh === true,
      });
      if (opts.query?.trim()) {
        const found = new Set(
          searchSkills(
            rows.map((row) => row.meta),
            opts.query,
          ).map((meta) => meta.name),
        );
        rows = rows.filter(({ meta }) => found.has(meta.name));
      }
      if (opts.tag) {
        rows = rows.filter(({ meta }) => tagMatches(meta, opts.tag!));
      }

      if (opts.json) {
        const items = rows.map(({ meta, sourceName }) => ({
          name: meta.name,
          version: meta.version,
          description: meta.description,
          author: meta.author,
          tags: meta.tags,
          sourceName,
        }));
        console.log(JSON.stringify({ items }, null, 2));
        return;
      }

      for (const { meta, sourceName } of rows) {
        const desc = meta.description ?? '';
        const version = meta.version ?? 'unknown';
        const tags = meta.tags?.join(', ') ?? '';
        const line = `${meta.name}\t${desc}\t[v${version}]\t(${sourceName})\t[${tags}]`;
        console.log(line);
      }
    });
}
