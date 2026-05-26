import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import { collectMetasFromSources } from '../cli/helpers.js';
import { searchSkills } from '@suit-skills/core';
import { warn } from '../utils/output.js';

interface SearchOptions {
  source?: string;
  query?: string;
  refresh?: boolean;
  json?: boolean;
}

export function registerSearch(program: Command, ctx: CliContext): void {
  program
    .command('search')
    .description('Search skills by keyword')
    .argument('[keyword]', 'search keyword')
    .option('--query <keyword>', 'search keyword')
    .option('--source <name>', 'source name, or omit to use default source')
    .option('--refresh', 'force refresh source cache')
    .option('--json', 'output as JSON')
    .action((keyword: string | undefined, opts: SearchOptions) => {
      const searchKeyword = opts.query ?? keyword;
      if (!searchKeyword?.trim()) {
        throw new Error('Search keyword is required');
      }
      const config = ctx.loadConfig();
      const sourceFilter = (opts.source ?? config.defaultSource) || 'all';
      const rows = collectMetasFromSources(ctx, config, sourceFilter, {
        forceRefresh: opts.refresh === true,
      });
      const metas = rows.map((r) => r.meta);
      const found = searchSkills(metas, searchKeyword);

      if (opts.json) {
        const items = found.map((m) => ({
          name: m.name,
          version: m.version,
          description: m.description,
          author: m.author,
          tags: m.tags,
        }));
        console.log(JSON.stringify({ items }, null, 2));
        return;
      }

      if (found.length === 0) {
        warn('No skills found');
        return;
      }
      for (const m of found) {
        console.log(m.name);
      }
    });
}
