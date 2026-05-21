import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import {
  getCacheDir,
  type ConfigLocationOptions,
  type GitModuleOptions,
} from '@suit-skills/core';
import type { DesktopReleaseAsset } from './desktop-release-manifest.js';

export const DEFAULT_DESKTOP_ARTIFACT_REPO =
  'https://gitee.com/zhujun12/suit-skills-cli.git';
export const DEFAULT_DESKTOP_ARTIFACT_BRANCH = 'desktop-artifacts';

export interface ResolvedDesktopArtifact {
  filePath: string;
  filename: string;
  contentLength: number;
}

export interface ResolveDesktopArtifactOptions
  extends ConfigLocationOptions,
    GitModuleOptions {
  cacheRoot?: string;
}

function isSafeRelativePath(path: string): boolean {
  if (!path || path.includes('\0')) return false;
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('/') || path.startsWith('\\')) {
    return false;
  }
  const normalized = normalize(path);
  return (
    normalized !== '..' &&
    !normalized.startsWith(`..${sep}`) &&
    !normalized.split(sep).includes('..')
  );
}

function assertInside(parent: string, child: string): void {
  const root = resolve(parent);
  const target = resolve(child);
  const relative = target.slice(root.length);
  if (target !== root && !relative.startsWith(sep)) {
    throw new Error(`Desktop artifact path escapes cache: ${child}`);
  }
}

function artifactCacheRoot(options?: ResolveDesktopArtifactOptions): string {
  return (
    options?.cacheRoot ??
    join(getCacheDir(options), '__desktop-artifacts__')
  );
}

function runGit(
  args: string[],
  cwd: string | undefined,
  options: ResolveDesktopArtifactOptions | undefined,
): ReturnType<typeof spawnSync> {
  return (options?.spawnSync ?? spawnSync)('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...(options?.env ?? process.env),
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options?.timeoutMs ?? 180_000,
    killSignal: 'SIGTERM',
    windowsHide: true,
  });
}

function gitFailure(operation: string, result: ReturnType<typeof spawnSync>): Error {
  const stderr = (result.stderr ?? '').toString().trim();
  const stdout = (result.stdout ?? '').toString().trim();
  const detail = stderr || stdout || result.error?.message || 'unknown error';
  return new Error(`${operation} failed: ${detail}`);
}

function ensureArtifactRepo(
  repo: string,
  branch: string,
  destDir: string,
  artifactPath: string,
  options?: ResolveDesktopArtifactOptions,
): void {
  const gitDir = join(destDir, '.git');
  if (!existsSync(gitDir)) {
    rmSync(destDir, { recursive: true, force: true });
    mkdirSync(dirname(destDir), { recursive: true });
    const clone = runGit(
      [
        'clone',
        '--depth=1',
        '--filter=blob:none',
        '--sparse',
        '--single-branch',
        '--branch',
        branch,
        repo,
        destDir,
      ],
      undefined,
      options,
    );
    if (clone.status !== 0) {
      rmSync(destDir, { recursive: true, force: true });
      const fallback = runGit(
        ['clone', '--depth=1', '--single-branch', '--branch', branch, repo, destDir],
        undefined,
        options,
      );
      if (fallback.status !== 0) {
        rmSync(destDir, { recursive: true, force: true });
        throw gitFailure(`git clone (${repo}#${branch})`, fallback);
      }
    }
  } else {
    const fetch = runGit(['fetch', '--depth=1', 'origin', branch], destDir, options);
    if (fetch.status !== 0) {
      throw gitFailure(`git fetch (${repo}#${branch})`, fetch);
    }

    const checkout = runGit(['checkout', '-B', branch, 'FETCH_HEAD'], destDir, options);
    if (checkout.status !== 0) {
      throw gitFailure(`git checkout (${branch})`, checkout);
    }
  }

  const sparse = runGit(
    ['sparse-checkout', 'set', '--no-cone', artifactPath],
    destDir,
    options,
  );
  if (sparse.status !== 0) {
    const disableSparse = runGit(['sparse-checkout', 'disable'], destDir, options);
    if (disableSparse.status !== 0) {
      throw gitFailure('git sparse-checkout', sparse);
    }
  }

  const clean = runGit(['clean', '-fdx'], destDir, options);
  if (clean.status !== 0) {
    throw gitFailure('git clean', clean);
  }
}

function resolveRepoDir(
  repo: string,
  branch: string,
  artifactPath: string,
  options?: ResolveDesktopArtifactOptions,
): string {
  if (existsSync(repo) && statSync(repo).isDirectory()) {
    return repo;
  }

  const repoDir = join(artifactCacheRoot(options), branch);
  ensureArtifactRepo(repo, branch, repoDir, artifactPath, options);
  return repoDir;
}

function inferArtifactPath(asset: DesktopReleaseAsset): string | null {
  if (asset.path) return asset.path;
  if (!asset.url) return null;
  try {
    const url = new URL(asset.url);
    const decoded = decodeURIComponent(url.pathname);
    const jsdelivrPrefix = '/gh/zhujunzhujunzhu/suit-skills@desktop-artifacts/';
    const githubRawPrefix = '/zhujunzhujunzhu/suit-skills/desktop-artifacts/';
    if (url.hostname === 'cdn.jsdelivr.net' && decoded.startsWith(jsdelivrPrefix)) {
      return decoded.slice(jsdelivrPrefix.length);
    }
    if (url.hostname === 'raw.githubusercontent.com' && decoded.startsWith(githubRawPrefix)) {
      return decoded.slice(githubRawPrefix.length);
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveDesktopArtifact(
  asset: DesktopReleaseAsset,
  options?: ResolveDesktopArtifactOptions,
): ResolvedDesktopArtifact {
  const artifactPath = inferArtifactPath(asset);
  if (!artifactPath || !isSafeRelativePath(artifactPath)) {
    throw new Error(`Invalid desktop artifact path for ${asset.filename}`);
  }

  const repo = asset.repo?.trim() || DEFAULT_DESKTOP_ARTIFACT_REPO;
  const branch = asset.branch?.trim() || DEFAULT_DESKTOP_ARTIFACT_BRANCH;
  const repoDir = resolveRepoDir(repo, branch, artifactPath, options);

  const filePath = resolve(repoDir, artifactPath);
  assertInside(repoDir, filePath);
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    throw new Error(`Desktop artifact not found: ${artifactPath}`);
  }

  return {
    filePath,
    filename: asset.filename,
    contentLength: statSync(filePath).size,
  };
}
