import { cpSync, readFileSync, existsSync, symlinkSync, lstatSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/** 递归拷贝目录 */
export function copyDir(src: string, dest: string): void {
  if (!existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }
  cpSync(src, dest, { recursive: true });
}

/**
 * 创建软链接（目录）
 * Windows 需要管理员权限或开发者模式
 * @param target 链接指向的目标（真实目录）
 * @param linkPath 软链接路径
 */
export function createSymlink(target: string, linkPath: string): void {
  // 如果链接路径已存在，先删除
  try {
    const stat = lstatSync(linkPath);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      rmSync(linkPath, { recursive: true, force: true });
    }
  } catch {
    // 文件不存在，忽略
  }
  // 确保父目录存在
  const parent = dirname(linkPath);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
  // 创建软链接（Windows 使用 'junction' 类型）
  symlinkSync(target, linkPath, 'junction');
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
