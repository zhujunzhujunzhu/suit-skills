import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import { fetchDesktopReleaseManifestText } from '../lib/web/desktop-release-manifest.js';

/**
 * 供桌面端 sidecar 调用：将上游清单 JSON 原样写入 stdout（不含其它日志）。
 */
export function registerDesktopReleaseManifest(program: Command, _ctx: CliContext): void {
  program
    .command('desktop-release-manifest')
    .description('Print desktop artifact manifest JSON from the upstream registry (for desktop app)')
    .action(async () => {
      const text = await fetchDesktopReleaseManifestText();
      if (text === null) {
        process.exitCode = 1;
        return;
      }
      process.stdout.write(text);
    });
}
