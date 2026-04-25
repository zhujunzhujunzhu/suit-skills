import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import { toAbsoluteInstallRoot } from '../cli/paths.js';
import { assertSourceExists } from '../cli/helpers.js';
import {
  getEffectiveInstallTargets,
  resolveDisplayPathForToken,
} from '@suit-skills/core';
import { getEffectiveSourceUrl } from '@suit-skills/core';
import {
  findSkillInCache,
  getInstalledSkills,
  getSkillSourceDir,
} from '@suit-skills/core';
import {
  copyDir,
  eq,
  gt,
  parseSkillIdentifier,
  validateSkillName,
} from '@suit-skills/core';
import { success, warn } from '../utils/output.js';

function readLocalVersion(skillDir: string): string {
  const p = join(skillDir, 'meta.json');
  const raw = JSON.parse(readFileSync(p, 'utf8')) as { version?: string };
  return raw.version ?? '0.0.0';
}

function updateSkillDir(
  cacheRoot: string,
  skillName: string,
  installRoot: string,
  label: string,
): void {
  const dest = join(installRoot, skillName);
  const remote = findSkillInCache(cacheRoot, skillName);
  if (!remote) {
    warn(`[${label}] ${skillName}: skip (not in cache)`);
    return;
  }
  const localVer = readLocalVersion(dest);
  if (eq(remote.version, localVer)) {
    warn(`[${label}] ${skillName}: Already up to date`);
    return;
  }
  if (!gt(remote.version, localVer)) {
    warn(`[${label}] ${skillName}: Already up to date`);
    return;
  }
  const srcDir = getSkillSourceDir(cacheRoot, skillName);
  if (!srcDir) {
    warn(`[${label}] ${skillName}: skip (not in cache)`);
    return;
  }
  rmSync(dest, { recursive: true, force: true });
  copyDir(srcDir, dest);
  success(`[${label}] ${skillName}: updated`);
}

export function registerUpdate(program: Command, ctx: CliContext): void {
  program
    .command('update')
    .description('Update installed skills from the default source cache')
    .argument('[skill]', 'skill folder name or name@version (directory is always by name)')
    .option('-g, --global', 'global install directory')
    .option('--agent <name>', 'only this agent (overrides installTargets)')
    .option('--env <csv>', 'comma-separated targets for this run only')
    .action(
      (
        skill: string | undefined,
        opts: { global?: boolean; agent?: string; env?: string },
      ) => {
        let skillName: string | undefined;
        if (skill !== undefined && skill.trim() !== '') {
          const { name } = parseSkillIdentifier(skill.trim());
          if (!validateSkillName(name)) {
            throw new Error('Invalid skill name');
          }
          skillName = name;
        }

        const config = ctx.loadConfig();
        const src = assertSourceExists(config, config.defaultSource);
        const refresh = ctx.refreshForSource(src);
        if (!('skipped' in refresh)) {
          warn(`Refreshing source ${src.name} (${getEffectiveSourceUrl(src)})...`);
        }
        if ('warning' in refresh) {
          warn(refresh.warning);
        }
        const cacheRoot = refresh.path;

        const tokens = getEffectiveInstallTargets(
          config,
          {
            agent: opts.agent,
            envCsv: opts.env,
          },
          ctx.cwd,
        );
        const isGlobal = opts.global ?? false;

        for (const token of tokens) {
          const display = resolveDisplayPathForToken(config, token, isGlobal);
          const abs = toAbsoluteInstallRoot(display, ctx.cwd, ctx.userHome);

          if (skillName) {
            const names = getInstalledSkills(abs);
            if (!names.includes(skillName)) {
              continue;
            }
            updateSkillDir(cacheRoot, skillName, abs, token);
            continue;
          }

          const installed = getInstalledSkills(abs);
          for (const name of installed) {
            updateSkillDir(cacheRoot, name, abs, token);
          }
        }

        if (skillName) {
          let found = false;
          for (const token of tokens) {
            const display = resolveDisplayPathForToken(config, token, isGlobal);
            const abs = toAbsoluteInstallRoot(display, ctx.cwd, ctx.userHome);
            if (getInstalledSkills(abs).includes(skillName)) {
              found = true;
              break;
            }
          }
          if (!found) {
            throw new Error('Skill not installed');
          }
        }
      },
    );
}
