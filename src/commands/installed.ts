import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import { toAbsoluteInstallRoot } from '../cli/paths.js';
import {
  getEffectiveInstallTargets,
  resolveDisplayPathForToken,
  SKILLS_TARGET_TOKEN,
} from '../lib/install-targets.js';
import { getInstalledSkills } from '../lib/agents.js';
import { warn } from '../utils/output.js';

export function registerInstalled(program: Command, ctx: CliContext): void {
  program
    .command('installed')
    .description('List installed skills')
    .option('-g, --global', 'global install directory')
    .option('--agent <name>', 'only this agent (overrides installTargets)')
    .option(
      '--env <csv>',
      'comma-separated targets for this run only',
    )
    .action((opts: { global?: boolean; agent?: string; env?: string }) => {
      const config = ctx.loadConfig();
      const tokens = getEffectiveInstallTargets(
        config,
        {
          agent: opts.agent,
          envCsv: opts.env,
        },
        ctx.cwd,
      );
      const isGlobal = opts.global ?? false;

      let any = false;
      for (const token of tokens) {
        const display = resolveDisplayPathForToken(config, token, isGlobal);
        const abs = toAbsoluteInstallRoot(display, ctx.cwd, ctx.userHome);
        const names = getInstalledSkills(abs);
        const label = token === SKILLS_TARGET_TOKEN ? 'skills' : token;
        for (const n of names) {
          console.log(`${label}\t${n}`);
          any = true;
        }
      }
      if (!any) {
        warn('No skills installed');
      }
    });
}
