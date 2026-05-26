import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDefaultConfig } from '../config/index.js';
import type { CloneOrPullRepoResult } from '../sources/git.js';
import {
  getCacheDir,
  getSourceCacheDir,
  refreshCache,
  REFRESH_CACHE_LOCAL_WARNING,
} from './index.js';
import type { Source } from '../types/index.js';

describe('getCacheDir', () => {
  const prevHome = process.env.SUIT_SKILLS_HOME;

  afterEach(() => {
    if (prevHome === undefined) {
      delete process.env.SUIT_SKILLS_HOME;
    } else {
      process.env.SUIT_SKILLS_HOME = prevHome;
    }
  });

  it('测试用例：未设置 SUIT_SKILLS_HOME 时路径以 .suit-skills/cache 结尾', () => {
    delete process.env.SUIT_SKILLS_HOME;
    const fakeHome = join(tmpdir(), 'skills-cli-fake-home');
    const dir = getCacheDir({ homedir: fakeHome });
    expect(dir).toBe(join(fakeHome, '.suit-skills', 'cache'));
    expect(dir.replace(/\\/g, '/')).toMatch(/\.suit-skills\/cache$/);
  });

  it('测试环境：设置 SUIT_SKILLS_HOME 时缓存根为 join(home, cache)', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'skills-cli-cache-home-'));
    process.env.SUIT_SKILLS_HOME = tempRoot;
    try {
      expect(getCacheDir()).toBe(join(tempRoot, 'cache'));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe('getSourceCacheDir', () => {
  const prevHome = process.env.SUIT_SKILLS_HOME;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'skills-cli-cache-src-'));
    process.env.SUIT_SKILLS_HOME = tempRoot;
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    if (prevHome === undefined) {
      delete process.env.SUIT_SKILLS_HOME;
    } else {
      process.env.SUIT_SKILLS_HOME = prevHome;
    }
  });

  it('测试用例 1：首个推荐源 URL → 返回对应缓存目录', () => {
    const url = getDefaultConfig().sources[0]!.url;
    const expectedDir = 'github-com-anthropics-skills';
    expect(getSourceCacheDir(url)).toBe(join(tempRoot, 'cache', expectedDir));
  });

  it('测试用例 2：GitHub URL → 返回对应路径', () => {
    const url = 'https://github.com/org/skills.git';
    expect(getSourceCacheDir(url)).toBe(
      join(tempRoot, 'cache', 'github-com-org-skills'),
    );
  });
});

describe('refreshCache', () => {
  const prevHome = process.env.SUIT_SKILLS_HOME;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'skills-cli-refresh-'));
    process.env.SUIT_SKILLS_HOME = tempRoot;
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    if (prevHome === undefined) {
      delete process.env.SUIT_SKILLS_HOME;
    } else {
      process.env.SUIT_SKILLS_HOME = prevHome;
    }
  });

  it('测试用例 1：首次 clone → freshlyCloned: true', () => {
    const url = 'https://example.com/a.git';
    const path = getSourceCacheDir(url);
    const mock = (
      u: string,
      p: string,
    ): CloneOrPullRepoResult => {
      expect(u).toBe(url);
      expect(p).toBe(path);
      return { path: p, freshlyCloned: true };
    };
    const res = refreshCache(url, { cloneOrPullRepo: mock });
    expect(res).toEqual({ path, freshlyCloned: true });
  });

  it('测试用例 2：非首次 pull → freshlyCloned: false', () => {
    const url = 'https://example.com/b.git';
    const path = getSourceCacheDir(url);
    const mock = (_u: string, p: string): CloneOrPullRepoResult => ({
      path: p,
      freshlyCloned: false,
    });
    const res = refreshCache(url, { cloneOrPullRepo: mock });
    expect(res).toEqual({ path, freshlyCloned: false });
  });

  it('测试用例 3：pull 失败降级 → warning 为约定字符串', () => {
    const url = 'https://example.com/c.git';
    const path = getSourceCacheDir(url);
    const mock = (_u: string, p: string): CloneOrPullRepoResult => ({
      path: p,
      warning: true,
    });
    const res = refreshCache(url, { cloneOrPullRepo: mock });
    expect(res).toEqual({
      path,
      warning: REFRESH_CACHE_LOCAL_WARNING,
    });
    expect('freshlyCloned' in res).toBe(false);
  });

  it('可传入 Source 对象', () => {
    const source: Source = {
      name: 's',
      url: 'https://example.com/d.git',
      enabled: true,
    };
    const path = getSourceCacheDir(source.url);
    const mock = (_u: string, p: string): CloneOrPullRepoResult => ({
      path: p,
      freshlyCloned: true,
    });
    expect(refreshCache(source, { cloneOrPullRepo: mock })).toEqual({
      path,
      freshlyCloned: true,
    });
  });

  it('Source 开启国内镜像时使用镜像 URL 和镜像缓存目录', () => {
    const source: Source = {
      name: 's',
      url: 'https://github.com/org/skills.git',
      enabled: true,
      domesticMirror: {
        url: 'https://gitee.com/org/skills.git',
        enabled: true,
      },
    };
    const path = getSourceCacheDir(source.domesticMirror!.url);
    const mock = (
      u: string,
      p: string,
    ): CloneOrPullRepoResult => {
      expect(u).toBe(source.domesticMirror!.url);
      expect(p).toBe(path);
      return { path: p, freshlyCloned: true };
    };
    expect(refreshCache(source, { cloneOrPullRepo: mock })).toEqual({
      path,
      freshlyCloned: true,
    });
  });
});
