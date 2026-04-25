import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type GitSpawnSync = typeof spawnSync;

export interface GitModuleOptions {
  /** 覆盖环境变量（测试可用无效 PATH 模拟未安装 git） */
  env?: NodeJS.ProcessEnv;
  /** 测试注入：替代 `spawnSync` */
  spawnSync?: GitSpawnSync;
  /** Git 子进程超时时间，默认 30 秒 */
  timeoutMs?: number;
}

export interface PullRepoResult {
  ok: boolean;
  error?: string;
}

export interface CloneOrPullRepoResult {
  path: string;
  /** pull 失败但保留本地缓存时为 `true`（阶段 4.4） */
  warning?: boolean;
  warningMessage?: string;
  /** 本次调用是否执行了全新 clone（非 pull） */
  freshlyCloned?: boolean;
}

export const DEFAULT_GIT_TIMEOUT_MS = 30_000;

function getSpawn(options?: GitModuleOptions): GitSpawnSync {
  return options?.spawnSync ?? spawnSync;
}

function spawnGit(
  args: string[],
  cwd: string | undefined,
  options: GitModuleOptions | undefined,
): ReturnType<GitSpawnSync> {
  const sync = getSpawn(options);
  const env = {
    ...(options?.env ?? process.env),
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
  };
  return sync('git', args, {
    cwd,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options?.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
    killSignal: 'SIGTERM',
    windowsHide: true,
  });
}

/** 是否为工作区根下的有效 Git 目录（存在 `.git`） */
function isGitWorkTree(dir: string): boolean {
  return existsSync(join(dir, '.git'));
}

function assertValidRemoteUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error('Invalid git repository URL: URL is empty.');
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('file:')) {
    try {
      new URL(trimmed);
    } catch {
      throw new Error(
        `Invalid git repository URL: malformed address (${trimmed}).`,
      );
    }
    return;
  }

  if (trimmed.startsWith('git@')) {
    const at = trimmed.indexOf('@');
    const colon = trimmed.indexOf(':', at + 1);
    if (colon === -1 || colon === trimmed.length - 1) {
      throw new Error(
        `Invalid git repository URL: expected git@host:path (${trimmed}).`,
      );
    }
    return;
  }

  // 本地路径形式的 remote（测试 file 路径 clone）
}

function assertDestDirEmptyOrAbsent(destDir: string): void {
  if (!existsSync(destDir)) {
    return;
  }
  const entries = readdirSync(destDir);
  if (entries.length > 0) {
    throw new Error(
      `目标目录已存在且非空，无法执行 git clone：${destDir}`,
    );
  }
}

function isTimeoutResult(result: ReturnType<GitSpawnSync>): boolean {
  const error = result.error as (Error & { code?: string }) | undefined;
  return error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM';
}

function formatGitFailure(
  operation: string,
  result: ReturnType<GitSpawnSync>,
  options?: GitModuleOptions,
): string {
  const stderr = (result.stderr ?? '').toString().trim();
  const stdout = (result.stdout ?? '').toString().trim();
  const hint = stderr || stdout || (result.error?.message ?? 'unknown error');
  if (isTimeoutResult(result)) {
    const seconds = Math.round(
      (options?.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS) / 1000,
    );
    return `${operation} timed out after ${seconds}s. Please check the network or switch the source mirror. ${hint}`;
  }
  return `${operation} failed: ${hint}`;
}

/** 检测系统是否有可用的 `git`（如 `git --version`）。 */
export function isGitAvailable(options?: GitModuleOptions): boolean {
  const result = spawnGit(['--version'], undefined, options);
  return result.status === 0;
}

function assertGitAvailable(options?: GitModuleOptions): void {
  if (!isGitAvailable(options)) {
    throw new Error(
      '未检测到可用的 git 命令：请先安装 Git，并确保其在 PATH 中可被调用。',
    );
  }
}

/**
 * `git clone` 到目标目录；目标必须不存在或为空目录。
 * 非法 URL 会抛出带明确信息的错误。
 */
export function cloneRepo(
  url: string,
  destDir: string,
  options?: GitModuleOptions,
): void {
  assertGitAvailable(options);
  assertValidRemoteUrl(url);
  const canCleanDestAfterFailure =
    !existsSync(destDir) || readdirSync(destDir).length === 0;
  assertDestDirEmptyOrAbsent(destDir);

  mkdirSync(dirname(destDir), { recursive: true });

  const result = spawnGit(['clone', url, destDir], undefined, options);
  if (result.status !== 0) {
    if (canCleanDestAfterFailure) {
      rmSync(destDir, { recursive: true, force: true });
    }
    throw new Error(formatGitFailure(`git clone (${url} -> ${destDir})`, result, options));
  }
}

/** 在已是 git 仓库的工作区目录执行 `git pull`。 */
export function pullRepo(
  repoDir: string,
  options?: GitModuleOptions,
): PullRepoResult {
  if (!existsSync(repoDir)) {
    return { ok: false, error: `仓库目录不存在：${repoDir}` };
  }
  if (!isGitWorkTree(repoDir)) {
    return { ok: false, error: `不是有效的 git 工作区：${repoDir}` };
  }

  const result = spawnGit(['pull', '--ff-only'], repoDir, options);
  if (result.status === 0) {
    return { ok: true };
  }
  return {
    ok: false,
    error: formatGitFailure('git pull', result, options),
  };
}

/**
 * 若 `cacheDir` 下还不是有效 git 仓库（或不存在）则 clone；否则 pull。
 * pull 失败时仍返回缓存路径并带 `warning: true`。
 * git 不可用时抛出错误（提示安装 git）。
 */
export function cloneOrPullRepo(
  url: string,
  cacheDir: string,
  options?: GitModuleOptions,
): CloneOrPullRepoResult {
  assertGitAvailable(options);

  if (!isGitWorkTree(cacheDir)) {
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true, force: true });
    }
    cloneRepo(url, cacheDir, options);
    return { path: cacheDir, freshlyCloned: true };
  }

  const pulled = pullRepo(cacheDir, options);
  if (!pulled.ok) {
    return { path: cacheDir, warning: true, warningMessage: pulled.error };
  }
  return { path: cacheDir, freshlyCloned: false };
}
