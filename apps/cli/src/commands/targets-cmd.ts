import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import {
  addWebInstallTarget,
  listWebInstallTargets,
  removeWebInstallTarget,
  updateWebInstallTarget,
  WebApiError,
} from '../lib/web/api.js';
import { listUiInstallTargets } from '@suit-skills/core';
import { success } from '../utils/output.js';

export function registerTargets(program: Command, ctx: CliContext): void {
  const cmd = program
    .command('targets')
    .description('Install target helpers (for UI and config)');

  cmd
    .command('list')
    .description('List install targets shown in Web UI')
    .option('--json', 'output as JSON')
    .action((opts: { json?: boolean }) => {
      const config = ctx.loadConfig();
      if (opts.json) {
        console.log(JSON.stringify(listWebInstallTargets(ctx), null, 2));
      } else {
        const rows = listUiInstallTargets(config);
        for (const row of rows) {
          console.log(`${row.id}\t${row.label}`);
        }
      }
    });

  cmd
    .command('add')
    .description('Add a custom install target (writes agents.<id> to config)')
    .argument('<id>', 'target id, e.g. my-corp')
    .requiredOption('--global-dir <path>', 'e.g. ~/.my-corp/skills')
    .requiredOption('--project-dir <path>', 'e.g. ./.my-corp/skills')
    .action(
      (
        id: string,
        opts: {
          globalDir: string;
          projectDir: string;
        },
      ) => {
        try {
          addWebInstallTarget(ctx, {
            id,
            globalDir: opts.globalDir,
            projectDir: opts.projectDir,
          });
          success(`Added install target ${id.trim().toLowerCase()}`);
        } catch (e) {
          if (e instanceof WebApiError) {
            console.error(e.message);
            process.exitCode = 1;
            return;
          }
          throw e;
        }
      },
    );

  cmd
    .command('edit')
    .description('Edit an install target path mapping')
    .argument('<id>', 'target id, e.g. my-corp')
    .option('--global-dir <path>', 'e.g. ~/.my-corp/skills')
    .option('--project-dir <path>', 'e.g. ./.my-corp/skills')
    .action(
      (
        id: string,
        opts: {
          globalDir?: string;
          projectDir?: string;
        },
      ) => {
        try {
          updateWebInstallTarget(ctx, id, {
            globalDir: opts.globalDir,
            projectDir: opts.projectDir,
          });
          success(`Updated install target ${id.trim().toLowerCase()}`);
        } catch (e) {
          if (e instanceof WebApiError) {
            console.error(e.message);
            process.exitCode = 1;
            return;
          }
          throw e;
        }
      },
    );

  cmd
    .command('remove')
    .description('Remove a custom install target from config')
    .argument('<id>', 'target id, e.g. my-corp')
    .action((id: string) => {
      try {
        removeWebInstallTarget(ctx, id);
        success(`Removed install target ${id.trim().toLowerCase()}`);
      } catch (e) {
        if (e instanceof WebApiError) {
          console.error(e.message);
          process.exitCode = 1;
          return;
        }
        throw e;
      }
    });
}
