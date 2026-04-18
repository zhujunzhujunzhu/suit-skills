import { join } from 'node:path';
import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import type { Config } from '../types/index.js';
import { toAbsoluteInstallRoot } from '../cli/paths.js';
import {
  getEffectiveInstallTargets,
  resolveDisplayPathForToken,
  SKILLS_TARGET_TOKEN,
} from '../lib/install-targets.js';
import { getInstalledSkills, getInstalledSkillDetail } from '../lib/agents.js';
import { warn } from '../utils/output.js';

interface InstalledOptions {
  global?: boolean;
  agent?: string;
  env?: string;
  scope?: string;
  json?: boolean;
}

type InstalledScope = 'project' | 'global';

function listKnownInstallTargets(config: Config): string[] {
  return [SKILLS_TARGET_TOKEN, ...Object.keys(config.agents)];
}

function getInstalledTargets(
  config: Config,
  opts: InstalledOptions,
  cwd: string,
): string[] {
  if (opts.agent || opts.env) {
    return getEffectiveInstallTargets(
      config,
      {
        agent: opts.agent,
        envCsv: opts.env,
      },
      cwd,
    );
  }
  return listKnownInstallTargets(config);
}

function getInstalledScopes(opts: InstalledOptions): InstalledScope[] {
  if (opts.global) {
    return ['global'];
  }
  if (opts.scope === undefined || opts.scope === '' || opts.scope === 'project') {
    return ['project'];
  }
  if (opts.scope === 'global') {
    return ['global'];
  }
  if (opts.scope === 'all') {
    return ['global', 'project'];
  }
  throw new Error(`Invalid scope: ${opts.scope}`);
}

export function registerInstalled(program: Command, ctx: CliContext): void {
  program
    .command('installed')
    .description('List installed skills')
    .option('-g, --global', 'global install directory')
    .option('--scope <scope>', 'install scope: all, project, or global')
    .option('--agent <name>', 'only this agent (overrides installTargets)')
    .option(
      '--env <csv>',
      'comma-separated targets for this run only',
    )
    .option('--json', 'output as JSON')
    .action((opts: InstalledOptions) => {
      const config = ctx.loadConfig();
      const tokens = getInstalledTargets(config, opts, ctx.cwd);
      const scopes = getInstalledScopes(opts);

      const items: Array<{
        name: string;
        target: string;
        scope: string;
        path: string;
        description?: string;
        version?: string;
        sourceName?: string;
      }> = [];

      for (const scope of scopes) {
        const isGlobal = scope === 'global';
        for (const token of tokens) {
          const display = resolveDisplayPathForToken(config, token, isGlobal);
          const abs = toAbsoluteInstallRoot(display, ctx.cwd, ctx.userHome);
          const names = getInstalledSkills(abs);
          const label = token === SKILLS_TARGET_TOKEN ? 'skills' : token;

          for (const n of names) {
            const detail = getInstalledSkillDetail(abs, n);
            items.push({
              name: n,
              target: label,
              scope,
              path: join(abs, n),
              description:
                detail && typeof detail.description === 'string'
                  ? detail.description
                  : undefined,
              version:
                detail && typeof detail.version === 'string'
                  ? detail.version
                  : undefined,
              sourceName:
                detail && typeof detail.sourceName === 'string'
                  ? detail.sourceName
                  : undefined,
            });
          }
        }
      }

      if (opts.json) {
        console.log(JSON.stringify({ items }, null, 2));
      } else {
        if (items.length === 0) {
          warn('No skills installed');
          return;
        }
        for (const item of items) {
          console.log(`${item.target}\t${item.name}`);
        }
      }
    });
}
