import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import {
  collectMetasFromSources,
  tagMatches,
} from '../cli/helpers.js';

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
    .action((opts: { tag?: string; source?: string }) => {
      const config = ctx.loadConfig();
      const sourceFilter = opts.source ?? config.defaultSource;
      let rows = collectMetasFromSources(ctx, config, sourceFilter);
      if (opts.tag) {
        rows = rows.filter(({ meta }) => tagMatches(meta, opts.tag!));
      }
      for (const { meta } of rows) {
        console.log(meta.name);
      }
    });
}
