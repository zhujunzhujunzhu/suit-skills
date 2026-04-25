import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { moduleDir } from '@suit-skills/core';

export function readPkgVersion(): string {
  let dir = moduleDir(import.meta.url);
  for (let i = 0; i < 8; i++) {
    const p = join(dir, 'package.json');
    if (existsSync(p)) {
      return (JSON.parse(readFileSync(p, 'utf8')) as { version: string })
        .version;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.env.SUIT_SKILLS_VERSION ?? '0.0.0';
}
