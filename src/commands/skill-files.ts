import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import {
  applyWebInstalledSkillAiEdit,
  generateWebInstalledSkillAiEdit,
  getWebInstalledSkillFileContent,
  getWebInstalledSkillFileTree,
  getWebSkillFileContent,
  getWebSkillFileTree,
  resetWebInstalledSkill,
  resetWebInstalledSkillFile,
  saveWebInstalledSkillFile,
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

  program
    .command('installed-skill-files')
    .description('Print installed skill file tree as JSON (for desktop app)')
    .argument('<name>', 'skill name')
    .requiredOption('--target <target>', 'install target, e.g. agents/claude/cursor')
    .option('--scope <scope>', 'project or global', 'project')
    .action((name: string, opts: { target: string; scope?: 'project' | 'global' }) => {
      try {
        const result = getWebInstalledSkillFileTree(ctx, name.trim(), {
          target: opts.target,
          scope: opts.scope,
        });
        process.stdout.write(JSON.stringify(result));
      } catch (e) {
        rethrowApi(e);
      }
    });

  program
    .command('installed-skill-file-content')
    .description('Print installed skill file payload as JSON (for desktop app)')
    .argument('<name>', 'skill name')
    .requiredOption('--target <target>', 'install target, e.g. agents/claude/cursor')
    .requiredOption('--file <path>', 'path relative to skill root')
    .option('--scope <scope>', 'project or global', 'project')
    .action(
      (
        name: string,
        opts: { target: string; file: string; scope?: 'project' | 'global' },
      ) => {
        try {
          const result = getWebInstalledSkillFileContent(
            ctx,
            name.trim(),
            opts.file,
            {
              target: opts.target,
              scope: opts.scope,
            },
          );
          process.stdout.write(JSON.stringify(result));
        } catch (e) {
          rethrowApi(e);
        }
      },
    );

  program
    .command('save-installed-skill-file')
    .description('Save installed skill text file content as JSON (for desktop app)')
    .argument('<name>', 'skill name')
    .requiredOption('--target <target>', 'install target, e.g. agents/claude/cursor')
    .requiredOption('--file <path>', 'path relative to skill root')
    .requiredOption('--content-base64 <data>', 'base64 encoded utf-8 file content')
    .option('--scope <scope>', 'project or global', 'project')
    .action(
      (
        name: string,
        opts: {
          target: string;
          file: string;
          contentBase64: string;
          scope?: 'project' | 'global';
        },
      ) => {
        try {
          const content = Buffer.from(opts.contentBase64, 'base64').toString('utf8');
          const result = saveWebInstalledSkillFile(ctx, name.trim(), opts.file, {
            target: opts.target,
            scope: opts.scope,
            content,
          });
          process.stdout.write(JSON.stringify(result));
        } catch (e) {
          rethrowApi(e);
        }
      },
    );

  program
    .command('reset-installed-skill-file')
    .description('Restore one installed skill file from the install baseline')
    .argument('<name>', 'skill name')
    .requiredOption('--target <target>', 'install target, e.g. agents/claude/cursor')
    .requiredOption('--file <path>', 'path relative to skill root')
    .option('--scope <scope>', 'project or global', 'project')
    .action(
      (
        name: string,
        opts: { target: string; file: string; scope?: 'project' | 'global' },
      ) => {
        try {
          const result = resetWebInstalledSkillFile(ctx, name.trim(), {
            target: opts.target,
            scope: opts.scope,
            filePath: opts.file,
          });
          process.stdout.write(JSON.stringify(result));
        } catch (e) {
          rethrowApi(e);
        }
      },
    );

  program
    .command('reset-installed-skill')
    .description('Restore an installed skill directory from the install baseline')
    .argument('<name>', 'skill name')
    .requiredOption('--target <target>', 'install target, e.g. agents/claude/cursor')
    .option('--scope <scope>', 'project or global', 'project')
    .action(
      (name: string, opts: { target: string; scope?: 'project' | 'global' }) => {
        try {
          const result = resetWebInstalledSkill(ctx, name.trim(), {
            target: opts.target,
            scope: opts.scope,
          });
          process.stdout.write(JSON.stringify(result));
        } catch (e) {
          rethrowApi(e);
        }
      },
    );

  program
    .command('ai-edit-installed-skill')
    .description('Generate an AI edit preview for an installed skill')
    .argument('<name>', 'skill name')
    .requiredOption('--target <target>', 'install target, e.g. agents/claude/cursor')
    .requiredOption('--mode <mode>', 'file or skill')
    .requiredOption('--prompt-base64 <data>', 'base64 encoded utf-8 edit prompt')
    .option('--file <path>', 'path relative to skill root when mode=file')
    .option('--scope <scope>', 'project or global', 'project')
    .action(
      async (
        name: string,
        opts: {
          target: string;
          mode: 'file' | 'skill';
          promptBase64: string;
          file?: string;
          scope?: 'project' | 'global';
        },
      ) => {
        try {
          const prompt = Buffer.from(opts.promptBase64, 'base64').toString('utf8');
          const result = await generateWebInstalledSkillAiEdit(ctx, name.trim(), {
            target: opts.target,
            scope: opts.scope,
            mode: opts.mode === 'skill' ? 'skill' : 'file',
            filePath: opts.file,
            prompt,
          });
          process.stdout.write(JSON.stringify(result));
        } catch (e) {
          rethrowApi(e);
        }
      },
    );

  program
    .command('apply-ai-edit-installed-skill')
    .description('Apply an AI edit preview to an installed skill')
    .argument('<name>', 'skill name')
    .requiredOption('--target <target>', 'install target, e.g. agents/claude/cursor')
    .requiredOption('--payload-base64 <data>', 'base64 encoded JSON payload')
    .option('--scope <scope>', 'project or global', 'project')
    .action(
      (
        name: string,
        opts: {
          target: string;
          payloadBase64: string;
          scope?: 'project' | 'global';
        },
      ) => {
        try {
          const payload = JSON.parse(
            Buffer.from(opts.payloadBase64, 'base64').toString('utf8'),
          ) as { files?: Array<{ path?: string; content?: string }> };
          const result = applyWebInstalledSkillAiEdit(ctx, name.trim(), {
            target: opts.target,
            scope: opts.scope,
            files:
              payload.files?.map((file) => ({
                path: file.path ?? '',
                content: file.content ?? '',
              })) ?? [],
          });
          process.stdout.write(JSON.stringify(result));
        } catch (e) {
          rethrowApi(e);
        }
      },
    );
}
