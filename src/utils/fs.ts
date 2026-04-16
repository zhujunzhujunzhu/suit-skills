import { cpSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

/** 递归拷贝目录 */
export function copyDir(src: string, dest: string): void {
  if (!existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }
  cpSync(src, dest, { recursive: true });
}

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

/**
 * 解析语义化版本号，只取 major.minor.patch 部分。
 * 预发布标签（如 -beta）会被忽略。
 */
export function parseVersion(version: string): SemVer {
  const core = version.split('-')[0]; // 去掉预发布标签
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

/** 版本 a > 版本 b */
export function gt(a: string, b: string): boolean {
  return compareSemVer(parseVersion(a), parseVersion(b)) > 0;
}

/** 版本 a === 版本 b */
export function eq(a: string, b: string): boolean {
  return compareSemVer(parseVersion(a), parseVersion(b)) === 0;
}
