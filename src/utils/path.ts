import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 将 Git 仓库 URL 转换为缓存目录名。
 * - 去掉协议前缀（https://、git@）
 * - 去掉 .git 后缀
 * - 将 : / . _ 替换为短横线
 */
export function urlToCacheDirName(url: string): string {
  let cleaned = url;

  // 去掉 git@ 前缀
  if (cleaned.startsWith('git@')) {
    cleaned = cleaned.slice('git@'.length);
  }

  // 去掉协议
  cleaned = cleaned.replace(/^https?:\/\//, '');

  // 去掉 .git 后缀
  if (cleaned.endsWith('.git')) {
    cleaned = cleaned.slice(0, -'.git'.length);
  }

  // 将 : / . _ 替换为短横线
  return cleaned.replace(/[:/._]/g, '-');
}

/** 确保目录存在，不存在则递归创建 */
export function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}
