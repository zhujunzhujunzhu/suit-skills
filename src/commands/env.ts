import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import {
  detectGlobalEnvironmentHints,
  detectProjectEnvironmentHints,
  normalizeInstallTargets,
  parseInstallTargetsCsv,
} from '../lib/install-targets.js';
import { saveConfig } from '../lib/config.js';
import { success } from '../utils/output.js';

export function registerEnv(program: Command, ctx: CliContext): void {
  const env = program.command('env').description('Install targets (multi-environment)');

  env
    .command('list')
    .description('Show configured install targets and global directory hints')
    .action(() => {
      const cfg = ctx.loadConfig();
      const targets = normalizeInstallTargets(cfg);
      const hints = detectGlobalEnvironmentHints(ctx.userHome);
      const projectHints = detectProjectEnvironmentHints(ctx.cwd, cfg);
      const auto =
        cfg.installTargetsAuto === false ? 'off (fixed list)' : 'on (merge project dirs)';
      console.log(`installTargets: ${targets.join(', ')}`);
      console.log(`installTargetsAuto: ${auto}`);
      console.log(`detected (this project): ${projectHints.length ? projectHints.join(', ') : '(none)'}`);
      console.log(`detected (user home hints): ${hints.length ? hints.join(', ') : '(none)'}`);
    });

  env
    .command('set')
    .description('Set install targets (comma-separated: skills,claude,cursor,...)')
    .argument('<csv>', 'e.g. skills,claude,cursor')
    .action((csv: string) => {
      const cfg = ctx.loadConfig();
      const list = parseInstallTargetsCsv(csv, cfg);
      cfg.installTargets = list;
      cfg.installTargetsAuto = false;
      saveConfig(cfg, ctx.configOptions);
      success(`installTargets set to: ${list.join(', ')} (auto-merge from project dirs: off)`);
    });

  env
    .command('auto')
    .description('Turn install target auto-detection from project dirs on or off')
    .argument('<state>', 'on | off')
    .action((state: string) => {
      const s = state.trim().toLowerCase();
      if (s !== 'on' && s !== 'off') {
        throw new Error('state must be "on" or "off"');
      }
      const cfg = ctx.loadConfig();
      cfg.installTargetsAuto = s === 'on';
      saveConfig(cfg, ctx.configOptions);
      success(
        s === 'on'
          ? 'installTargetsAuto: on (default install will merge detected agent dirs in this project)'
          : 'installTargetsAuto: off (only installTargets list is used)',
      );
    });
}
