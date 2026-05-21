import { copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import { resolveDesktopArtifact } from '../lib/web/desktop-artifacts.js';
import { fetchDesktopReleaseManifest } from '../lib/web/desktop-release-manifest.js';

function assertPlatform(value: string): asserts value is 'windows-x86_64' | 'darwin-aarch64' | 'darwin-x86_64' {
  if (
    value !== 'windows-x86_64' &&
    value !== 'darwin-aarch64' &&
    value !== 'darwin-x86_64'
  ) {
    throw new Error(`Unsupported desktop download platform: ${value}`);
  }
}

function openPath(path: string): void {
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', path] : [path];
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

export function registerDesktopDownload(program: Command, ctx: CliContext): void {
  program
    .command('desktop-download')
    .description('Download a desktop installer from the Gitee artifact branch')
    .requiredOption('--platform <platform>', 'desktop platform key')
    .option('--open', 'open the downloaded installer after copying')
    .option('--json', 'output as JSON')
    .action(async (opts: { platform: string; open?: boolean; json?: boolean }) => {
      assertPlatform(opts.platform);
      const manifest = await fetchDesktopReleaseManifest();
      const asset = manifest?.platforms[opts.platform];
      if (!asset) {
        throw new Error(`No desktop asset found for platform "${opts.platform}"`);
      }

      const artifact = resolveDesktopArtifact(asset, ctx.configOptions);
      const downloadDir = join(tmpdir(), 'suit-skills-desktop-downloads');
      mkdirSync(downloadDir, { recursive: true });
      const targetPath = join(downloadDir, basename(artifact.filename));
      copyFileSync(artifact.filePath, targetPath);
      if (opts.open) {
        openPath(targetPath);
      }

      const payload = {
        path: targetPath,
        filename: artifact.filename,
        opened: opts.open === true,
      };
      process.stdout.write(
        opts.json ? JSON.stringify(payload) : `${targetPath}\n`,
      );
    });
}
