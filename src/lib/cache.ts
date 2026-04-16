import { homedir as nodeHomedir } from 'node:os';
import { join } from 'node:path';
import type { Source } from '../types/index.js';
import { urlToCacheDirName } from '../utils/path.js';
import type { ConfigLocationOptions } from './config.js';
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
  | { path: string; warning: string };

export type CloneOrPullRepoFn = typeof cloneOrPullRepo;

export interface RefreshCacheOptions
  extends GitModuleOptions,
    ConfigLocationOptions {
  cloneOrPullRepo?: CloneOrPullRepoFn;
}

export function refreshCache(
  sourceOrUrl: string | Source,
  options?: RefreshCacheOptions,
): RefreshCacheResult {
  const url =
    typeof sourceOrUrl === 'string'
      ? sourceOrUrl.trim()
      : sourceOrUrl.url.trim();
  const path = getSourceCacheDir(url, options);
  const impl = options?.cloneOrPullRepo ?? cloneOrPullRepo;
  const gitOptions: GitModuleOptions | undefined =
    options === undefined
      ? undefined
      : { env: options.env, spawnSync: options.spawnSync };
  const raw = impl(url, path, gitOptions);
  if (raw.warning) {
    return { path: raw.path, warning: REFRESH_CACHE_LOCAL_WARNING };
  }
  return {
    path: raw.path,
    freshlyCloned: raw.freshlyCloned === true,
  };
}
