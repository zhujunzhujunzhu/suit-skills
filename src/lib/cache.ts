import { existsSync, statSync } from 'node:fs';
import { homedir as nodeHomedir } from 'node:os';
import { join } from 'node:path';
import type { Source } from '../types/index.js';
import { urlToCacheDirName } from '../utils/path.js';
import {
  getEffectiveSourceUrl,
  type ConfigLocationOptions,
} from './config.js';
import {
  cloneOrPullRepo,
  type GitModuleOptions,
} from './git.js';

/** 与阶段 5.3 文档一致的 pull 失败降级提示 */
export const REFRESH_CACHE_LOCAL_WARNING = 'Using local cache...';

export function getCacheDir(options?: ConfigLocationOptions): string {
  const envRoot = process.env.SUIT_SKILLS_HOME?.trim();
  if (envRoot) {
    return join(envRoot, 'cache');
  }
  const home = options?.homedir ?? nodeHomedir();
  return join(home, '.suit-skills', 'cache');
}

export function getSourceCacheDir(
  sourceUrl: string,
  options?: ConfigLocationOptions,
): string {
  return join(getCacheDir(options), urlToCacheDirName(sourceUrl));
}

export type RefreshCacheResult =
  | { path: string; freshlyCloned: boolean }
  | { path: string; skipped: true }
  | { path: string; warning: string };

export type CloneOrPullRepoFn = typeof cloneOrPullRepo;

export interface RefreshCacheOptions
  extends GitModuleOptions,
    ConfigLocationOptions {
  cloneOrPullRepo?: CloneOrPullRepoFn;
  force?: boolean;
  maxAgeMs?: number;
}

function cacheTimestampMs(path: string): number | null {
  for (const candidate of [
    join(path, '.git', 'FETCH_HEAD'),
    join(path, '.git'),
    path,
  ]) {
    if (!existsSync(candidate)) continue;
    try {
      return statSync(candidate).mtimeMs;
    } catch {
      return null;
    }
  }
  return null;
}

function isCacheFresh(path: string, maxAgeMs: number | undefined): boolean {
  if (!maxAgeMs || maxAgeMs <= 0) return false;
  const timestamp = cacheTimestampMs(path);
  if (timestamp === null) return false;
  return Date.now() - timestamp < maxAgeMs;
}

export function refreshCache(
  sourceOrUrl: string | Source,
  options?: RefreshCacheOptions,
): RefreshCacheResult {
  const url =
    typeof sourceOrUrl === 'string'
      ? sourceOrUrl.trim()
      : getEffectiveSourceUrl(sourceOrUrl);
  const path = getSourceCacheDir(url, options);
  if (!options?.force && isCacheFresh(path, options?.maxAgeMs)) {
    return { path, skipped: true };
  }
  const impl = options?.cloneOrPullRepo ?? cloneOrPullRepo;
  const gitOptions: GitModuleOptions | undefined =
    options === undefined
      ? undefined
      : {
          env: options.env,
          spawnSync: options.spawnSync,
          timeoutMs: options.timeoutMs,
        };
  const raw = impl(url, path, gitOptions);
  if (raw.warning) {
    return {
      path: raw.path,
      warning: raw.warningMessage
        ? `${REFRESH_CACHE_LOCAL_WARNING} ${raw.warningMessage}`
        : REFRESH_CACHE_LOCAL_WARNING,
    };
  }
  return {
    path: raw.path,
    freshlyCloned: raw.freshlyCloned === true,
  };
}
