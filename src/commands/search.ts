import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import { collectMetasFromSources } from '../cli/helpers.js';
import { searchSkills } from '../lib/skills.js';
import { warn } from '../utils/output.js';

export function registerSearch(program: Command, ctx: CliContext): void {
  program
    .command('search')
    .description('Search skills by keyword')
    .argument('[keyword]', 'search keyword')
    .option('--query <keyword>', 'search keyword')
    .option('--source <name>', 'source name, or omit to use default source')
    .action((keyword: string | undefined, opts: { query?: string; source?: string }) => {
      const searchKeyword = opts.query ?? keyword;
      if (!searchKeyword?.trim()) {
        throw new Error('Search keyword is required');
      }
      const config = ctx.loadConfig();
      const sourceFilter = opts.source ?? config.defaultSource;
      const rows = collectMetasFromSources(ctx, config, sourceFilter);
      const metas = rows.map((r) => r.meta);
      const found = searchSkills(metas, searchKeyword);
      if (found.length === 0) {
        warn('No skills found');
        return;
      }
      for (const m of found) {
        console.log(m.name);
      }
    });
}
