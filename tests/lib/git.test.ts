import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  isGitAvailable,
  cloneRepo,
  pullRepo,
  cloneOrPullRepo,
  type GitModuleOptions,
  type GitSpawnSync,
} from '../../src/lib/git.js';

const systemGitAvailable = isGitAvailable();

function runGit(args: string[], cwd: string, opts?: GitModuleOptions): void {
  const sync = opts?.spawnSync ?? spawnSync;
  const res = sync('git', args, {
    cwd,
    encoding: 'utf8',
    env: opts?.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (res.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed in ${cwd}: ${res.stderr ?? res.stdout ?? res.error}`,
    );
  }
}

/** 本地裸仓库 + 首次提交，返回 `file://` 形式的 remote URL 与清理根目录 */
function createLocalBareRemote(opts?: GitModuleOptions): {
  root: string;
  bareDir: string;
  url: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'skills-cli-git-remote-'));
  const bareDir = join(root, 'origin.git');
  const seed = join(root, 'seed');
  mkdirSync(seed, { recursive: true });
  runGit(['init', '--bare', bareDir], root, opts);
  runGit(['init', '-b', 'main'], seed, opts);
  runGit(['config', 'user.email', 't@example.test'], seed, opts);
  runGit(['config', 'user.name', 'skills-cli-test'], seed, opts);
  writeFileSync(join(seed, 'f.txt'), 'base\n', 'utf8');
  runGit(['add', 'f.txt'], seed, opts);
  runGit(['commit', '-m', 'init'], seed, opts);
  runGit(['remote', 'add', 'origin', bareDir], seed, opts);
  runGit(['push', '-u', 'origin', 'main'], seed, opts);
  runGit(['symbolic-ref', 'HEAD', 'refs/heads/main'], bareDir, opts);
  const url = pathToFileURL(bareDir).href;
  return { root, bareDir, url };
}

describe('isGitAvailable', () => {
  it.skipIf(!systemGitAvailable)('测试用例 1：git 已安装 → 返回 true', () => {
    expect(isGitAvailable()).toBe(true);
  });

  it('测试用例 2：git 未安装 → 返回 false（通过无效 PATH 模拟）', () => {
    const fakePath = join(
      mkdtempSync(join(tmpdir(), 'skills-cli-no-git-')),
      'no-git-bin',
    );
    mkdirSync(fakePath, { recursive: true });
    expect(
      isGitAvailable({
        env: { ...process.env, PATH: fakePath },
      }),
    ).toBe(false);
  });

  it('测试用例 2（补充）：可注入 spawnSync 强制为 false', () => {
    const fakeSpawn: GitSpawnSync = ((_cmd, _args, _opts) =>
      ({
        status: 1,
        signal: null,
        error: undefined,
        output: [null, '', ''],
        pid: 0,
        stdout: '',
        stderr: '',
      }) as ReturnType<typeof spawnSync>) as GitSpawnSync;

    expect(isGitAvailable({ spawnSync: fakeSpawn })).toBe(false);
  });
});

describe('cloneRepo', () => {
  let remoteRoot: string | undefined;

  afterEach(() => {
    if (remoteRoot) {
      rmSync(remoteRoot, { recursive: true, force: true });
      remoteRoot = undefined;
    }
  });

  it.skipIf(!systemGitAvailable)('测试用例 1：合法 URL + 空目标目录 → clone 成功，目录非空', () => {
    const { root, url } = createLocalBareRemote();
    remoteRoot = root;
    const dest = join(root, 'cloned');
    cloneRepo(url, dest);
    expect(readdirSync(dest).length).toBeGreaterThan(0);
  });

  it.skipIf(!systemGitAvailable)('测试用例 2：非法 URL → 抛出错误且信息明确', () => {
    const work = mkdtempSync(join(tmpdir(), 'skills-cli-git-badurl-'));
    try {
      const dest = join(work, 'dest');
      expect(() => cloneRepo('https://???', dest)).toThrow(/Invalid git repository URL/i);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it.skipIf(!systemGitAvailable)('测试用例 3：目标目录已存在且有内容 → 抛出错误', () => {
    const { root, url } = createLocalBareRemote();
    remoteRoot = root;
    const dest = join(root, 'occupied');
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, 'x.txt'), '1', 'utf8');
    expect(() => cloneRepo(url, dest)).toThrow(/非空/);
  });
});

describe('pullRepo', () => {
  let remoteRoot: string | undefined;

  afterEach(() => {
    if (remoteRoot) {
      rmSync(remoteRoot, { recursive: true, force: true });
      remoteRoot = undefined;
    }
  });

  it.skipIf(!systemGitAvailable)('测试用例 1：正常仓库 → pull 成功', () => {
    const { root, url } = createLocalBareRemote();
    remoteRoot = root;
    const cloneDir = join(root, 'clone');
    cloneRepo(url, cloneDir);
    const pulled = pullRepo(cloneDir);
    expect(pulled).toEqual({ ok: true });
  });

  it.skipIf(!systemGitAvailable)('测试用例 2：本地与远端分叉导致 pull 失败 → ok 为 false 且含错误信息', () => {
    const { root, url } = createLocalBareRemote();
    remoteRoot = root;
    const actor = join(root, 'actor');
    const pusher = join(root, 'pusher');
    cloneRepo(url, actor);
    cloneRepo(url, pusher);

    runGit(['config', 'user.email', 'p@example.test'], pusher);
    runGit(['config', 'user.name', 'pusher'], pusher);
    writeFileSync(join(pusher, 'f.txt'), 'remote\n', 'utf8');
    runGit(['add', 'f.txt'], pusher);
    runGit(['commit', '-m', 'remote'], pusher);
    runGit(['push'], pusher);

    runGit(['config', 'user.email', 'a@example.test'], actor);
    runGit(['config', 'user.name', 'actor'], actor);
    writeFileSync(join(actor, 'f.txt'), 'local\n', 'utf8');
    runGit(['add', 'f.txt'], actor);
    runGit(['commit', '-m', 'local'], actor);

    const pulled = pullRepo(actor);
    expect(pulled.ok).toBe(false);
    expect(pulled.error).toBeTruthy();
  });

  it('测试用例 3：目录不是 git 仓库 → 返回失败标志', () => {
    const empty = mkdtempSync(join(tmpdir(), 'skills-cli-not-git-'));
    try {
      const pulled = pullRepo(empty);
      expect(pulled.ok).toBe(false);
      expect(pulled.error).toMatch(/不是有效的 git 工作区/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('cloneOrPullRepo', () => {
  let remoteRoot: string | undefined;

  afterEach(() => {
    if (remoteRoot) {
      rmSync(remoteRoot, { recursive: true, force: true });
      remoteRoot = undefined;
    }
  });

  it.skipIf(!systemGitAvailable)('测试用例 1：缓存目录不存在 → 执行 clone', () => {
    const { root, url } = createLocalBareRemote();
    remoteRoot = root;
    const cacheDir = join(root, 'cache', 'repo');
    const res = cloneOrPullRepo(url, cacheDir);
    expect(res.path).toBe(cacheDir);
    expect(res.warning).toBeUndefined();
    expect(res.freshlyCloned).toBe(true);
    expect(existsSync(join(cacheDir, '.git'))).toBe(true);
    expect(readdirSync(cacheDir).length).toBeGreaterThan(0);
  });

  it.skipIf(!systemGitAvailable)('测试用例 2：缓存目录已存在 → 执行 pull', () => {
    const { root, url } = createLocalBareRemote();
    remoteRoot = root;
    const cacheDir = join(root, 'cache');
    cloneRepo(url, cacheDir);
    const res = cloneOrPullRepo(url, cacheDir);
    expect(res.path).toBe(cacheDir);
    expect(res.warning).toBeUndefined();
    expect(res.freshlyCloned).toBe(false);
  });

  it.skipIf(!systemGitAvailable)('测试用例 3：pull 失败 → 仍返回缓存路径且 warning 为 true', () => {
    const { root, url } = createLocalBareRemote();
    remoteRoot = root;
    const cacheDir = join(root, 'cache');
    cloneRepo(url, cacheDir);

    const pusher = join(root, 'pusher');
    cloneRepo(url, pusher);
    runGit(['config', 'user.email', 'p2@example.test'], pusher);
    runGit(['config', 'user.name', 'pusher2'], pusher);
    writeFileSync(join(pusher, 'f.txt'), 'remote2\n', 'utf8');
    runGit(['add', 'f.txt'], pusher);
    runGit(['commit', '-m', 'remote2'], pusher);
    runGit(['push'], pusher);

    runGit(['config', 'user.email', 'a2@example.test'], cacheDir);
    runGit(['config', 'user.name', 'actor2'], cacheDir);
    writeFileSync(join(cacheDir, 'f.txt'), 'local2\n', 'utf8');
    runGit(['add', 'f.txt'], cacheDir);
    runGit(['commit', '-m', 'local2'], cacheDir);

    const res = cloneOrPullRepo(url, cacheDir);
    expect(res.path).toBe(cacheDir);
    expect(res.warning).toBe(true);
    expect(res.freshlyCloned).toBeUndefined();
  });

  it('测试用例 4：git 不可用 → 抛出明确错误提示安装 git', () => {
    const fakeSpawn: GitSpawnSync = ((_cmd, _args, _opts) =>
      ({
        status: 1,
        signal: null,
        error: new Error('ENOENT'),
        output: [null, '', ''],
        pid: 0,
        stdout: '',
        stderr: 'git: not found',
      }) as ReturnType<typeof spawnSync>) as GitSpawnSync;

    expect(() =>
      cloneOrPullRepo('https://example.com/repo.git', join(tmpdir(), 'x-cache'), {
        spawnSync: fakeSpawn,
      }),
    ).toThrow(/未检测到可用的 git 命令/);
  });
});
