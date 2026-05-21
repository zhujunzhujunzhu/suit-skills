import { mkdirSync } from 'node:fs';

export function urlToCacheDirName(url: string): string {
  let cleaned = url;

  if (cleaned.startsWith('git@')) {
    cleaned = cleaned.slice('git@'.length);
  }

  cleaned = cleaned.replace(/^https?:\/\//, '');

  if (cleaned.endsWith('.git')) {
    cleaned = cleaned.slice(0, -'.git'.length);
  }

  return cleaned.replace(/[:/._]/g, '-');
}

export function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}
