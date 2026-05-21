import { spawn } from 'node:child_process';
import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import { startWebServer } from '../lib/web/server.js';
import { success, warn } from '../utils/output.js';

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('Invalid port');
  }
  return port;
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const command =
    platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args =
    platform === 'win32' ? ['/c', 'start', '', url] : [url];

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', () => {
    warn(`Could not open browser automatically. Open ${url}`);
  });
  child.unref();
}

export function registerWeb(program: Command, ctx: CliContext): void {
  program
    .command('web')
    .description('Start the local Suit Skills Web console')
    .option('--host <host>', 'host to bind', '127.0.0.1')
    .option('--port <port>', 'port to bind', parsePort, 4587)
    .option('--source <name>', 'source name, or "all" for all enabled sources')
    .option('--no-open', 'do not open the browser automatically')
    .action(
      async (opts: {
        host: string;
        port: number;
        source?: string;
        open?: boolean;
      }) => {
        const started = await startWebServer(ctx, {
          host: opts.host,
          port: opts.port,
          source: opts.source,
        });
        success('Suit Skills Web started');
        console.log(`Local: ${started.url}`);
        if (started.attempts !== undefined && started.attempts > 1) {
          console.log(
            `(Port ${started.requestedPort} is busy; using ${started.port})`,
          );
        }
        if (opts.open !== false) {
          openBrowser(started.url);
        }
      },
    );
}
