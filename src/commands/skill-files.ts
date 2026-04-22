import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import {
  getWebSkillFileContent,
  getWebSkillFileTree,
  WebApiError,
} from '../lib/web/api.js';

function rethrowApi(e: unknown): never {
  if (e instanceof WebApiError) {
    throw new Error(`${e.code}: ${e.message}`);
  }
  throw e;
}

/**
 * 输出技能目录文件树 JSON（供桌面端读取，与 Web `/api/skills/:name/files` 对齐）。
 */
export function registerSkillFilesCommands(program: Command, ctx: CliContext): void {
  program
    .command('skill-files')
    .description('Print skill file tree as JSON (for desktop app)')
    .argument('<name>', 'skill name')
    .option('--source <name>', 'source name, or omit to search all enabled sources')
    .action((name: string, opts: { source?: string }) => {
      try {
        const result = getWebSkillFileTree(ctx, name.trim(), { source: opts.source });
        process.stdout.write(JSON.stringify(result));
      } catch (e) {
        rethrowApi(e);
      }
    });

  program
    .command('skill-file-content')
    .description('Print skill file payload as JSON (for desktop app)')
    .argument('<name>', 'skill name')
    .requiredOption('--file <path>', 'path relative to skill root')
    .option('--source <name>', 'source name, or omit to search all enabled sources')
    .action((name: string, opts: { file: string; source?: string }) => {
      try {
        const result = getWebSkillFileContent(ctx, name.trim(), opts.file, {
          source: opts.source,
        });
        process.stdout.write(JSON.stringify(result));
      } catch (e) {
        rethrowApi(e);
      }
    });
}
