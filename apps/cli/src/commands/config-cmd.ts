import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import { getConfigValue, setConfigValue } from '@suit-skills/core';

export function registerConfig(program: Command, ctx: CliContext): void {
  const cfgCmd = program
    .command('config')
    .description('View or edit configuration');

  cfgCmd
    .command('list')
    .description('Print full config as JSON')
    .action(() => {
      const cfg = ctx.loadConfig();
      console.log(JSON.stringify(cfg, null, 2));
    });

  cfgCmd
    .command('get')
    .description('Get a config value by dotted path')
    .argument('<path>', 'e.g. defaultSource')
    .action((path: string) => {
      const cfg = ctx.loadConfig();
      const v = getConfigValue(cfg, path);
      console.log(v === undefined ? 'undefined' : JSON.stringify(v));
    });

  cfgCmd
    .command('set')
    .description('Set a config value by dotted path')
    .argument('<path>', 'dotted path')
    .argument('<value>', 'value (JSON or plain string)')
    .action((path: string, valueRaw: string) => {
      let value: unknown = valueRaw;
      try {
        value = JSON.parse(valueRaw) as unknown;
      } catch {
        // 保留原始字符串
      }
      setConfigValue(path, value, ctx.configOptions);
    });
}
