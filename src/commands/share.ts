import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import {
  copyWebInstalledSkillPackage,
  exportWebInstalledSkill,
  linkWebInstalledSkillToTargets,
} from '../lib/web/api.js';
import { success } from '../utils/output.js';

interface InstalledActionOptions {
  json?: boolean;
  out?: string;
  scope?: 'project' | 'global';
  target: string;
  targets?: string;
}

function printResult(payload: unknown, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  success('Done');
}

export function registerShare(program: Command, ctx: CliContext): void {
  program
    .command('export')
    .description('Export an installed skill package')
    .argument('<name>', 'installed skill name')
    .requiredOption('--target <target>', 'source target')
    .option('--scope <scope>', 'project or global', 'project')
    .option('--out <path>', 'output zip path')
    .option('--json', 'output as JSON')
    .action((name: string, opts: InstalledActionOptions) => {
      const zip = exportWebInstalledSkill(ctx, {
        name,
        target: opts.target,
        scope: opts.scope,
      });
      const outputPath =
        opts.out ??
        join(tmpdir(), 'suit-skills-export', `${Date.now()}-${zip.fileName}`);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, zip.body);
      printResult(
        {
          status: 'exported',
          fileName: zip.fileName,
          path: outputPath,
        },
        opts.json,
      );
    });

  program
    .command('copy-package')
    .description('Copy an installed skill package zip to the clipboard')
    .argument('<name>', 'installed skill name')
    .requiredOption('--target <target>', 'source target')
    .option('--scope <scope>', 'project or global', 'project')
    .option('--json', 'output as JSON')
    .action((name: string, opts: InstalledActionOptions) => {
      const result = copyWebInstalledSkillPackage(ctx, {
        name,
        target: opts.target,
        scope: opts.scope,
      });
      printResult(result, opts.json);
    });

  program
    .command('link-targets')
    .description('Link an installed skill to other targets')
    .argument('<name>', 'installed skill name')
    .requiredOption('--target <target>', 'source target')
    .requiredOption('--targets <csv>', 'comma-separated destination targets')
    .option('--scope <scope>', 'project or global', 'project')
    .option('--json', 'output as JSON')
    .action((name: string, opts: InstalledActionOptions) => {
      const targets = (opts.targets ?? '')
        .split(',')
        .map((target) => target.trim())
        .filter(Boolean);
      const result = linkWebInstalledSkillToTargets(ctx, {
        name,
        target: opts.target,
        scope: opts.scope,
        targets,
      });
      printResult(result, opts.json);
    });
}
