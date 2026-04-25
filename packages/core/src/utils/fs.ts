import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { dirname } from 'node:path';

export function copyDir(src: string, dest: string): void {
  if (!existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }
  cpSync(src, dest, { recursive: true });
}

export function createSymlink(target: string, linkPath: string): void {
  try {
    const stat = lstatSync(linkPath);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      rmSync(linkPath, { recursive: true, force: true });
    }
  } catch {
    // Missing link path is fine.
  }
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(target, linkPath, 'junction');
}

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export function parseVersion(version: string): SemVer {
  const core = version.split('-')[0];
  const parts = core.split('.');
  return {
    major: parseInt(parts[0] ?? '0', 10),
    minor: parseInt(parts[1] ?? '0', 10),
    patch: parseInt(parts[2] ?? '0', 10),
  };
}

function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function eq(a: string, b: string): boolean {
  return compareSemVer(parseVersion(a), parseVersion(b)) === 0;
}

export function gt(a: string, b: string): boolean {
  return compareSemVer(parseVersion(a), parseVersion(b)) > 0;
}
