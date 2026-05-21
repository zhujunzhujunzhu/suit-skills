import { buildProgram } from './program.js';
import { createDefaultCliContext } from './context.js';
import type { CliContext } from './context.js';

export async function runCliProcess(): Promise<void> {
  const ctx = createDefaultCliContext();
  const program = buildProgram(ctx);
  await program.parseAsync(process.argv);
}

/** 测试用：`from: user`；请先对 program 调用 `exitOverride()` */
export async function runCliUserArgs(
  program: ReturnType<typeof buildProgram>,
  args: string[],
): Promise<void> {
  await program.parseAsync(args, { from: 'user' });
}

export function createProgramForTest(ctx: CliContext): ReturnType<
  typeof buildProgram
> {
  const program = buildProgram(ctx);
  program.exitOverride();
  return program;
}
