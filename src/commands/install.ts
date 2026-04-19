import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import { toAbsoluteInstallRoot } from '../cli/paths.js';
import { assertSourceExists } from '../cli/helpers.js';
import {
  getEffectiveInstallTargets,
  resolveDisplayPathForToken,
} from '../lib/install-targets.js';
import { getEffectiveSourceUrl } from '../lib/config.js';
import { installSkillWithConflict } from '../lib/install.js';
import { resolveInstallTargetsOrPrompt } from '../lib/prompt-install-targets.js';
import { parseSkillIdentifier, validateSkillName } from '../utils/validate.js';
import { success, warn } from '../utils/output.js';
import { createSymlink } from '../utils/fs.js';
import { join, resolve } from 'node:path';

/** 中央存储的 agent key */
const CENTRAL_STORE_AGENT = 'agents';

export function registerInstall(program: Command, ctx: CliContext): void {
  program
    .command('install')
    .alias('i')
    .alias('add')
    .description('Install a skill from a source')
    .argument('<identifier>', 'skill name or name@version')
    .option('--local', 'install to current project instead of global')
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
          local?: boolean;
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
        const refresh = ctx.refreshForSource(src);
        if (!('skipped' in refresh)) {
          warn(`Refreshing source ${src.name} (${getEffectiveSourceUrl(src)})...`);
        }
        if ('warning' in refresh) {
          warn(refresh.warning);
        }
        const cacheRoot = refresh.path;

        // 默认全局安装，--local 时安装到项目
        const isGlobal = !opts.local;
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

        // 全局 ~/.agents/skills 与项目 ./.agents/skills：先写入中央存储，再为其它目标创建软链接
        const centralDisplayTarget = resolveDisplayPathForToken(
          config,
          CENTRAL_STORE_AGENT,
          isGlobal,
        );
        const centralAbsTarget = toAbsoluteInstallRoot(
          centralDisplayTarget,
          ctx.cwd,
          ctx.userHome,
        );

        let centralResult: { path?: string; skipped?: boolean; message?: string };
        try {
          centralResult = installSkillWithConflict(
            cacheRoot,
            centralAbsTarget,
            id,
            strategy,
          );
          if (centralResult.skipped) {
            warn(`[${CENTRAL_STORE_AGENT}] ${centralResult.message ?? 'Skipped'}`);
            return;
          }
          success(`[${CENTRAL_STORE_AGENT}] Installed to ${centralResult.path}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('Skill not found')) {
            throw new Error('Skill not found');
          }
          throw e;
        }

        const centralSkillPath = centralResult.path;
        if (!centralSkillPath) {
          return;
        }

        for (const token of tokens) {
          if (token === CENTRAL_STORE_AGENT) {
            continue;
          }
          const displayTarget = resolveDisplayPathForToken(config, token, isGlobal);
          const absTarget = toAbsoluteInstallRoot(
            displayTarget,
            ctx.cwd,
            ctx.userHome,
          );
          const linkPath = join(absTarget, name);

          if (resolve(centralSkillPath) === resolve(linkPath)) {
            continue;
          }

          try {
            createSymlink(centralSkillPath, linkPath);
            success(`[${token}] Linked to ${linkPath}`);
          } catch (e) {
            warn(
              `[${token}] Failed to create symlink: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      },
    );
}
