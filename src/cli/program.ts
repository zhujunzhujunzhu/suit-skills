import { Command } from 'commander';
import type { CliContext } from './context.js';
import { readPkgVersion } from './version.js';
import { registerList } from '../commands/list.js';
import { registerSearch } from '../commands/search.js';
import { registerInfo } from '../commands/info.js';
import { registerInstall } from '../commands/install.js';
import { registerInstalled } from '../commands/installed.js';
import { registerUpdate } from '../commands/update.js';
import { registerRemove } from '../commands/remove.js';
import { registerSource } from '../commands/source.js';
import { registerConfig } from '../commands/config-cmd.js';
import { registerEnv } from '../commands/env.js';

export function buildProgram(ctx: CliContext): Command {
  const program = new Command();
  program
    .name('suit-skills')
    .description('CLI tool for managing Suit skills')
    .version(readPkgVersion());

  registerList(program, ctx);
  registerSearch(program, ctx);
  registerInfo(program, ctx);
  registerInstall(program, ctx);
  registerInstalled(program, ctx);
  registerUpdate(program, ctx);
  registerRemove(program, ctx);
  registerSource(program, ctx);
  registerConfig(program, ctx);
  registerEnv(program, ctx);

  return program;
}
