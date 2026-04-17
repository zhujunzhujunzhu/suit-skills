import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import {
  collectMetasFromSources,
  tagMatches,
} from '../cli/helpers.js';

interface ListOptions {
  tag?: string;
  source?: string;
  json?: boolean;
}

export function registerList(program: Command, ctx: CliContext): void {
  program
    .command('list')
    .alias('ls')
    .description('List skills available from configured sources')
    .option('--tag <tag>', 'filter by tag substring')
    .option(
      '--source <name>',
      'source name, or "all" for all enabled sources',
    )
    .option('--json', 'output as JSON')
    .action((opts: ListOptions) => {
      const config = ctx.loadConfig();
      const sourceFilter = opts.source ?? config.defaultSource;
      let rows = collectMetasFromSources(ctx, config, sourceFilter);
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
      } else {
        for (const { meta } of rows) {
          console.log(meta.name);
        }
      }
    });
}
