import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import { toAbsoluteInstallRoot } from '../cli/paths.js';
import { assertSourceExists } from '../cli/helpers.js';
import {
  getEffectiveInstallTargets,
  resolveDisplayPathForToken,
} from '../lib/install-targets.js';
import { installSkillWithConflict } from '../lib/install.js';
import { resolveInstallTargetsOrPrompt } from '../lib/prompt-install-targets.js';
import { parseSkillIdentifier, validateSkillName } from '../utils/validate.js';
import { success, warn } from '../utils/output.js';

export function registerInstall(program: Command, ctx: CliContext): void {
  program
    .command('install')
    .alias('i')
    .description('Install a skill from a source')
    .argument('<identifier>', 'skill name or name@version')
    .option('-g, --global', 'install to global skills directory')
    .option('--agent <name>', 'only this agent (overrides installTargets)')
    .option(
      '--env <csv>',
      'comma-separated targets for this run only (skills,claude,...)',
    )
    .option('--source <name>', 'use named source (default: config defaultSource)')
    .option(
      '--strategy <mode>',
      'on conflict: overwrite | skip | rename',
      'overwrite',
    )
    .action(
      async (
        identifier: string,
        opts: {
          global?: boolean;
          agent?: string;
          env?: string;
          source?: string;
          strategy?: string;
        },
      ) => {
        const id = identifier.trim();
        const { name } = parseSkillIdentifier(id);
        if (!validateSkillName(name)) {
          throw new Error('Invalid skill name');
        }

        const config = ctx.loadConfig();
        const sourceName = opts.source ?? config.defaultSource;
        const src = assertSourceExists(config, sourceName);
        const refresh = ctx.refreshForSource(src.url);
        const cacheRoot = refresh.path;

        const isGlobal = opts.global ?? false;
        let tokens = getEffectiveInstallTargets(
          config,
          {
            agent: opts.agent,
            envCsv: opts.env,
          },
          ctx.cwd,
        );
        if (tokens.length === 0) {
          tokens = await resolveInstallTargetsOrPrompt(ctx, config, isGlobal);
        }
        const strategy = (opts.strategy ?? 'overwrite') as
          | 'overwrite'
          | 'skip'
          | 'rename';

        for (const token of tokens) {
          const displayTarget = resolveDisplayPathForToken(
            config,
            token,
            isGlobal,
          );
          const absTarget = toAbsoluteInstallRoot(
            displayTarget,
            ctx.cwd,
            ctx.userHome,
          );

          try {
            const result = installSkillWithConflict(
              cacheRoot,
              absTarget,
              id,
              strategy,
            );

            if (result.skipped) {
              warn(`[${token}] ${result.message ?? 'Skipped'}`);
              continue;
            }
            success(`[${token}] Installed to ${result.path}`);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('Skill not found')) {
              throw new Error('Skill not found');
            }
            throw e;
          }
        }
      },
    );
}
