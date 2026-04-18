import type { Command } from 'commander';
import type { Source } from '../types/index.js';
import type { CliContext } from '../cli/context.js';
import { findSourceByName } from '../cli/helpers.js';
import {
  getBuiltinSourceInfo,
  getEffectiveSourceUrl,
  restoreBuiltinSources,
  type BuiltinSourceCategory,
} from '../lib/config.js';
import { success } from '../utils/output.js';

function urlExists(config: { sources: Source[] }, url: string): boolean {
  const u = url.trim();
  return config.sources.some(
    (s) => s.url.trim() === u || s.domesticMirror?.url.trim() === u,
  );
}

interface SourceListOptions {
  json?: boolean;
}

interface SourceOutput extends Source {
  builtin: boolean;
  label: string;
  category: BuiltinSourceCategory | 'custom';
  description: string;
  effectiveUrl: string;
}

function decorateSource(source: Source): SourceOutput {
  const builtin = getBuiltinSourceInfo(source);
  if (!builtin) {
    return {
      ...source,
      builtin: false,
      label: source.name,
      category: 'custom',
      description: 'User-defined skill source.',
      effectiveUrl: getEffectiveSourceUrl(source),
    };
  }
  return {
    ...source,
    builtin: true,
    label: builtin.label,
    category: builtin.category,
    description: builtin.description,
    effectiveUrl: getEffectiveSourceUrl(source),
  };
}

function sourceJsonPayload(config: { defaultSource: string; sources: Source[] }) {
  return {
    sources: config.sources.map(decorateSource),
    defaultSource: config.defaultSource,
  };
}

function printSourceList(ctx: CliContext, opts: SourceListOptions): void {
  const cfg = ctx.loadConfig();
  if (opts.json) {
    console.log(JSON.stringify(sourceJsonPayload(cfg), null, 2));
    return;
  }
  for (const s of cfg.sources) {
    const decorated = decorateSource(s);
    const label = decorated.builtin
      ? `${decorated.label} (${decorated.name})`
      : decorated.name;
    const mirrorStatus = decorated.domesticMirror
      ? decorated.domesticMirror.enabled
        ? 'mirror:on'
        : 'mirror:off'
      : 'mirror:none';
    console.log(
      `${label}\t${decorated.url}\teffective:${decorated.effectiveUrl}\t${decorated.enabled ? 'enabled' : 'disabled'}\t${mirrorStatus}`,
    );
  }
}

export function registerSource(program: Command, ctx: CliContext): void {
  const src = program
    .command('source')
    .description('Manage remote skill sources');

  // 无子命令时显示列表
  src
    .command('list')
    .description('List sources')
    .option('--json', 'output as JSON')
    .action((opts: SourceListOptions) => {
      printSourceList(ctx, opts);
    });

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
    .command('restore-builtins')
    .description('Restore missing built-in sources')
    .option('--json', 'output as JSON')
    .action((opts: SourceListOptions) => {
      const cfg = ctx.loadConfig();
      const added = restoreBuiltinSources(cfg);
      ctx.saveConfig(cfg);
      if (opts.json) {
        console.log(JSON.stringify({ ...sourceJsonPayload(cfg), added }, null, 2));
        return;
      }
      success(
        added.length > 0
          ? `Added ${added.length} built-in source(s)`
          : 'Built-in sources already present',
      );
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
    .command('mirror')
    .description('Enable or disable the domestic mirror for a built-in source')
    .argument('<name>', 'source name')
    .argument('<state>', 'on | off')
    .action((name: string, state: string) => {
      const cfg = ctx.loadConfig();
      const s = findSourceByName(cfg, name);
      if (!s) {
        throw new Error('Source not found');
      }
      if (!s.domesticMirror) {
        throw new Error('Source has no domestic mirror');
      }
      const normalized = state.trim().toLowerCase();
      if (normalized !== 'on' && normalized !== 'off') {
        throw new Error('Mirror state must be on or off');
      }
      s.domesticMirror.enabled = normalized === 'on';
      ctx.saveConfig(cfg);
      success(
        `Domestic mirror ${s.domesticMirror.enabled ? 'enabled' : 'disabled'} for ${name}`,
      );
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
