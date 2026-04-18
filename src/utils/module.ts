import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function moduleDir(metaUrl?: string): string {
  if (metaUrl) {
    return dirname(fileURLToPath(metaUrl));
  }

  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }

  return process.cwd();
}
