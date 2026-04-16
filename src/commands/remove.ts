import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import { toAbsoluteInstallRoot } from '../cli/paths.js';
import {
  getEffectiveInstallTargets,
  resolveDisplayPathForToken,
} from '../lib/install-targets.js';
import { parseSkillIdentifier, validateSkillName } from '../utils/validate.js';
import { success } from '../utils/output.js';

export function registerRemove(program: Command, ctx: CliContext): void {
  program
    .command('remove')
    .alias('rm')
    .description('Remove an installed skill')
    .argument('<name>', 'skill name')
    .option('-g, --global', 'global install directory')
    .option('--agent <name>', 'only this agent (overrides installTargets)')
    .option('--env <csv>', 'comma-separated targets for this run only')
    .action((nameArg: string, opts: { global?: boolean; agent?: string; env?: string }) => {
      const { name } = parseSkillIdentifier(nameArg.trim());
      if (!validateSkillName(name)) {
        throw new Error('Invalid skill name');
      }

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

      const removed: string[] = [];
      for (const token of tokens) {
        const display = resolveDisplayPathForToken(config, token, isGlobal);
        const abs = toAbsoluteInstallRoot(display, ctx.cwd, ctx.userHome);
        const target = join(abs, name);
        if (existsSync(target)) {
          rmSync(target, { recursive: true, force: true });
          removed.push(`[${token}] ${target}`);
        }
      }
      if (removed.length === 0) {
        throw new Error('Skill not installed');
      }
      success(`Removed ${name} from ${removed.length} location(s)`);
    });
}
