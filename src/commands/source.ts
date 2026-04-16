import type { Command } from 'commander';
import type { Source } from '../types/index.js';
import type { CliContext } from '../cli/context.js';
import { findSourceByName } from '../cli/helpers.js';
import { success } from '../utils/output.js';

function urlExists(config: { sources: Source[] }, url: string): boolean {
  const u = url.trim();
  return config.sources.some((s) => s.url.trim() === u);
}

export function registerSource(program: Command, ctx: CliContext): void {
  const src = program
    .command('source')
    .description('Manage remote skill sources');

  src
    .command('add')
    .description('Add a source')
    .argument('<name>', 'source name')
    .argument('<url>', 'git repository URL')
    .action((name: string, url: string) => {
      const cfg = ctx.loadConfig();
      if (findSourceByName(cfg, name)) {
        throw new Error('Source already exists');
      }
      if (urlExists(cfg, url)) {
        throw new Error('Source already exists');
      }
      cfg.sources.push({
        name,
        url: url.trim(),
        enabled: true,
      });
        ctx.saveConfig(cfg);
        success(`Added source ${name}`);
    });

  src
    .command('remove')
    .description('Remove a source')
    .argument('<name>', 'source name')
    .action((name: string) => {
      const cfg = ctx.loadConfig();
      if (name === 'default') {
        throw new Error('Cannot remove default source');
      }
      const idx = cfg.sources.findIndex((s) => s.name === name);
      if (idx === -1) {
        throw new Error('Source not found');
      }
      cfg.sources.splice(idx, 1);
        ctx.saveConfig(cfg);
        success(`Removed source ${name}`);
    });

  src
    .command('list')
    .description('List sources')
    .action(() => {
      const cfg = ctx.loadConfig();
      for (const s of cfg.sources) {
        console.log(
          `${s.name}\t${s.url}\t${s.enabled ? 'enabled' : 'disabled'}`,
        );
      }
    });

  src
    .command('enable')
    .description('Enable a source')
    .argument('<name>', 'source name')
    .action((name: string) => {
      const cfg = ctx.loadConfig();
      const s = findSourceByName(cfg, name);
      if (!s) {
        throw new Error('Source not found');
      }
      s.enabled = true;
      ctx.saveConfig(cfg);
    });

  src
    .command('disable')
    .description('Disable a source')
    .argument('<name>', 'source name')
    .action((name: string) => {
      const cfg = ctx.loadConfig();
      const s = findSourceByName(cfg, name);
      if (!s) {
        throw new Error('Source not found');
      }
      s.enabled = false;
      ctx.saveConfig(cfg);
    });

  src
    .command('default')
    .description('Set default source')
    .argument('<name>', 'source name')
    .action((name: string) => {
      const cfg = ctx.loadConfig();
      if (!findSourceByName(cfg, name)) {
        throw new Error('Source not found');
      }
      cfg.defaultSource = name;
      ctx.saveConfig(cfg);
    });
}
